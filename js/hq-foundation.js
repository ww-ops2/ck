/**
 * HQ Foundation Engine - v5.95 (Phase 1 of group inventory upgrade)
 * =================================================================
 * PURPOSE
 *   Headquarters-only inventory foundation: usage category dictionary,
 *   8-segment stock ledger, and a single posting engine driven by documents.
 *
 * CRITICAL SAFETY CONTRACT (train subject must stay unaffected):
 *   1. This file defines ONLY namespaced functions; no top-level side effects.
 *   2. Every public method calls _assertHQ() first. If current subject is not
 *      'hq', it returns immediately WITHOUT reading or writing any table.
 *   3. New tables are accessed through _rawSupabase() (the raw, un-scoped
 *      client) with an EXPLICIT .eq('subject','hq'). We intentionally do NOT
 *      add the new tables to SUBJECT_SCOPED_TABLES in supabase-db.js, so the
 *      existing Proxy logic that train relies on is NOT touched at all.
 *   4. No existing function, call site, table, or row is modified by this file.
 *
 * BALANCE RULE (locked, the only conserved formula):
 *   opening + purchase_in + recovery_in = available + locked + consume_scrap
 *   where physical = opening + purchase_in + recovery_in - consume_scrap
 *         available = physical - locked
 * =================================================================
 */
(function (global) {
  'use strict';

  var SUBJECT = 'hq';

  /** Resolve helpers defensively so this module works even if load order shifts. */
  function _curSubject() {
    try {
      if (global.getCurrentSubject) return global.getCurrentSubject();
      if (typeof getCurrentSubject === 'function') return getCurrentSubject();
    } catch (e) {}
    return null;
  }
  function _raw() {
    try {
      if (global._rawSupabase) return global._rawSupabase();
      if (typeof _rawSupabase === 'function') return _rawSupabase();
    } catch (e) {}
    return null;
  }
  /** Guard: returns true only under HQ subject. No table I/O happens before this. */
  function _assertHQ() {
    return _curSubject() === SUBJECT;
  }

  /** 11 document posting rules. Each maps doc_type -> per-segment delta signs. */
  var POSTING_RULES = {
    purchase_acceptance: { label: '采购申请入库验收单', seg: 'purchase_in',   sign: +1, physical: +1, locked: 0 },
    recovery_acceptance: { label: '物料回收入库验收单', seg: 'recovery_in',   sign: +1, physical: +1, locked: 0 },
    win_register:        { label: '直播中奖登记单',     seg: null,            sign: 0,  physical: 0,  locked: +1 },
    prize_ship:          { label: '奖品邮寄出库确认单', seg: 'consume_scrap', sign: +1, physical: -1, locked: -1 },
    tour_signoff:        { label: '出库领用签收单',     seg: null,            sign: 0,  physical: -1, locked: 0, in_transit: +1 },
    tour_verify:         { label: '团后核销确认单',     seg: 'consume_scrap', sign: +1, physical: 0,  locked: 0, in_transit: -1 },
    cross_tour_transfer: { label: '跨团流转审批单',     seg: null,            sign: 0,  physical: 0,  locked: 0, note: 'only binding/owner change' },
    admin_loan:          { label: '行政物料申领',       seg: null,            sign: 0,  physical: -1, locked: 0, in_transit: +1 },
    admin_return:        { label: '行政物料归还',       seg: 'recovery_in',   sign: +1, physical: +1, locked: 0, in_transit: -1 },
    inter_usage_transfer:{ label: '用途间调拨审批单',   seg: null,            sign: 0,  physical: 0,  locked: 0, note: 'two-sided, per-subject posting' },
    stocktake_confirm:   { label: '盘点确认单',         seg: null,            sign: 0,  physical: 0,  locked: 0, note: 'surplus->recovery_in, deficit->consume_scrap' }
  };

  function _num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function _round(n) { return Math.round(n * 1000) / 1000; }

  /** Recompute physical/available and verify the conserved balance. */
  function _recalc(row) {
    var opening = _num(row.opening_qty);
    var pin = _num(row.purchase_in_qty);
    var rin = _num(row.recovery_in_qty);
    var cs = _num(row.consume_scrap_qty);
    var locked = _num(row.locked_qty);
    var physical = _round(opening + pin + rin - cs);
    var available = _round(physical - locked);
    var left = _round(opening + pin + rin);
    var right = _round(available + locked + cs);
    return {
      physical_qty: physical,
      available_qty: available,
      _left: left,
      _right: right,
      _balanced: Math.abs(left - right) < 0.0005 && available >= -0.0005 && locked >= -0.0005
    };
  }

  // ---------------------------------------------------------------
  // Usage category dictionary
  // ---------------------------------------------------------------
  async function listCategories() {
    if (!_assertHQ()) return { ok: true, data: [], skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var res = await sb.from('usage_categories').select('*')
      .eq('subject', SUBJECT).order('sort_order', { ascending: true });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, data: res.data || [] };
  }

  async function addCategory(code, name, sortOrder) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    if (!code || !name) return { ok: false, error: 'code and name required' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var res = await sb.from('usage_categories').insert({
      subject: SUBJECT, code: code, name: name,
      sort_order: sortOrder == null ? 99 : sortOrder
    }, { onConflict: 'subject,code' });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true };
  }

  async function setCategoryActive(code, isActive) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var res = await sb.from('usage_categories').update({ is_active: !!isActive })
      .eq('subject', SUBJECT).eq('code', code);
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true };
  }

  // ---------------------------------------------------------------
  // Stock ledger read
  // ---------------------------------------------------------------
  async function listLedger(period, usageCode) {
    if (!_assertHQ()) return { ok: true, data: [], skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var q = sb.from('stock_ledger').select('*').eq('subject', SUBJECT);
    if (period) q = q.eq('period', period);
    if (usageCode) q = q.eq('usage_code', usageCode);
    var res = await q.order('item_name', { ascending: true });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, data: res.data || [] };
  }

  /** Ensure a ledger row exists; returns the row (not mutated). */
  async function ensureRow(period, usageCode, item) {
    if (!_assertHQ()) return { ok: false, skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var itemId = item.item_id || null;
    var q = sb.from('stock_ledger').select('*')
      .eq('subject', SUBJECT).eq('period', period).eq('usage_code', usageCode);
    q = itemId ? q.eq('item_id', itemId) : q.is('item_id', null);
    var res = await q.maybeSingle();
    if (res.error) return { ok: false, error: res.error.message };
    if (res.data) return { ok: true, data: res.data };

    var payload = {
      subject: SUBJECT, period: period, usage_code: usageCode,
      item_id: itemId, sku: item.sku || null, item_name: item.item_name || null,
      spec: item.spec || null, brand: item.brand || null,
      zone: item.zone || null, owner: item.owner || null,
      safety_qty: _num(item.safety_qty)
    };
    var ins = await sb.from('stock_ledger').insert(payload).select('*').maybeSingle();
    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true, data: ins.data, created: true };
  }

  /**
   * POST a document. qty is always a positive magnitude; the rule decides sign.
   * This is the ONLY path that changes ledger quantities.
   */
  async function postDocument(doc) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var rule = POSTING_RULES[doc.doc_type];
    if (!rule) return { ok: false, error: 'unknown doc_type: ' + doc.doc_type };
    var qty = Math.abs(_num(doc.qty));
    if (qty <= 0) return { ok: false, error: 'qty must be > 0' };
    if (!doc.period || !doc.usage_code) return { ok: false, error: 'period and usage_code required' };

    var ens = await ensureRow(doc.period, doc.usage_code, doc.item || {});
    if (!ens.ok) return ens;
    var row = ens.data;
    var next = Object.assign({}, row);

    // apply flow segment delta
    if (rule.seg) {
      var segField = rule.seg + '_qty';
      next[segField] = _round(_num(next[segField]) + rule.sign * qty);
    }
    // stocktake is special: surplus/deficit given explicitly
    if (doc.doc_type === 'stocktake_confirm') {
      var diff = _num(doc.adjust_qty); // positive=surplus, negative=deficit
      if (diff > 0) next.recovery_in_qty = _round(_num(next.recovery_in_qty) + diff);
      else if (diff < 0) next.consume_scrap_qty = _round(_num(next.consume_scrap_qty) + Math.abs(diff));
      qty = Math.abs(diff);
    }
    // physical & locked deltas
    next.physical_qty = _round(_num(next.physical_qty) + rule.physical * qty);
    next.locked_qty = _round(_num(next.locked_qty) + rule.locked * qty);
    if (rule.in_transit) next._in_transit = _round(_num(next._in_transit) + rule.in_transit * qty);
    next.bound_doc = doc.doc_no || null;
    next.updated_at = new Date().toISOString();

    var calc = _recalc(next);
    next.physical_qty = calc.physical_qty;    // authoritative recompute
    next.available_qty = calc.available_qty;
    next.reconcile_flag = calc._balanced ? 'balanced' : 'error';

    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var upd = await sb.from('stock_ledger').update({
      purchase_in_qty: next.purchase_in_qty,
      recovery_in_qty: next.recovery_in_qty,
      consume_scrap_qty: next.consume_scrap_qty,
      physical_qty: next.physical_qty,
      locked_qty: next.locked_qty,
      available_qty: next.available_qty,
      bound_doc: next.bound_doc,
      reconcile_flag: next.reconcile_flag,
      updated_at: next.updated_at
    }).eq('subject', SUBJECT).eq('id', row.id);
    if (upd.error) return { ok: false, error: upd.error.message };

    var journal = {
      subject: SUBJECT, doc_type: doc.doc_type,
      doc_no: doc.doc_no || '', period: doc.period,
      usage_code: doc.usage_code, item_id: row.item_id || null,
      sku: row.sku || null, qty: qty,
      deltas: { seg: rule.seg || null, sign: rule.sign, physical: rule.physical, locked: rule.locked, qty: qty },
      balance_snapshot: {
        opening_qty: next.opening_qty, purchase_in_qty: next.purchase_in_qty,
        recovery_in_qty: next.recovery_in_qty, consume_scrap_qty: next.consume_scrap_qty,
        physical_qty: next.physical_qty, locked_qty: next.locked_qty,
        available_qty: next.available_qty, reconcile_flag: next.reconcile_flag
      },
      operator: (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || doc.operator || null
    };
    await sb.from('posting_journal').insert(journal);

    return { ok: true, row: next, balanced: calc._balanced, left: calc._left, right: calc._right };
  }

  /** Reverse a previous posting (audit-friendly: new negative entry, no history edit). */
  async function reverseDocument(docNo, reason) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var res = await sb.from('posting_journal').select('*')
      .eq('subject', SUBJECT).eq('doc_no', docNo).order('created_at', { ascending: true });
    if (res.error) return { ok: false, error: res.error.message };
    if (!res.data || !res.data.length) return { ok: false, error: 'doc not found in journal: ' + docNo };
    var results = [];
    for (var i = 0; i < res.data.length; i++) {
      var j = res.data[i];
      var revRule = Object.assign({}, POSTING_RULES[j.doc_type] || {});
      revRule.sign = -revRule.sign; revRule.physical = -revRule.physical; revRule.locked = -revRule.locked;
      var revDoc = {
        doc_type: j.doc_type, doc_no: 'RV-' + docNo, period: j.period,
        usage_code: j.usage_code, item: { item_id: j.item_id, sku: j.sku },
        qty: _num(j.qty), operator: (reason || 'reverse') + ' / ' + j.operator
      };
      var r = await postDocumentSigned(revDoc, revRule);
      results.push(r);
    }
    return { ok: true, results: results };
  }

  /** Internal: post with an explicit (possibly inverted) rule. */
  async function postDocumentSigned(doc, rule) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var qty = Math.abs(_num(doc.qty));
    var ens = await ensureRow(doc.period, doc.usage_code, doc.item || {});
    if (!ens.ok) return ens;
    var row = ens.data;
    var next = Object.assign({}, row);
    if (rule.seg) {
      var segField = rule.seg + '_qty';
      next[segField] = _round(_num(next[segField]) + rule.sign * qty);
    }
    next.physical_qty = _round(_num(next.physical_qty) + rule.physical * qty);
    next.locked_qty = _round(_num(next.locked_qty) + rule.locked * qty);
    next.bound_doc = doc.doc_no || null;
    next.updated_at = new Date().toISOString();
    var calc = _recalc(next);
    next.physical_qty = calc.physical_qty;
    next.available_qty = calc.available_qty;
    next.reconcile_flag = calc._balanced ? 'balanced' : 'error';
    var sb = _raw();
    var upd = await sb.from('stock_ledger').update({
      purchase_in_qty: next.purchase_in_qty, recovery_in_qty: next.recovery_in_qty,
      consume_scrap_qty: next.consume_scrap_qty, physical_qty: next.physical_qty,
      locked_qty: next.locked_qty, available_qty: next.available_qty,
      bound_doc: next.bound_doc, reconcile_flag: next.reconcile_flag, updated_at: next.updated_at
    }).eq('subject', SUBJECT).eq('id', row.id);
    if (upd.error) return { ok: false, error: upd.error.message };
    return { ok: true, row: next, balanced: calc._balanced };
  }

  /** Periodic snapshot check: list rows failing balance under a period. */
  async function checkBalance(period) {
    if (!_assertHQ()) return { ok: true, data: [], skipped: 'not-hq' };
    var r = await listLedger(period, null);
    if (!r.ok) return r;
    var errors = [];
    r.data.forEach(function (row) {
      var c = _recalc(row);
      if (!c._balanced || row.reconcile_flag === 'error') {
        errors.push({ id: row.id, item_name: row.item_name, sku: row.sku,
          left: c._left, right: c._right, flag: row.reconcile_flag });
      }
    });
    return { ok: true, data: errors, checked: r.data.length };
  }

  /** Overwrite opening_qty for a period (used only at initial carry-over). */
  async function setOpening(period, usageCode, item, openingQty) {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var ens = await ensureRow(period, usageCode, item);
    if (!ens.ok) return ens;
    var row = ens.data;
    var next = Object.assign({}, row, { opening_qty: _num(openingQty), updated_at: new Date().toISOString() });
    var calc = _recalc(next);
    next.physical_qty = calc.physical_qty;
    next.available_qty = calc.available_qty;
    next.reconcile_flag = calc._balanced ? 'balanced' : 'error';
    var sb = _raw();
    var upd = await sb.from('stock_ledger').update({
      opening_qty: next.opening_qty, physical_qty: next.physical_qty,
      available_qty: next.available_qty, reconcile_flag: next.reconcile_flag,
      updated_at: next.updated_at
    }).eq('subject', SUBJECT).eq('id', row.id);
    if (upd.error) return { ok: false, error: upd.error.message };
    return { ok: true, row: next };
  }

  /** Migration self-check: do the new HQ tables exist and accept reads? */
  async function healthCheck() {
    if (!_assertHQ()) return { ok: true, skipped: 'not-hq' };
    var sb = _raw(); if (!sb) return { ok: false, error: 'supabase client not loaded' };
    var out = {};
    for (var i = 0; i < ['usage_categories', 'stock_ledger', 'posting_journal']; i++) {
      var t = ['usage_categories', 'stock_ledger', 'posting_journal'][i];
      var res = await sb.from(t).select('id').eq('subject', SUBJECT).limit(1);
      out[t] = !res.error;
    }
    out.ready = out.usage_categories && out.stock_ledger && out.posting_journal;
    return { ok: true, tables: out };
  }

  global.HQFoundation = {
    SUBJECT: SUBJECT,
    POSTING_RULES: POSTING_RULES,
    _recalc: _recalc,
    listCategories: listCategories,
    addCategory: addCategory,
    setCategoryActive: setCategoryActive,
    listLedger: listLedger,
    ensureRow: ensureRow,
    postDocument: postDocument,
    reverseDocument: reverseDocument,
    checkBalance: checkBalance,
    setOpening: setOpening,
    healthCheck: healthCheck
  };
})(typeof window !== 'undefined' ? window : this);
