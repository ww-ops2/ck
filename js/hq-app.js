/**
 * HQ App - 遇见美好总部正式系统（v6.1）
 * 设计稿 hq-clone-preview.html 的真实数据驱动版。
 * 固定 subject=hq，复用 supabase-db.js 的 SupaDB（自动按主体隔离），列车主体零影响。
 * 空库显示引导，不造假数据。列车已有 no Realtime：30s 同步 + 切回刷新，这里照搬。
 */
(function () {
  'use strict';

  // ---------- 图标（内联 SVG，与列车导航图标同一风格） ----------
  var ICONS = {
    gift:      '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"8.5\" width=\"18\" height=\"4\" rx=\"1.2\"/><path d=\"M12 8.5V21\"/><path d=\"M19 12.5v6.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5\"/><path d=\"M7.6 8.5a2.3 2.3 0 1 1 0-4.6C10.6 3.9 12 8.5 12 8.5s1.4-4.6 4.4-4.6a2.3 2.3 0 1 1 0 4.6\"/></svg>',
    bus:       '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 17V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V17\"/><path d=\"M4 11h16\"/><path d=\"M2.5 17h19\"/><circle cx=\"7.5\" cy=\"17.5\" r=\"1.3\"/><circle cx=\"16.5\" cy=\"17.5\" r=\"1.3\"/></svg>',
    folder:    '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 8a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.6.8l.9 1.2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/></svg>',
    warehouse: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 21V9.2L12 4l9 5.2V21\"/><path d=\"M7 21v-7h10v7\"/><path d=\"M2.5 21h19\"/></svg>',
    inbox:     '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 12h-6l-2 3h-4l-2-3H2\"/><path d=\"M5.5 5.5L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z\"/></svg>',
    tag:       '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z\"/><path d=\"M7 7h.01\"/></svg>'
  };
  function ico(k) { return ICONS[k] || ICONS.tag; }

  var OWNERS = [
    { key: 'live',  icon: 'gift',      name: '直播礼品', cls: 'live' },
    { key: 'tour',  icon: 'bus',       name: '出团物料', cls: 'tour' },
    { key: 'admin', icon: 'folder',    name: '行政物料', cls: 'admin' },
    { key: 'wh',    icon: 'warehouse', name: '总部仓库', cls: 'wh' }
  ];
  var OWN_CLS = { '直播礼品': 'live', '出团物料': 'tour', '行政物料': 'admin', '总部仓库': 'wh' };

  function $(id) { return document.getElementById(id); }
  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(v) { v = n(v); return '¥' + v.toLocaleString('zh-CN'); }
  function shortMoney(v) { v = n(v); if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + '万'; return money(v); }
  function catOf(x) { return x && (x.category_name || x.category || '未分类'); }
  function ownCls(cat) { return OWN_CLS[cat] || ''; }
  function ownBadge(cat) { var c = ownCls(cat); return '<span class="own ' + c + '">' + esc(cat || '未分类') + '</span>'; }
  function emptyRow(cols, msg) { return '<tr><td colspan="' + cols + '" style="text-align:center;color:var(--text-muted);padding:26px 0">' + esc(msg) + '</td></tr>'; }

  // 明细归一化：SupaDB getter 返回原始行，明细在 xxx_items 键下
  function itemsOf(row) {
    if (!row) return [];
    if (Array.isArray(row.items)) return row.items;
    var keys = ['purchase_order_items', 'stock_in_items', 'requisition_items', 'stock_out_items'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(row[keys[i]])) return row[keys[i]].map(function (it) {
        return {
          name: it.name || it.item_name,
          code: it.item_code || it.code,
          category: it.category_name || it.category,
          quantity: n(it.quantity),
          // 实收量必须单独保留：线上 purchase_order_items 无 received_qty 列，
          // 部分入库时若用 quantity 会把订购量当实收量，导致出入库明细虚增
          actual_quantity: it.actual_quantity != null ? n(it.actual_quantity) : n(it.quantity),
          received_qty: n(it.received_qty || 0),
          unit: it.unit,
          price: n(it.price), amount: n(it.amount),
          brand: it.brand, model: it.model,
          inventory_item_id: it.inventory_item_id
        };
      });
    }
    return [];
  }

  var D = { inventory: [], categories: [], purchase: [], stockin: [], requisitions: [], stockout: [], audit: [], users: [], returns: [] };
  var loaded = false;

  // ---------- 数据加载 ----------
  async function loadAll() {
    if (typeof SupaDB === 'undefined') { showFatal('数据层未加载，请刷新重试'); return; }
    try {
      // 强制 hq 主体（防止会话串主体）
      if (typeof setCurrentSubject === 'function') setCurrentSubject('hq');
      if (typeof checkSubjectMigration === 'function') { try { await checkSubjectMigration(); } catch (e) {} }
      var safe = function (p) { return p.catch(function () { return []; }); };
      var res = await Promise.all([
        safe(SupaDB.getInventory()),
        safe(SupaDB.getCategories()),
        safe(SupaDB.getPurchaseOrders()),
        safe(SupaDB.getStockInRecords()),
        safe(SupaDB.getRequisitions()),
        safe(SupaDB.getStockOutRecords()),
        safe(SupaDB.getAuditLogs({ limit: 50 })),
        safe(SupaDB.getUsers()),
        safe(SupaDB.getNonPurchaseStockIns({}))
      ]);
      D.inventory = res[0] || [];
      D.categories = res[1] || [];
      D.purchase = res[2] || [];
      D.stockin = res[3] || [];
      D.requisitions = res[4] || [];
      D.stockout = res[5] || [];
      D.audit = res[6] || [];
      D.users = res[7] || [];
      D.returns = res[8] || [];
      loaded = true;
      renderAll();
    } catch (e) {
      showFatal('数据加载失败：' + (e && e.message || e));
    }
  }

  function showFatal(msg) {
    var w = $('ownOverview');
    if (w) w.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--danger)">' + esc(msg) + '</div>';
  }

  // ---------- 归属聚合 ----------
  function aggregate() {
    var out = {};
    OWNERS.forEach(function (o) { out[o.key] = { items: 0, stock: 0, value: 0, locked: 0, low: 0, pendingIn: 0, inTransit: 0, pendingAudit: 0, mailPending: 0, plannedQty: 0, outQty: 0, returnedQty: 0 }; });
    D.inventory.forEach(function (it) {
      var cat = catOf(it);
      var o = OWNERS.find(function (x) { return x.name === cat; });
      if (!o) return;
      var b = out[o.key];
      b.items += 1;
      b.stock += n(it.stock);
      b.value += n(it.stock) * n(it.unit_price);
      b.locked += n(it.locked_qty || it.locked || 0);
      if (n(it.stock) < n(it.safety_stock || 10)) b.low += 1;
    });
    D.purchase.forEach(function (p) {
      if (p.status !== 'pending_stockin' && p.status !== 'partially_stockin') return;
      var cats = {};
      itemsOf(p).forEach(function (it) { if (it.category) cats[it.category] = 1; });
      Object.keys(cats).forEach(function (c) { var o = OWNERS.find(function (x) { return x.name === c; }); if (o) out[o.key].pendingIn += 1; });
    });
    // 出库单按领用单号累计已出库数量（用于算"主播拟出库未出库=锁定"）
    var outedByReq = {};
    D.stockout.forEach(function (s) {
      if (!s.requisition_id) return;
      var k = String(s.requisition_id);
      itemsOf(s).forEach(function (it) { outedByReq[k] = (outedByReq[k] || 0) + n(it.quantity); });
    });
    D.requisitions.forEach(function (r) {
      var its = itemsOf(r);
      var cats = {}; its.forEach(function (it) { if (it.category) cats[it.category] = 1; });
      var os = Object.keys(cats).map(function (c) { return OWNERS.find(function (x) { return x.name === c; }); }).filter(Boolean);
      if (r.status === 'pending' || r.status === 'pending_approval') os.forEach(function (o) { out[o.key].pendingAudit += 1; });
      else if (r.status === 'pending_outbound' || r.status === 'partially_outbounded') os.forEach(function (o) { out[o.key].inTransit += 1; });
      // 直播链路：主播拟出库未实际出库的数量 = 锁定库存
      var isLivePlan = r.scenario === 'live_plan' || (os.length === 1 && os[0].key === 'live');
      if (isLivePlan && r.status !== 'outbound_completed' && r.status !== 'withdrawn') {
        var totalReq = its.reduce(function (a, i) { return a + n(i.quantity); }, 0);
        var outed = outedByReq[String(r.id)] || 0;
        var left = Math.max(0, totalReq - outed);
        os.forEach(function (o) { out[o.key].plannedQty += left; out[o.key].locked += left; });
      }
    });
    D.stockout.forEach(function (s) {
      itemsOf(s).forEach(function (it) {
        var o = OWNERS.find(function (x) { return x.name === it.category; });
        if (o) out[o.key].outQty += n(it.quantity);
      });
      if (s.out_type === 'mail' || s.is_mail || (s.remark || '').indexOf('邮寄') >= 0) {
        var cats = {};
        itemsOf(s).forEach(function (it) { if (it.category) cats[it.category] = 1; });
        Object.keys(cats).forEach(function (c) { var o = OWNERS.find(function (x) { return x.name === c; }); if (o && (s.status === 'pending' || s.status === 'pending_ship')) out[o.key].mailPending += 1; });
      }
    });
    // 库存退回（特殊入库）：已审核的回流数量按归属累计
    (D.returns || []).forEach(function (rr) {
      if (rr.status !== 'approved') return;
      var o = OWNERS.find(function (x) { return x.name === (rr.category_name || rr.category); });
      if (o) out[o.key].returnedQty += n(rr.qty);
    });
    return out;
  }

  // ---------- 渲染：仪表盘 4 归属卡 ----------
  function renderDashboard(agg) {
    var wrap = $('ownOverview');
    if (!wrap) return;
    // 用户明确要求：保留这套 4 归属卡片结构，数字勾稽真实数据；空库时显示 0，不再整块替换成空白提示。
    wrap.innerHTML = OWNERS.map(function (o) {
      var b = agg[o.key];
      var tag = (b.low || b.inTransit || b.pendingAudit) ? '进行中' : '平稳';
      var tagCls = tag === '平稳' ? ' ok' : '';
      var midLabel = o.key === 'live' ? '锁定待出库' : o.key === 'tour' ? '在途' : o.key === 'admin' ? '低库存' : '待入库';
      var midVal = o.key === 'live' ? b.locked : o.key === 'tour' ? b.inTransit : o.key === 'admin' ? b.low : b.pendingIn;
      var midCls = o.key === 'admin' ? 'yel' : (o.key === 'live' ? 'red' : 'blu');
      return '<div class="own-card ' + o.cls + '">' +
        '<div class="oc-head"><span class="oc-ic">' + ico(o.icon) + '</span><span class="oc-name">' + o.name + '</span><span class="oc-tag' + tagCls + '">' + tag + '</span></div>' +
        '<div class="oc-grid">' +
          '<div><span>物品</span><b>' + b.items + ' <i>种</i></b></div>' +
          '<div><span>库存</span><b>' + b.stock + ' <i>件</i></b></div>' +
          '<div' + (o.key === 'live' ? ' class="mid-drill" data-drill="locked" data-own="live" title="点击查看锁定明细并办理销售邮寄"' : '') + '><span>' + midLabel + '</span><b class="' + midCls + '">' + midVal + ' <i>笔</i></b></div>' +
          '<div><span>库存额</span><b>' + shortMoney(b.value) + '</b></div>' +
        '</div>' +
        '<div class="oc-foot">' +
          '<button type="button" class="st st-btn" data-drill="out" data-own="' + o.key + '" title="点击查看实际出库明细"><i style="background:var(--accent)"></i>实际出库 <b>' + b.outQty + '</b></button>' +
          '<button type="button" class="st st-btn" data-drill="locked" data-own="' + o.key + '" title="点击查看锁定明细"><i style="background:var(--warning)"></i>锁定待出 <b>' + b.locked + '</b></button>' +
          '<button type="button" class="st st-btn" data-drill="returned" data-own="' + o.key + '" title="点击查看退回入库明细"><i style="background:var(--success)"></i>退回入库 <b>' + b.returnedQty + '</b></button>' +
        '</div></div>';
    }).join('');

    // 待办 KPI
    var todo = $('dash-todo-kpis');
    if (todo) {
      var t = OWNERS.reduce(function (a, o) { a.pendingIn += agg[o.key].pendingIn; a.audit += agg[o.key].pendingAudit; a.transit += agg[o.key].inTransit; a.mail += agg[o.key].mailPending; return a; }, { pendingIn: 0, audit: 0, transit: 0, mail: 0 });
      todo.innerHTML =
        '<div class="kpi"><div class="k">待入库采购单</div><div class="v red">' + t.pendingIn + ' <small>单</small></div><div class="s">按用途归属汇总</div></div>' +
        '<div class="kpi y"><div class="k">待审核领用</div><div class="v yel">' + t.audit + ' <small>单</small></div><div class="s">按用途归属汇总</div></div>' +
        '<div class="kpi b"><div class="k">在途未签收</div><div class="v blu">' + t.transit + ' <small>笔</small></div><div class="s">领用 + 邮寄在途</div></div>' +
        '<div class="kpi p"><div class="k">中奖待邮寄</div><div class="v pur">' + t.mail + ' <small>笔</small></div><div class="s">直播礼品归属</div></div>';
    }
  }

  // ---------- 渲染：库存概览 ----------
  function renderInventory() {
    var body = $('inv-body');
    if (!body) return;
    // 按物品累计"主播拟出库未出库"的锁定量（来自真实领用单 - 出库单）
    var lockMap = {};
    var outedByReq = {};
    D.stockout.forEach(function (s) {
      if (!s.requisition_id) return;
      var k = String(s.requisition_id);
      itemsOf(s).forEach(function (it) { outedByReq[k] = (outedByReq[k] || 0) + n(it.quantity); });
    });
    D.requisitions.forEach(function (r) {
      if (r.status === 'outbound_completed' || r.status === 'withdrawn') return;
      // 口径与 aggregate() 一致：scenario=live_plan 或「明细只有直播礼品」都算主播拟出库锁定，
      // 兼容既有 scenario='live' 的历史单，避免库存概览锁定列少算。
      var isLivePlan = r.scenario === 'live_plan' || (itemsOf(r).length === 1 && itemsOf(r)[0].category === '直播礼品');
      if (!isLivePlan) return;
      var outed = outedByReq[String(r.id)] || 0;
      itemsOf(r).forEach(function (it) {
        var key = it.code || it.name;
        var totalReq = n(it.quantity);
        var perOuted = Math.min(totalReq, outed);
        outed = Math.max(0, outed - perOuted);
        lockMap[key] = (lockMap[key] || 0) + Math.max(0, totalReq - perOuted);
      });
    });
    if (!D.inventory.length) {
      body.innerHTML = emptyRow(10, '暂无物品，请先在「采购单管理」录入采购并验收入库');
    } else {
      body.innerHTML = D.inventory.map(function (it) {
        var cat = catOf(it);
        var st = n(it.stock);
        var ss = n(it.safety_stock || 10);
        var status = st === 0 ? '<span class="tag r">缺货</span>' : st < ss ? '<span class="tag y">低库存</span>' : '<span class="tag g">正常</span>';
        var lk = lockMap[it.code] || lockMap[it.name] || n(it.locked_qty || it.locked || 0);
        return '<tr><td>' + esc(it.code) + '</td><td>' + esc(it.name) + '</td><td>' + esc(it.brand || '') + ' / ' + esc(it.model || '') + '</td><td>' + esc(it.unit || '') + '</td>' +
          '<td class="num">' + money(it.unit_price) + '</td><td class="num">' + st + '</td><td class="num">' + lk + '</td>' +
          '<td>' + ownBadge(cat) + '</td><td>' + status + '</td><td class="lnk"><button class="row-act" data-act="item-edit" data-id="' + esc(it.id) + '">编辑</button></td></tr>';
      }).join('');
    }
    var kp = $('inv-kpis');
    if (kp) {
      var total = n(D.inventory.reduce(function (a, i) { return a + n(i.stock); }, 0));
      var low = D.inventory.filter(function (i) { return n(i.stock) < n(i.safety_stock || 10); }).length;
      kp.innerHTML =
        '<div class="kpi"><div class="k">物品总数</div><div class="v">' + D.inventory.length + ' <small>种</small></div><div class="s">' + D.categories.length + ' 个用途归属</div></div>' +
        '<div class="kpi g"><div class="k">库存总量</div><div class="v">' + total.toLocaleString('zh-CN') + ' <small>件</small></div></div>' +
        '<div class="kpi y"><div class="k">低库存</div><div class="v yel">' + low + ' <small>种</small></div></div>' +
        '<div class="kpi"><div class="k">库存总额</div><div class="v">' + shortMoney(D.inventory.reduce(function (a, i) { return a + n(i.stock) * n(i.unit_price); }, 0)) + '</div></div>';
    }
  }

  // ---------- 渲染：品类（用途归属）----------
  function renderCategories() {
    var grid = $('cat-grid');
    if (!grid) return;
    var metaMap = { '直播礼品': '中奖锁定 · 邮寄出库', '出团物料': '领用出库 · 团期核销', '行政物料': '行政申领 · 归还', '总部仓库': '调入调出 · 盘点' };
    var counts = {};
    D.inventory.forEach(function (it) { var c = catOf(it); counts[c] = (counts[c] || 0) + 1; });
    var cards = OWNERS.map(function (o) {
      var cnt = counts[o.name] || 0;
      return '<div class="cat-card ' + o.cls + '"><div class="cnt">' + cnt + '</div><div class="ic">' + ico(o.icon) + '</div><div class="nm">' + o.name + '</div><div class="meta">' + (metaMap[o.name] || '') + '</div></div>';
    });
    // 若加了自定义归属，也显示
    D.categories.forEach(function (c) {
      if (OWNERS.some(function (o) { return o.name === c.name; })) return;
      cards.push('<div class="cat-card wh"><div class="cnt">' + (counts[c.name] || 0) + '</div><div class="ic">' + ico('tag') + '</div><div class="nm">' + esc(c.name) + '</div><div class="meta">自定义归属</div></div>');
    });
    cards.push('<div class="cat-add"><div class="plus">＋</div><div>新增归属分类</div></div>');
    grid.innerHTML = cards.join('');
  }

  // ---------- 渲染：采购单 ----------
  function renderPurchase() {
    var body = $('po-body');
    if (!body) return;
    if (!D.purchase.length) { body.innerHTML = emptyRow(8, '暂无采购单，请新建带用途归属的采购单'); return; }
    var statusText = { pending_stockin: '待入库', partially_stockin: '部分入库', stockin_completed: '已完成' };
    var statusCls = { pending_stockin: 'y', partially_stockin: 'b', stockin_completed: 'g' };
    body.innerHTML = D.purchase.map(function (p) {
      var its = itemsOf(p);
      var cats = {}; its.forEach(function (i) { if (i.category) cats[i.category] = 1; });
      var catStr = Object.keys(cats).map(ownBadge).join(' ') || ownBadge('未分类');
      var amt = its.reduce(function (a, i) { return a + i.amount; }, 0) || n(p.total_amount);
      var st = statusText[p.status] || p.status || '—';
      var act = p.status === 'stockin_completed'
        ? '<button class="row-act" data-act="po-view" data-id="' + esc(p.id) + '">查看</button>'
        : '<button class="row-act" data-act="po-edit" data-id="' + esc(p.id) + '">编辑</button> · <button class="row-act" data-act="po-stockin" data-id="' + esc(p.id) + '">入库</button>';
      return '<tr><td class="lnk">' + esc(p.code || p.order_no) + '</td><td>' + esc((p.purchase_date || p.created_at || '').slice(5, 10)) + '</td><td>' + esc(p.purchaser || p.creator || '—') + '</td>' +
        '<td>' + its.length + ' 项</td><td class="num">' + money(amt) + '</td><td>' + catStr + '</td><td><span class="tag ' + (statusCls[p.status] || '') + '">' + esc(st) + '</span></td><td class="lnk">' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：入库 ----------
  function renderStockIn() {
    var body = $('si-body');
    if (!body) return;
    // 已收数量按「真实入库明细」反查聚合：purchase_order_items 无 received_qty 列，
    // 只认 stock_in_items，才能正确显示已入库/部分入库/已完成
    var receivedMap = {};
    (D.stockin || []).forEach(function (s) {
      var poKey = String(s.purchase_order_code || s.purchase_order_id || '');
      (s.stock_in_items || []).forEach(function (si) {
        var k = poKey + '|' + (si.item_code || si.name || '');
        receivedMap[k] = (receivedMap[k] || 0) + n(si.actual_quantity != null ? si.actual_quantity : si.quantity);
      });
    });
    // 入库管理展示全部采购明细：待入库 / 部分入库 / 已完成都要能看到，避免验收入库后记录"消失"
    var rows = [];
    D.purchase.forEach(function (p) {
      var poKey = String(p.code || p.id);
      itemsOf(p).forEach(function (it) {
        var done = receivedMap[poKey + '|' + (it.code || it.name || '')] || 0;
        var finished = p.status === 'stockin_completed' || (n(it.quantity) > 0 && done >= n(it.quantity));
        rows.push({ po: p.code || p.order_no, poId: p.id, it: it, done: done, finished: finished });
      });
    });
    if (!rows.length) { body.innerHTML = emptyRow(7, '暂无采购入库明细，请先新建采购单'); return; }
    body.innerHTML = rows.map(function (r) {
      var st = r.finished ? '已完成' : r.done > 0 ? '部分入库' : '待入库';
      var cls = st === '已完成' ? 'g' : st === '部分入库' ? 'b' : 'r';
      var act = r.finished
        ? '<button class="row-act" data-act="po-view" data-id="' + esc(r.poId) + '">查看</button>'
        : '<button class="row-act" data-act="si-accept" data-id="' + esc(r.poId) + '">' + (r.done > 0 ? '继续入库' : '验收入库') + '</button>';
      return '<tr><td>' + esc(r.po) + '</td><td>' + esc(r.it.name) + '</td><td class="num">' + r.it.quantity + '</td><td class="num">' + r.done + '</td>' +
        '<td>' + ownBadge(r.it.category) + '</td><td><span class="tag ' + cls + '">' + st + '</span></td><td class="lnk">' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：特殊入库（库存退回） ----------
  function renderSpecialIn() {
    var body = $('spt-body');
    if (!body) return;
    var list = D.returns || [];
    if (!list.length) { body.innerHTML = emptyRow(8, '暂无退回入库单，领用后如有剩余物料可新建退回单'); return; }
    var stMap = { pending: '待审核', approved: '已入库', rejected: '已驳回' };
    var stCls = { pending: 'y', approved: 'g', rejected: 'r' };
    body.innerHTML = list.map(function (rr) {
      var st = stMap[rr.status] || rr.status || '—';
      var cat = rr.category_name || rr.category || '未分类';
      var act = '<button class="row-act" data-act="spt-view" data-id="' + esc(rr.id) + '">查看</button>';
      if (rr.status === 'pending') {
        act = '<button class="row-act" data-act="spt-approve" data-id="' + esc(rr.id) + '">审核入库</button> · ' +
          '<button class="row-act" data-act="spt-reject" data-id="' + esc(rr.id) + '">驳回</button> · ' + act;
      }
      return '<tr><td class="lnk">' + esc(rr.code) + '</td><td>' + esc((rr.created_at || '').slice(5, 10)) + '</td>' +
        '<td>' + esc(rr.name || '—') + '</td><td>' + ownBadge(cat) + '</td>' +
        '<td class="num">' + n(rr.qty) + '</td><td>' + esc(rr.applicant_name || '—') + '</td>' +
        '<td>' + esc(rr.reason || '—') + '</td><td><span class="tag ' + (stCls[rr.status] || '') + '">' + esc(st) + '</span> ' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：领用单 ----------
  function renderRequisition() {
    var body = $('rq-body');
    if (!body) return;
    if (!D.requisitions.length) { body.innerHTML = emptyRow(8, '暂无领用单，请新建带用途归属的领用单'); return; }
    var stMap = { pending: '待审核', pending_approval: '待审核', pending_outbound: '在途', partially_outbounded: '部分出库', outbound_completed: '已出库' };
    body.innerHTML = D.requisitions.map(function (r) {
      var its = itemsOf(r);
      var cats = {}; its.forEach(function (i) { if (i.category) cats[i.category] = 1; });
      var catKeys = Object.keys(cats);
      var catStr = catKeys.map(ownBadge).join(' ') || ownBadge('未分类');
      var st = stMap[r.status] || r.status || '—';
      // 链路按归属分类：直播=主播拟出库→销售实际出库；出团=审核→在途→核销；常规=审核→出库
      var chain = 'normal';
      if (r.scenario === 'live_plan' || (catKeys.length === 1 && cats['直播礼品'])) chain = 'live';
      else if (catKeys.indexOf('出团物料') >= 0) chain = 'tour';
      // 按角色展示流程：每个节点标注责任角色，并在卡点行告诉发起人「现在卡在哪、需要谁通过」
      var FLOW_DEF = {
        live: [{ n: '主播拟出库', r: '主播' }, { n: '审核', r: '总部' }, { n: '销售出库', r: '销售' }],
        tour: [{ n: '审核', r: '总部' }, { n: '仓库出库', r: '仓库' }, { n: '核销', r: '总部' }],
        normal: [{ n: '审核', r: '总部' }, { n: '仓库出库', r: '仓库' }]
      };
      var nodes = FLOW_DEF[chain] || FLOW_DEF.normal;
      var stt = r.status || '';
      var done;
      if (stt === 'pending' || stt === 'pending_approval') done = chain === 'live' ? 1 : 0;
      else if (stt === 'outbound_completed') done = nodes.length;
      else done = chain === 'live' ? 2 : 1; // approved / pending_outbound / partially_outbounded
      var me = null;
      try { me = JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (e) {}
      var myRole = me && me.role;
      var blocker;
      if (done >= nodes.length) {
        blocker = '<div class="fr-blocker done">流程已完成</div>';
      } else {
        var cur = nodes[done];
        var mine = (cur.r === '总部' && myRole === 'admin') || (cur.r === '仓库' && myRole === 'warehouse');
        var verb = cur.n.indexOf('审核') >= 0 ? '审核' : '出库';
        var prefix = stt === 'partially_outbounded' ? '出库中：' : '卡在：';
        blocker = '<div class="fr-blocker' + (mine ? ' mine' : '') + '">' + prefix + (mine ? '待你' + verb : '待' + cur.r + verb) + '</div>';
      }
      var flow = '<div class="flow-role">' + nodes.map(function (nd, i) {
        var cls = i < done ? ' done' : (i === done ? ' cur' : '');
        return (i ? '<span class="arw">›</span>' : '') +
          '<span class="fr-node' + cls + '"><em>' + esc(nd.n) + '</em><small>' + esc(nd.r) + '</small></span>';
      }).join('') + '</div>' + blocker;
      var act = '<button class="row-act" data-act="rq-view" data-id="' + esc(r.id) + '">查看</button>';
      if (r.status === 'pending' || r.status === 'pending_approval') {
        act = '<button class="row-act" data-act="rq-approve" data-id="' + esc(r.id) + '">审核</button> · ' + act;
      } else if (r.status === 'approved' || r.status === 'pending_outbound' || r.status === 'partially_outbounded') {
        var outLabel = chain === 'live' ? '销售出库' : '出库';
        act = '<button class="row-act" data-act="rq-out" data-id="' + esc(r.id) + '">' + outLabel + '</button> · ' + act;
      }
      var purpose = chain === 'tour' ? (r.tour_name || '—') : (r.purpose || r.remark || '常规出库');
      return '<tr><td class="lnk">' + esc(r.code) + '</td><td>' + esc((r.created_at || '').slice(5, 10)) + '</td><td>' + esc(r.applicant || '—') + '</td><td>' + esc(purpose) + '</td>' +
        '<td>' + its.length + ' 项</td><td>' + catStr + '</td><td>' + flow + '</td><td class="lnk">' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：出库 ----------
  function renderStockOut() {
    var body = $('so-body');
    if (!body) return;
    if (!D.stockout.length) { body.innerHTML = emptyRow(7, '暂无出库单，请新建领用出库或邮寄出库'); return; }
    body.innerHTML = D.stockout.map(function (s) {
      var its = itemsOf(s);
      var isMail = s.out_type === 'mail' || s.is_mail || (s.remark || '').indexOf('邮寄') >= 0;
      var typeTag = isMail ? '<span class="tag p">邮寄出库</span>' : '<span class="tag b">领用出库</span>';
      var cat = its[0] ? its[0].category : '未分类';
      var qty = its.reduce(function (a, i) { return a + i.quantity; }, 0);
      var stMap = isMail
        ? { pending: '待邮寄', pending_ship: '待邮寄', shipped: '在途', completed: '已签收' }
        : { pending: '待出库', pending_ship: '待出库', shipped: '已出库', completed: '已出库' };
      var st = stMap[s.status] || s.status || '—';
      var stCls = st === '在途' ? 'b' : (st === '已签收' || st === '已出库') ? 'g' : 'y';
      return '<tr><td class="lnk">' + esc(s.code) + '</td><td>' + typeTag + '</td><td>' + esc(its.map(function (i) { return i.name; }).join('、')) + '</td>' +
        '<td class="num">' + qty + '</td><td>' + esc(s.tracking_no || (isMail ? '待填写' : '—')) + '</td><td>' + ownBadge(cat) + '</td><td><span class="tag ' + stCls + '">' + esc(st) + '</span> <button class="row-act" data-act="so-view" data-id="' + esc(s.id) + '">查看</button></td></tr>';
    }).join('');
  }

  // ---------- 渲染：出入库明细（按归属切换，真实单据勾稽） ----------
  function renderMonthly(ownerKey) {
    var body = $('monthBody');
    if (!body) return;
    var key = ownerKey || 'all';
    var list = D.inventory.filter(function (it) {
      if (key === 'all') return true;
      var o = OWNERS.find(function (x) { return x.key === key; });
      return o && catOf(it) === o.name;
    });
    if (!list.length) { body.innerHTML = emptyRow(8, '该用途归属下暂无物品明细'); return; }
    // 按物品编码/名称汇总：本月入库、出库、退库
    var inMap = {}, outMap = {}, retMap = {};
    (D.stockin || []).forEach(function (s) {
      itemsOf(s).forEach(function (i) { var k = i.code || i.name; inMap[k] = (inMap[k] || 0) + n(i.actual_quantity || i.quantity); });
    });
    (D.stockout || []).forEach(function (s) {
      itemsOf(s).forEach(function (i) { var k = i.code || i.name; outMap[k] = (outMap[k] || 0) + n(i.quantity); });
    });
    (D.returns || []).filter(function (r) { return r.status === 'approved'; }).forEach(function (r) {
      var k = r.item_code || r.code || r.name; retMap[k] = (retMap[k] || 0) + n(r.qty);
      retMap[r.name] = (retMap[r.name] || 0) + n(r.qty);
    });
    body.innerHTML = list.map(function (it) {
      var cat = catOf(it);
      var iv = inMap[it.code] || inMap[it.name] || 0;
      var ov = outMap[it.code] || outMap[it.name] || 0;
      var rv = retMap[it.code] || retMap[it.name] || 0;
      var inCell = iv ? '<span class="num in">+' + iv + '</span>' : '<span class="num">—</span>';
      var outCell = ov ? '<span class="num out">-' + ov + '</span>' : '<span class="num">—</span>';
      var retCell = rv ? '<span class="tag g">已退库 +' + rv + '</span>' : '<span class="num">—</span>';
      var opening = n(it.stock) + ov - iv - rv;
      return '<tr data-own="' + (ownCls(cat)) + '"><td>' + esc(it.code) + '</td><td>' + esc(it.name) + '</td><td>' + ownBadge(cat) + '</td>' +
        '<td class="num">' + opening + '</td><td class="num">' + inCell + '</td><td class="num">' + outCell + '</td><td>' + retCell + '</td><td class="num">' + n(it.stock) + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：团期报表（团期一级 → 物料二级） ----------
  function renderReports() {
    var wrap = $('tourReport');
    if (!wrap) return;
    // 按 tour_name 聚合出库明细
    var byTour = {};
    D.stockout.forEach(function (s) {
      var tour = (s.tour_name || '未关联团期').trim();
      if (!byTour[tour]) byTour[tour] = { rows: [], status: s.status };
      itemsOf(s).forEach(function (it) { byTour[tour].rows.push(it); });
    });
    // 也纳入领用单的团期（仅未出库部分）
    // 口径铁律：已出库/部分出库的领用单已经在 D.stockout 里计入，这里必须排除，否则同一物料翻倍
    D.requisitions.forEach(function (r) {
      if (!r.tour_name) return;
      if (r.status === 'outbound_completed' || r.status === 'partially_outbounded') return;
      var tour = r.tour_name.trim();
      if (!byTour[tour]) byTour[tour] = { rows: [], status: r.status };
      itemsOf(r).forEach(function (it) { byTour[tour].rows.push(it); });
    });
    var tours = Object.keys(byTour);
    if (!tours.length) { wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:36px">暂无团期使用数据，请先在领用/出库单填写团期名称</div>'; return; }
    wrap.innerHTML = tours.map(function (tour) {
      var g = byTour[tour];
      var qty = g.rows.reduce(function (a, i) { return a + i.quantity; }, 0);
      var amt = g.rows.reduce(function (a, i) { return a + (i.amount || i.quantity * n(i.price)); }, 0);
      var catSet = {}; g.rows.forEach(function (i) { if (i.category) catSet[i.category] = 1; });
      var chips = Object.keys(catSet).map(ownBadge).join(' ');
      var rows = g.rows.length ? g.rows.map(function (i) {
        return '<tr><td>' + esc(i.name) + '</td><td>' + esc(i.brand || i.model || '—') + '</td><td>' + ownBadge(i.category) + '</td>' +
          '<td class="num">' + i.quantity + '</td><td class="num">' + i.quantity + '</td><td class="num">' + money(i.price) + '</td><td class="num">' + money(i.amount || i.quantity * n(i.price)) + '</td><td><span class="tag g">已记录</span></td></tr>';
      }).join('') : emptyRow(8, '该团期暂无物料明细');
      return '<div class="tr-group"><div class="tr-head" onclick="toggleTour(this)">' +
        '<span class="tr-arrow">▸</span><span class="tr-name">' + esc(tour) + '</span><span class="tr-chip">' + (chips || '—') + '</span>' +
        '<span class="tr-sum">物料 <b>' + g.rows.length + '</b> 种</span><span class="tr-sum">使用量 <b>' + qty + '</b></span><span class="tr-sum">金额 <b class="red">' + money(amt) + '</b></span>' +
        '<span class="tag g">已记录</span></div><div class="tr-body"><table><thead><tr><th>物料名称</th><th>规格</th><th>用途归属</th><th class="num">申请量</th><th class="num">实际使用</th><th class="num">单价</th><th class="num">金额</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).join('');
  }

  // ---------- 渲染：操作记录 ----------
  function renderHistory() {
    var body = $('hist-body');
    if (!body) return;
    if (!D.audit.length) { body.innerHTML = emptyRow(6, '暂无操作记录'); return; }
    body.innerHTML = D.audit.slice(0, 30).map(function (a) {
      return '<tr><td>' + esc((a.created_at || '').slice(5, 16).replace('T', ' ')) + '</td><td>' + esc(a.actor || a.username || '—') + '</td><td>' + esc(a.action || '—') + '</td>' +
        '<td>' + esc(a.target || a.detail || '—') + '</td><td>' + ownBadge(catOf(a)) + '</td><td>' + esc(a.ip || '—') + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：趋势图 / 归属占比图（真实数据） ----------
  function renderCharts(agg) {
    // 趋势：按月份聚合采购入库量 与 出库量
    var trend = $('chart-trend');
    if (trend) {
      var months = {};
      function bump(key, kind, qty) {
        if (!key || key.length < 7) return;
        var mk = key.slice(0, 7);
        if (!months[mk]) months[mk] = { in: 0, out: 0 };
        months[mk][kind] += qty;
      }
      D.stockin.forEach(function (s) { itemsOf(s).forEach(function (i) { bump(s.stockin_date || s.created_at || s.purchase_date, 'in', n(i.actual_quantity || i.quantity)); }); });
      D.stockout.forEach(function (s) { itemsOf(s).forEach(function (i) { bump(s.stockout_date || s.created_at, 'out', n(i.quantity)); }); });
      var keys = Object.keys(months).sort().slice(-6);
      if (!keys.length) {
        trend.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;text-align:center;width:100%;padding-top:60px">暂无出入库数据，录入单据后自动生成趋势</div>';
      } else {
        var max = 1;
        keys.forEach(function (k) { max = Math.max(max, months[k].in, months[k].out); });
        trend.innerHTML = keys.map(function (k) {
          var m = months[k];
          var hi = Math.round(m.in / max * 100), ho = Math.round(m.out / max * 100);
          return '<div class="bcol"><div style="display:flex;gap:3px;align-items:flex-end;height:100%">' +
            '<div class="bstick" style="height:' + Math.max(2, hi) + '%;background:var(--accent)" title="入库 ' + m.in + '"></div>' +
            '<div class="bstick" style="height:' + Math.max(2, ho) + '%;background:var(--success)" title="出库 ' + m.out + '"></div>' +
            '</div><div class="blab">' + k.slice(5) + '月</div></div>';
        }).join('');
      }
    }
    // 占比：按各归属库存额
    var own = $('chart-own');
    if (own) {
      var vals = OWNERS.map(function (o) { return { o: o, v: agg[o.key].value }; });
      var total = vals.reduce(function (a, x) { return a + x.v; }, 0);
      if (total <= 0) {
        own.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;text-align:center">暂无库存数据，无法计算归属占比</div>';
      } else {
        var colors = { live: 'var(--accent)', tour: 'var(--info)', admin: 'var(--purple)', wh: 'var(--success)' };
        own.innerHTML = '<div class="ring" style="background:conic-gradient(' +
          vals.map(function (x, i) { var s = vals.slice(0, i).reduce(function (a, y) { return a + y.v / total * 100; }, 0); return colors[x.o.key] + ' ' + s + '% ' + (s + x.v / total * 100) + '%'; }).join(',') +
          ')"></div><div class="lg">' + vals.map(function (x) {
            return '<div><i style="background:' + colors[x.o.key] + '"></i>' + x.o.name + ' ' + Math.round(x.v / total * 100) + '%</div>';
          }).join('') + '</div>';
      }
    }
  }

  // ---------- 渲染：各模块 KPI 行（用真实数据，清掉设计稿假数字） ----------
  function kpiCard(label, val, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k">' + label + '</div><div class="v">' + val + '</div><div class="s">' + (sub || '') + '</div></div>';
  }
  function renderModuleKPIs() {
    // 采购
    var po = $('po-kpis');
    if (po) {
      var amt = D.purchase.reduce(function (a, p) { return a + itemsOf(p).reduce(function (x, i) { return x + i.amount; }, 0); }, 0);
      var done = D.purchase.filter(function (p) { return p.status === 'stockin_completed'; }).length;
      var pend = D.purchase.filter(function (p) { return p.status === 'pending_stockin' || p.status === 'partially_stockin'; }).length;
      po.innerHTML = kpiCard('采购单数', D.purchase.length + ' <small>单</small>') +
        kpiCard('采购总额', shortMoney(amt), '', 'g') +
        kpiCard('入库完成', done + ' <small>单</small>', '', 'b') +
        kpiCard('待处理', pend + ' <small>单</small>', '', 'y');
    }
    // 入库
    var si = $('si-kpis');
    if (si) {
      var pendPO = D.purchase.filter(function (p) { return p.status === 'pending_stockin'; }).length;
      var partPO = D.purchase.filter(function (p) { return p.status === 'partially_stockin'; }).length;
      var inQty = 0, skip = 0;
      D.stockin.forEach(function (s) { itemsOf(s).forEach(function (i) { inQty += n(i.actual_quantity || i.quantity); }); });
      D.purchase.forEach(function (p) { itemsOf(p).forEach(function (i) { if (i.is_skipped) skip++; }); });
      si.innerHTML = kpiCard('待入库', pendPO + ' <small>单</small>', '', 'y') +
        kpiCard('部分入库', partPO + ' <small>单</small>', '', 'b') +
        kpiCard('已入库量', inQty + ' <small>件</small>', '', 'g') +
        kpiCard('不入库跳过', skip + ' <small>项</small>', '', 'p');
    }
    // 特殊入库（退回）
    var spt = $('spt-kpis');
    if (spt) {
      var pendRet = (D.returns || []).filter(function (x) { return x.status === 'pending'; }).length;
      var aprvRet = (D.returns || []).filter(function (x) { return x.status === 'approved'; }).length;
      var retQty = (D.returns || []).filter(function (x) { return x.status === 'approved'; }).reduce(function (a, x) { return a + n(x.qty); }, 0);
      var liveRet = (D.returns || []).filter(function (x) { return x.status === 'approved' && (x.category_name || x.category) === '直播礼品'; }).reduce(function (a, x) { return a + n(x.qty); }, 0);
      spt.innerHTML = kpiCard('待审核退回', pendRet + ' <small>单</small>', '', 'y') +
        kpiCard('已入库', aprvRet + ' <small>单</small>', '', 'g') +
        kpiCard('退回总量', retQty + ' <small>件</small>') +
        kpiCard('直播礼品退回', liveRet + ' <small>件</small>', '', 'b');
    }
    // 领用
    var rq = $('rq-kpis');
    if (rq) {
      var audit = D.requisitions.filter(function (r) { return r.status === 'pending' || r.status === 'pending_approval'; }).length;
      var transit = D.requisitions.filter(function (r) { return r.status === 'pending_outbound' || r.status === 'partially_outbounded'; }).length;
      var doneR = D.stockout.filter(function (s) { return s.out_type !== 'mail' && !s.is_mail; }).length;
      var agg = aggregate();
      var locked = OWNERS.reduce(function (a, o) { return a + agg[o.key].plannedQty; }, 0);
      rq.innerHTML = kpiCard('待审核', audit + ' <small>单</small>', '', 'y') +
        kpiCard('实际出库', doneR + ' <small>单</small>', '', 'b') +
        kpiCard('已出库量', OWNERS.reduce(function (a, o) { return a + agg[o.key].outQty; }, 0) + ' <small>件</small>', '', 'g') +
        kpiCard('主播拟出库锁定', locked + ' <small>件</small>', '', 'r');
    }
    // 出库
    var so = $('so-kpis');
    if (so) {
      var outQty = 0, inTransit = 0, mailPending = 0, signed = 0;
      D.stockout.forEach(function (s) {
        var its = itemsOf(s); var q = its.reduce(function (a, i) { return a + i.quantity; }, 0); outQty += q;
        var st = s.status || '';
        if (st === 'shipped' || st === 'pending_ship') inTransit++;
        if ((s.out_type === 'mail' || s.is_mail) && (st === 'pending' || st === 'pending_ship')) mailPending++;
        if (st === 'completed') signed++;
      });
      so.innerHTML = kpiCard('出库总量', outQty + ' <small>件</small>', '', 'g') +
        kpiCard('在途未签收', inTransit + ' <small>笔</small>', '', 'b') +
        kpiCard('待邮寄', mailPending + ' <small>笔</small>', '', 'y') +
        kpiCard('已签收', signed + ' <small>笔</small>');
    }
  }

  // ---------- 渲染：数据分析（真实数据，覆盖设计稿假图表） ----------
  function renderAnalytics(agg) {
    var bars = document.querySelector('#mod-analytics .bars');
    if (bars) {
      var byMonth = {};
      D.purchase.forEach(function (p) {
        var key = String(p.purchase_date || p.created_at || '').slice(0, 7);
        if (key.length < 7) return;
        var amt = itemsOf(p).reduce(function (a, i) { return a + n(i.amount); }, 0) || n(p.total_amount);
        byMonth[key] = (byMonth[key] || 0) + amt;
      });
      var keys = Object.keys(byMonth).sort().slice(-6);
      if (!keys.length) {
        bars.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;text-align:center;width:100%;padding-top:55px">暂无采购数据，录入采购单后自动生成趋势</div>';
      } else {
        var max = 1;
        keys.forEach(function (k) { max = Math.max(max, byMonth[k]); });
        bars.innerHTML = keys.map(function (k) {
          var h = Math.max(2, Math.round(byMonth[k] / max * 100));
          return '<div class="bcol"><div class="bstick" style="height:' + h + '%;background:var(--accent)" title="' + k + ' ' + money(byMonth[k]) + '"></div><div class="blab">' + k.slice(5) + '月</div></div>';
        }).join('');
      }
    }
    var ring = document.querySelector('#mod-analytics .ring'), lg = document.querySelector('#mod-analytics .lg');
    if (ring && lg) {
      var vals = OWNERS.map(function (o) { return { o: o, v: agg[o.key].value }; });
      var total = vals.reduce(function (a, x) { return a + x.v; }, 0);
      var colors = { live: 'var(--accent)', tour: 'var(--info)', admin: 'var(--purple)', wh: 'var(--success)' };
      if (total <= 0) {
        ring.style.background = 'var(--bg-elevated)';
        lg.innerHTML = '<div style="color:var(--text-muted)">暂无库存数据</div>';
      } else {
        ring.style.background = 'conic-gradient(' + vals.map(function (x, i) {
          var s = vals.slice(0, i).reduce(function (a, y) { return a + y.v / total * 100; }, 0);
          return colors[x.o.key] + ' ' + s + '% ' + (s + x.v / total * 100) + '%';
        }).join(',') + ')';
        lg.innerHTML = vals.map(function (x) { return '<div><i style="background:' + colors[x.o.key] + '"></i>' + x.o.name + ' ' + Math.round(x.v / total * 100) + '%</div>'; }).join('');
      }
    }
  }

  // ---------- 渲染：账号管理（真实数据） ----------
  function renderAdminUsers() {
    var body = document.querySelector('#mod-adminuser tbody');
    if (!body || !D.users) return;
    if (!D.users.length) { body.innerHTML = emptyRow(6, '暂无账号'); return; }
    body.innerHTML = D.users.map(function (u) {
      var role = u.role || 'staff';
      var cls = role === 'admin' ? 'r' : role === 'warehouse' ? 'y' : 'b';
      return '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.name || '—') + '</td><td><span class="tag ' + cls + '">' + esc(role) + '</span></td>' +
        '<td>' + esc(u.subject || 'hq') + '</td><td><span class="tag g">启用</span></td>' +
        '<td class="lnk"><button class="row-act" data-act="user-perm" data-id="' + esc(u.username) + '">权限</button></td></tr>';
    }).join('');
  }

  function renderAll() {
    var agg = aggregate();
    renderDashboard(agg);
    renderCharts(agg);
    renderAnalytics(agg);
    renderInventory();
    renderCategories();
    renderPurchase();
    renderStockIn();
    renderSpecialIn();
    renderRequisition();
    renderStockOut();
    renderMonthly(currentOwner);
    renderReports();
    renderHistory();
    renderModuleKPIs();
    renderAdminUsers();
  }

  // ---------- 归属切换（出入库明细）----------
  var currentOwner = 'all';
  function bindOwnerSwitch() {
    var sw = $('monthOwnSwitch');
    if (!sw || sw._bound) return;
    sw.querySelectorAll('.os').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sw.querySelectorAll('.os').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        currentOwner = btn.getAttribute('data-own');
        renderMonthly(currentOwner);
      });
    });
    sw._bound = true;
  }

  // ---------- 模块切换（复用设计稿逻辑）+ 操作人 ----------
  function renderOperator() {
    var op = $('hq-op-badge');
    if (!op) return;
    var who = null;
    try { who = JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (e) {}
    if (!who) { try { who = JSON.parse(sessionStorage.getItem('inv_session') || 'null'); } catch (e) {} }
    op.textContent = (who && (who.name || who.username)) ? ('操作人：' + (who.name || who.username)) : '';
  }

  function bindTopButtons() {
    var ex = $('hq-btn-exit');
    if (ex) ex.onclick = function () {
      try {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('inv_session');
        sessionStorage.removeItem('inv_subject');
      } catch (e) {}
      window.location.href = 'index.html';
    };
    var rf = $('hq-btn-refresh');
    if (rf) rf.onclick = function () { loadAll(); };
  }

  // ---------- 启动 ----------
  function boot() {
    // 首屏同步渲染一次（此时云端尚未回来），把 HTML 里的设计稿假数字全部覆盖为真实空态，
    // 避免"先闪几秒假数据、再变成无数据页"。随后 loadAll 云端数据覆盖。
    renderAll();
    bindOwnerSwitch();
    renderOperator();
    bindTopButtons();
    loadAll();
    // 照搬列车：30s 自动同步 + 切回页面刷新
    setInterval(function () { if (!document.hidden) loadAll(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadAll(); });
    // 仪表盘时间
    function tick() {
      var el = $('dashTime');
      if (el) { var d = new Date(); el.textContent = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
    }
    tick(); setInterval(tick, 1000);
  }

  // 暴露给 hq-actions.js：所有按钮操作共用同一份数据与渲染入口，避免两处各自读库。
  window.HQApp = {
    D: D, OWNERS: OWNERS, ICONS: ICONS,
    ico: ico, esc: esc, n: n, money: money, itemsOf: itemsOf, catOf: catOf, ownBadge: ownBadge,
    loadAll: loadAll, renderAll: renderAll, aggregate: aggregate,
    setOwner: function (key) { currentOwner = key; renderMonthly(key); }
  };

  // 设计稿的内联脚本已处理模块切换/展开，这里只补数据。等 DOM 就绪。
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
