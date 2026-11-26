/**
 * HQ App - 遇见美好总部正式系统（v6.15 · 出库管理按授权身份分工作台 + 原样退回）
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

  // ---------- 账号与授权身份（v6.15）----------
  // 线上 users.username = 手机号、name = 姓名；当前登录人从本地会话读（与 renderOperator 同源）。
  // 授权身份存 user_permissions.permission = hq_role_anchor / hq_role_sales / hq_role_planner / hq_role_wh，
  // 一个账号多条 = 多身份（零 DDL）。读不到授权时保留全身份，避免未配置账号白屏。
  var HQ_ROLES = [
    { key: 'anchor',  name: '主播', perm: 'hq_role_anchor' },
    { key: 'sales',   name: '销售', perm: 'hq_role_sales' },
    { key: 'planner', name: '计调', perm: 'hq_role_planner' },
    { key: 'wh',      name: '仓库', perm: 'hq_role_wh' }
  ];
  var IDENTITY_NAME = { anchor: '主播', sales: '销售', planner: '计调', wh: '仓库' };
  var IDENTITY_TIP = {
    anchor:  '只看我申请的单据 · 可补充 / 提交销售 / 撤销',
    sales:   '主播流转来的直播礼品单 · 可填邮寄 / 退回主播',
    planner: '我录入的出团物料单 · 可办理 / 撤销',
    wh:      '待确认实际出库的单 · 可确认出库 / 退回销售'
  };
  var myAccount = { id: null, username: '', name: '' };
  var myRoles = ['anchor', 'sales', 'planner', 'wh'];
  var curIdentity = 'anchor';

  function readMyAccount() {
    var who = null;
    try { who = JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (e) {}
    if (!who) { try { who = JSON.parse(sessionStorage.getItem('inv_session') || 'null'); } catch (e) {} }
    myAccount = {
      id: (who && who.id != null) ? who.id : null,
      username: (who && (who.username || who.phone)) || '',
      name: (who && who.name) || (who && who.username) || ''
    };
    return myAccount;
  }
  function accountIdOfName(nm) {
    if (!nm) return null;
    var u = (D.users || []).filter(function (x) { return (x.name || x.username) === nm; })[0];
    return u ? u.id : null;
  }
  function accountNameOfId(id) {
    if (id == null) return '';
    var u = (D.users || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return u ? (u.name || u.username) : '';
  }
  function sameAccount(accId, nm) {
    if (accId != null && myAccount.id != null) return String(accId) === String(myAccount.id);
    return !!nm && nm === myAccount.name; // 旧单无账号 id 时用姓名兜底
  }
  async function loadMyRoles() {
    var sb = (typeof getSupabase === 'function') ? getSupabase() : null;
    if (!sb || myAccount.id == null) return;
    try {
      var res = await sb.from('user_permissions').select('permission').eq('user_id', myAccount.id);
      if (res && !res.error && res.data && res.data.length) {
        var ps = res.data.map(function (x) { return x.permission; });
        var granted = HQ_ROLES.filter(function (r) {
          return ps.indexOf(r.perm) >= 0 || ps.indexOf('all') >= 0;
        }).map(function (r) { return r.key; });
        if (granted.length) myRoles = granted;
      }
    } catch (e) {}
  }

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
      await loadMyRoles();
      if (myRoles.indexOf(curIdentity) < 0) curIdentity = myRoles[0];
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
    // 库存退回（特殊入库）：已由仓库确定的回流数量按归属累计
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
        '<div class="kpi y"><div class="k">待办理领用</div><div class="v yel">' + t.audit + ' <small>单</small></div><div class="s">按用途归属汇总</div></div>' +
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
    var metaMap = { '直播礼品': '中奖锁定 · 填写并邮寄', '出团物料': '领用出库 · 仓库确定', '行政物料': '行政申领 · 归还', '总部仓库': '调入调出 · 盘点' };
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
    var statusText = { pending_stockin: '待仓库确定', partially_stockin: '部分确定', stockin_completed: '已完成' };
    var statusCls = { pending_stockin: 'y', partially_stockin: 'b', stockin_completed: 'g' };
    body.innerHTML = D.purchase.map(function (p) {
      var its = itemsOf(p);
      var cats = {}; its.forEach(function (i) { if (i.category) cats[i.category] = 1; });
      var catStr = Object.keys(cats).map(ownBadge).join(' ') || ownBadge('未分类');
      var amt = its.reduce(function (a, i) { return a + i.amount; }, 0) || n(p.total_amount);
      var st = statusText[p.status] || p.status || '—';
      var act = p.status === 'stockin_completed'
        ? '<button class="row-act" data-act="po-view" data-id="' + esc(p.id) + '">查看</button>'
        : '<button class="row-act" data-act="po-edit" data-id="' + esc(p.id) + '">编辑</button> · <button class="row-act" data-act="po-stockin" data-id="' + esc(p.id) + '">仓库确定</button>';
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
        : '<button class="row-act" data-act="si-accept" data-id="' + esc(r.poId) + '">' + (r.done > 0 ? '继续确定' : '仓库确定') + '</button>';
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
    var stMap = { pending: '待仓库确定', approved: '已回补', rejected: '已驳回' };
    var stCls = { pending: 'y', approved: 'g', rejected: 'r' };
    body.innerHTML = list.map(function (rr) {
      var st = stMap[rr.status] || rr.status || '—';
      var cat = rr.category_name || rr.category || '未分类';
      var act = '<button class="row-act" data-act="spt-view" data-id="' + esc(rr.id) + '">查看</button>';
      if (rr.status === 'pending') {
        act = '<button class="row-act" data-act="spt-approve" data-id="' + esc(rr.id) + '">仓库确定</button> · ' +
          '<button class="row-act" data-act="spt-reject" data-id="' + esc(rr.id) + '">驳回</button> · ' + act;
      }
      return '<tr><td class="lnk">' + esc(rr.code) + '</td><td>' + esc((rr.created_at || '').slice(5, 10)) + '</td>' +
        '<td>' + esc(rr.name || '—') + '</td><td>' + ownBadge(cat) + '</td>' +
        '<td class="num">' + n(rr.qty) + '</td><td>' + esc(rr.applicant_name || '—') + '</td>' +
        '<td>' + esc(rr.reason || '—') + '</td><td><span class="tag ' + (stCls[rr.status] || '') + '">' + esc(st) + '</span> ' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 工具：团号（v6.12 团号必填；零迁移时降级从 remark 解析） ----------
  function tourNoOf(r) {
    if (!r) return '';
    if (r.tour_no) return String(r.tour_no);
    var m = String(r.remark || '').match(/团号[:：]\s*([^\s/，,]+)/);
    return m ? m[1] : '';
  }

  // ---------- 渲染：领用单 ----------
  // v6.12 六链路流程：领用 3 链路（直播礼品 / 出团物料 / 常规）在此展示；入库 3 链路在采购、特殊入库、库存概览模块体现。
  // 末端岗位统一为「仓库」（行政 / 库存 / 仓库为同一岗位，用户 2026-11-25 定稿），全流程无审核、无核销节点。
  // 状态复用线上合法值，不新增 status（避免 CHECK 23514）：
  //   pending / pending_approval            = 业务方申请已提交，待下一岗位办理
  //   approved / pending_outbound（已办理） = 中间环节已办理，待仓库确定出库
  //   outbound_completed                   = 仓库已确定出库，流程完成
  function renderRequisition() {
    var body = $('rq-body');
    if (!body) return;
    if (!D.requisitions.length) { body.innerHTML = emptyRow(8, '暂无领用单，请新建带用途归属的领用单'); return; }
    var stMap = { pending: '待办理', pending_approval: '待办理', approved: '待仓库确定', pending_outbound: '待仓库确定', partially_outbounded: '部分出库', outbound_completed: '已出库', rejected: '已驳回', withdrawn: '已撤回' };
    // 六链路之领用 3 链路：末端岗位统一「仓库」（行政 / 库存 / 仓库同一岗位）
    var FLOW_DEF = {
      live:   [{ n: '主播申请·锁定', r: '主播' }, { n: '销售填写并邮寄', r: '销售' }, { n: '仓库数据确认·出库', r: '仓库' }],
      tour:   [{ n: '计调填团期单', r: '计调' }, { n: '仓库核对实拿', r: '仓库' }, { n: '仓库确定出库', r: '仓库' }],
      normal: [{ n: '领用人申请', r: '领用人' }, { n: '仓库确定数量金额', r: '仓库' }, { n: '仓库确定出库', r: '仓库' }]
    };
    body.innerHTML = D.requisitions.map(function (r) {
      var its = itemsOf(r);
      var cats = {}; its.forEach(function (i) { if (i.category) cats[i.category] = 1; });
      var catKeys = Object.keys(cats);
      var catStr = catKeys.map(ownBadge).join(' ') || ownBadge('未分类');
      var st = stMap[r.status] || r.status || '—';
      var chain = 'normal';
      if (r.scenario === 'live_plan' || (catKeys.length === 1 && cats['直播礼品'])) chain = 'live';
      else if (catKeys.indexOf('出团物料') >= 0 || r.scenario === 'tour') chain = 'tour';
      var nodes = FLOW_DEF[chain] || FLOW_DEF.normal;
      var stt = r.status || '';
      // 线上 CHECK 未放宽时 createRequisition 会降级为 pending_outbound；用 remark 的 HQ_HANDLED 标记区分「新建」与「已办理」
      var handled = /HQ_HANDLED/.test(String(r.remark || ''));
      var fresh = (stt === 'pending' || stt === 'pending_approval' || (stt === 'pending_outbound' && !handled));
      var done;
      if (stt === 'outbound_completed') done = nodes.length;
      else if (fresh) done = 1;              // 业务方申请已提交，待下一岗位办理
      else done = nodes.length - 1;          // 中间环节已办理，卡在末端仓库确定出库
      var flow = '<div class="flow-role">' + nodes.map(function (nd, i) {
        var cls = i < done ? ' done' : (i === done ? ' cur' : '');
        return (i ? '<span class="arw">›</span>' : '') +
          '<span class="fr-node' + cls + '"><em>' + esc(nd.n) + '</em><small>' + esc(nd.r) + '</small></span>';
      }).join('') + '</div>';
      var blocker;
      if (done >= nodes.length) {
        blocker = '<div class="fr-blocker done">流程已完成</div>';
      } else {
        var cur = nodes[done];
        var prefix = stt === 'partially_outbounded' ? '出库中：' : '卡在：';
        blocker = '<div class="fr-blocker">' + prefix + '待' + esc(cur.r) + '办理（' + esc(cur.n) + '）</div>';
      }
      flow += blocker;
      var act = '<button class="row-act" data-act="rq-view" data-id="' + esc(r.id) + '">查看</button>';
      if (fresh) {
        var lbl = chain === 'live' ? '销售填写并邮寄' : (chain === 'tour' ? '仓库核对实拿' : '仓库确定数量金额');
        act = '<button class="row-act" data-act="rq-handle" data-id="' + esc(r.id) + '">' + lbl + '</button> · ' + act;
      } else if (stt === 'approved' || stt === 'pending_outbound' || stt === 'partially_outbounded') {
        act = '<button class="row-act" data-act="rq-out" data-id="' + esc(r.id) + '">仓库确定出库</button> · ' + act;
      }
      var tno = tourNoOf(r);
      var purpose;
      if (chain === 'tour') purpose = (tno ? '团号 ' + tno + ' · ' : '') + (r.tour_name || '—');
      else if (chain === 'live') purpose = (tno ? '团号 ' + tno + ' · ' : '') + (r.purpose || '直播礼品');
      else purpose = r.purpose || r.tour_name || '常规领用';
      return '<tr><td class="lnk">' + esc(r.code) + '</td><td>' + esc((r.created_at || '').slice(5, 10)) + '</td><td>' + esc(r.applicant || '—') + '</td><td>' + esc(purpose) + '</td>' +
        '<td>' + its.length + ' 项</td><td>' + catStr + '</td><td>' + flow + '</td><td class="lnk">' + act + '</td></tr>';
    }).join('');
  }

  // ---------- 渲染：出库单列表（分类作业台下半区，9 列） ----------
  function renderStockOut() {
    var body = $('so-body');
    if (!body) return;
    var fo = ($('so-f-own') && $('so-f-own').value) || '全部';
    var ft = ($('so-f-type') && $('so-f-type').value) || '全部类型';
    var fs = ($('so-f-status') && $('so-f-status').value) || '全部状态';
    var fk = String(($('so-f-key') && $('so-f-key').value) || '').trim().toLowerCase();
    var list = (D.stockout || []).filter(function (s) {
      var ao = soOutAccOf(s);
      var wantAcc = curIdentity === 'anchor' ? ao.applicant : curIdentity === 'sales' ? ao.sales : ao.wh;
      if (wantAcc == null) return false; // 无账号归属的不进任何个人工作台
      if (myAccount.id != null && String(wantAcc) !== String(myAccount.id)) return false;
      var its = itemsOf(s);
      var isMail = s.out_type === 'mail' || s.is_mail || (s.remark || '').indexOf('邮寄') >= 0;
      var cat = its[0] ? catOf(its[0]) : '未分类';
      var st = s.status || '';
      var stTxt = (st === 'shipped' || st === 'pending_ship') ? '在途未签收' : (st === 'completed' ? '已签收' : '');
      if (fo !== '全部' && cat !== fo) return false;
      if (ft !== '全部类型' && ((ft === '邮寄出库') !== isMail)) return false;
      if (fs !== '全部状态' && stTxt !== fs) return false;
      if (fk) {
        var hay = [s.code, s.tracking_no, s.remark, s.requisition_code].concat(its.map(function (i) { return i.name; })).join(' ').toLowerCase();
        if (hay.indexOf(fk) < 0) return false;
      }
      return true;
    });
    if (!list.length) { body.innerHTML = emptyRow(9, '暂无出库单，请新建领用出库或邮寄出库'); return; }
    body.innerHTML = list.map(function (s) {
      var its = itemsOf(s);
      var isMail = s.out_type === 'mail' || s.is_mail || (s.remark || '').indexOf('邮寄') >= 0;
      var typeTag = isMail ? '<span class="tag p">邮寄出库</span>' : '<span class="tag b">领用出库</span>';
      var cat = its[0] ? catOf(its[0]) : '未分类';
      var qty = its.reduce(function (a, i) { return a + i.quantity; }, 0);
      var stMap = isMail
        ? { pending: '待邮寄', pending_ship: '待邮寄', shipped: '在途', completed: '已签收' }
        : { pending: '待出库', pending_ship: '待出库', shipped: '已出库', completed: '已出库' };
      var st = stMap[s.status] || s.status || '—';
      var stCls = st === '在途' ? 'b' : (st === '已签收' || st === '已出库') ? 'g' : 'y';
      var tnoM = String(s.remark || '').match(/团号[:：]\s*([^\s/，,]+)/);
      var tno = tnoM ? tnoM[1] : '';
      return '<tr><td class="lnk">' + esc(s.code) + '</td><td>' + typeTag + '</td>' +
        '<td>' + (tno ? '<span class="so-tno">' + esc(tno) + '</span>' : '<span class="so-tno empty">—</span>') + '</td>' +
        '<td>' + esc(its.map(function (i) { return i.name; }).join('、')) + '</td>' +
        '<td class="num">' + qty + '</td><td>' + ownBadge(cat) + '</td>' +
        '<td>' + esc(s.tracking_no || (isMail ? '待填写' : '—')) + '</td>' +
        '<td><span class="tag ' + stCls + '">' + esc(st) + '</span></td>' +
        '<td><button class="row-act" data-act="so-view" data-id="' + esc(s.id) + '">查看</button></td></tr>';
    }).join('');
  }

  // ---------- 渲染：出库管理 · 分类作业台（设计稿 v5 落地，真实数据驱动） ----------
  var SO_OWNERS = [{ key: 'all', name: '全部归属' }].concat(OWNERS);
  var soOwner = 'live';
  function soTourNo(r) {
    if (!r) return '';
    if (r.tour_no) return String(r.tour_no);
    var m = String(r.remark || '').match(/团号[:：]\s*([^\s/，,]+)/);
    return m ? m[1] : '';
  }
  function soOwnerOf(r) {
    var its = itemsOf(r), cats = [];
    its.forEach(function (i) { var c = catOf(i); if (cats.indexOf(c) < 0) cats.push(c); });
    if (String(r.scenario || '') === 'live_plan' || (cats.length === 1 && cats[0] === '直播礼品')) return 'live';
    if (cats.indexOf('出团物料') >= 0) return 'tour';
    if (cats.indexOf('行政物料') >= 0) return 'admin';
    if (cats.indexOf('总部仓库') >= 0) return 'wh';
    return 'live';
  }
  function soHandled(r) { return /HQ_HANDLED/.test(String(r.remark || '')); }
  function soCustInfo(r) {
    var rm = String((r && r.remark) || ''), i = rm.indexOf('HQ_FLOW2:');
    if (i < 0) return { n: 0, qty: 0 };
    try {
      var tail = rm.slice(i + 9), end = tail.indexOf(' / HQ_');
      var b64 = (end >= 0 ? tail.slice(0, end) : tail).trim();
      var p = JSON.parse(decodeURIComponent(escape(atob(b64))));
      var nC = 0, q = 0;
      (p.items || []).forEach(function (it) {
        (it.customers || []).forEach(function (c) { nC++; q += n(c.qty); });
      });
      return { n: nC, qty: q };
    } catch (e) { return { n: 0, qty: 0 }; }
  }
  // ---- v6.15 身份工作台：流程阶段与账号归属 ----
  function soFlow(r) {
    var rm = String((r && r.remark) || ''), i = rm.indexOf('HQ_FLOW2:');
    if (i < 0) return null;
    var tail = rm.slice(i + 9), end = tail.indexOf(' / HQ_');
    var b64 = (end >= 0 ? tail.slice(0, end) : tail).trim();
    try { return JSON.parse(decodeURIComponent(escape(atob(b64)))); } catch (e) { return null; }
  }
  var STEP_STAGE = { anchor: 0, draft: 0, sales: 1, handled: 2, wh: 2 };
  function soStep(r) {
    var fp = soFlow(r);
    if (fp && fp.step) return fp.step;
    if (/HQ_HANDLED/.test(String((r && r.remark) || ''))) return 'handled';
    return 'sales'; // 旧单（含已补团号的单）默认停在待销售，可直接办理
  }
  function soStage(r) {
    if (!r) return 0;
    if (r.status === 'outbound_completed') return 3;
    return STEP_STAGE[soStep(r)] || 1;
  }
  function soStageTag(r) {
    var st = soStage(r);
    if (st === 0) return '<span class="tag y">待提交</span>';
    if (st === 1) return '<span class="tag b">待销售填写</span>';
    if (st === 2) return '<span class="tag" style="background:rgba(124,58,237,.08);color:#7c3aed">待仓库确定</span>';
    return '<span class="tag g">已出库</span>';
  }
  function soApplicantAcc(r) {
    var fp = soFlow(r);
    return (fp && (fp.applicantAcc || fp.applicant_id)) || accountIdOfName(r && r.applicant);
  }
  function soApplicantName(r) {
    var fp = soFlow(r);
    return (fp && fp.applicantName) || (r && r.applicant) || '';
  }
  function soHandlerAcc(r) { var fp = soFlow(r); return (fp && (fp.handlerAcc || fp.handledAcc)) || null; }
  function soWhAcc(r) { var fp = soFlow(r); return (fp && fp.whAcc) || accountIdOfName(r && r.confirmed_by); }
  // 当前身份的待办匹配：主播看自己 stage0 直播礼品 / 计调看 stage0 出团物料 / 销售看 stage1 / 仓库看 stage2
  function soTodoMatch(r) {
    var stage = soStage(r), own = soOwnerOf(r);
    if (curIdentity === 'anchor')  return stage === 0 && own === 'live' && sameAccount(soApplicantAcc(r), r.applicant);
    if (curIdentity === 'planner') return stage === 0 && own === 'tour';
    if (curIdentity === 'sales')   return stage === 1 && own === 'live';
    return stage === 2; // wh
  }
  function soActOf(r) {
    var id = esc(r.id), stage = soStage(r);
    var ro = '<span style="color:#a09890;font-size:11px">';
    if (curIdentity === 'anchor') {
      if (stage === 0) return '<button class="row-act" data-act="rq-supplement" data-id="' + id + '">补充信息</button> · <button class="row-act" data-act="rq-submit" data-id="' + id + '">确定提交销售</button> · <button class="row-act" data-act="rq-withdraw" data-id="' + id + '">撤销</button>';
      return ro + '已流转 · 本身份只读（要改由下游退回）</span>';
    }
    if (curIdentity === 'sales') {
      if (stage === 1) return '<button class="row-act" data-act="rq-handle" data-id="' + id + '">填写并邮寄</button> · <button class="row-act" data-act="rq-back-anchor" data-id="' + id + '">退回主播</button>';
      return ro + '已流转至仓库 · 本身份只读（要改由仓库退回）</span>';
    }
    if (curIdentity === 'planner') {
      if (stage === 0) return '<button class="row-act" data-act="rq-handle" data-id="' + id + '">办理</button> · <button class="row-act" data-act="rq-withdraw" data-id="' + id + '">撤销</button>';
      return ro + '已流转 · 本身份只读</span>';
    }
    if (stage === 2) return '<button class="row-act" data-act="rq-out" data-id="' + id + '">确认实际出库</button> · <button class="row-act" data-act="rq-back-sales" data-id="' + id + '">退回销售</button>';
    return ro + '已确认出库 · 本身份只读</span>';
  }
  function soOutAccOf(s) {
    var rid = s && s.requisition_id;
    var req = (D.requisitions || []).filter(function (r) { return String(r.id) === String(rid); })[0];
    var fp = req ? soFlow(req) : null;
    return {
      applicant: (fp && fp.applicantAcc) || (req && accountIdOfName(req.applicant)) || null,
      sales: (fp && (fp.handlerAcc || fp.handledAcc)) || null,
      wh: (fp && fp.whAcc) || accountIdOfName(s && s.confirmed_by) || null
    };
  }
  function renderIdentitySwitch() {
    var sw = $('so-identity-switch');
    if (sw) {
      sw.innerHTML = HQ_ROLES.filter(function (r) { return myRoles.indexOf(r.key) >= 0; }).map(function (r) {
        return '<button type="button" data-identity="' + r.key + '" class="' + (curIdentity === r.key ? 'on' : '') + '">' + r.name + '</button>';
      }).join('');
      if (!sw._bound) {
        sw._bound = true;
        sw.addEventListener('click', function (e) {
          var b = e.target.closest('[data-identity]'); if (!b) return;
          curIdentity = b.getAttribute('data-identity');
          renderStockOutBoard(); renderStockOut();
        });
      }
    }
    var note = $('so-identity-note');
    if (note) note.textContent = '当前账号：' + (myAccount.name || myAccount.username || '未登录') + ' · ' + IDENTITY_NAME[curIdentity] + ' · ' + IDENTITY_TIP[curIdentity];
    var ttl = $('so-todo-title'); if (ttl) ttl.textContent = '待办明细 · ' + IDENTITY_NAME[curIdentity] + '的工作台';
    var sub = $('so-todo-sub'); if (sub) sub.textContent = IDENTITY_TIP[curIdentity];
    var st = $('so-title'); if (st) st.textContent = '出库单列表 · ' + IDENTITY_NAME[curIdentity] + '经手且已出库的单据';
  }
  function soTodoRows() {
    return (D.requisitions || []).filter(function (r) {
      var st = String(r.status || '');
      return st !== 'outbound_completed' && st !== 'withdrawn' && st !== 'rejected';
    });
  }
  function soBindFilters() {
    ['so-f-own', 'so-f-type', 'so-f-status', 'so-f-key', 'so-status-filter'].forEach(function (id) {
      var el = $(id);
      if (!el || el._soBound) return;
      el._soBound = true;
      el.addEventListener('change', function () {
        if (id === 'so-status-filter') renderStockOutBoard(); else renderStockOut();
      });
      if (id === 'so-f-key') el.addEventListener('input', function () { renderStockOut(); });
    });
    var ej = $('so-entry-jump');
    if (ej && !ej._soBound) {
      ej._soBound = true;
      ej.addEventListener('click', function () {
        soOwner = 'live'; renderStockOutBoard();
        var p = $('so-todo-panel'); if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
  function renderStockOutBoard() {
    var kp = $('so-board-kpis'); if (!kp) return;
    soBindFilters();
    renderIdentitySwitch();
    var all = soTodoRows();
    var scoped = all.filter(function (r) { return soTodoMatch(r) && (soOwner === 'all' || soOwnerOf(r) === soOwner); });
    var qtyOf = function (r) { return itemsOf(r).reduce(function (x, i) { return x + n(i.quantity); }, 0); };
    var locked = scoped.reduce(function (a, r) { return a + qtyOf(r); }, 0);
    var pending = scoped.filter(soHandled).length;
    var transit = (D.stockout || []).filter(function (s) { return s.status === 'shipped' || s.status === 'pending_ship'; }).length;
    var ym = new Date().toISOString().slice(0, 7);
    var done = (D.stockout || []).filter(function (s) { return String(s.stockout_date || s.created_at || '').slice(0, 7) === ym; }).length;
    kp.innerHTML = kpiCard('待我处理', scoped.length + ' <small>单</small>', IDENTITY_NAME[curIdentity] + '工作台', 'r') +
      kpiCard('待办涉及数量', locked + ' <small>件</small>', '按当前身份汇总', 'y') +
      kpiCard('在途未签收', transit + ' <small>笔</small>', '仓库已发货，快递在途', 'b') +
      kpiCard('本月已出库', done + ' <small>笔</small>', '含领用出库与邮寄出库', 'g');

    var tabs = $('so-own-tabs');
    if (tabs) {
      tabs.innerHTML = SO_OWNERS.map(function (o) {
        var list = o.key === 'all' ? all : all.filter(function (r) { return soOwnerOf(r) === o.key; });
        var cnt = list.reduce(function (a, r) { return a + qtyOf(r); }, 0);
        return '<button type="button" class="os' + (soOwner === o.key ? ' on' : '') + '" data-so-own="' + o.key + '">' +
          esc(o.name) + ' <span class="so-n">' + (o.key === 'all' ? list.length + ' 单' : cnt + ' 件') + '</span></button>';
      }).join('');
      tabs.querySelectorAll('[data-so-own]').forEach(function (b) {
        b.onclick = function () { soOwner = b.getAttribute('data-so-own'); renderStockOutBoard(); };
      });
    }

    var isTour = soOwner === 'tour';
    var flow = $('so-flow-bar');
    if (flow) {
      var steps = isTour
        ? ['1 计调录入团期物料（此时填团号）', '2 导游线下拿走 · 仓库代登记实拿量', '3 仓库按单盘点核对，一致后确定', '4 确定出库 · 释放锁定']
        : ['1 主播领用锁定（此时填团号）', '2 销售填写并邮寄 · 逐物品分配客户', '3 仓库确定出库（填快递单号）', '4 在途 / 签收 · 释放锁定'];
      flow.innerHTML = steps.map(function (s, i) {
        return '<span class="so-fn ' + ((i === 1 || i === 2) ? 'hot' : '') + '">' + s + '</span>' + (i < 3 ? '<span class="so-fa">›</span>' : '');
      }).join('');
    }
    var cal = $('so-cal-note');
    if (cal) cal.innerHTML = isTour
      ? '<b>口径：</b>计调在领用单模块录入团期物料与<b>团号（必填）</b>，状态「待办理」（锁定、实物未动）；导游线下实际拿走物料（不进系统），由仓库代登记实拿量与领走时间；仓库按计调单据逐项盘点比对计划量与实拿量，一致才确定；确定后扣库存、释放锁定、生成出库单；不一致由仓库盘点人填写差异说明后确定（<b>不设复核角色</b>）。'
      : '<b>口径：</b>主播领用锁定时<b>必须填团号（必填）</b>；销售逐物品<b>手动填写</b>客户邮寄明细（不接客户库，一个物品可寄多个客户），填写并邮寄生成交接单（状态：待仓库确定），库存与锁定不动；仓库确定（填快递单号）后才扣库存、释放锁定、生成出库单。';
    var foot = $('so-foot-note');
    if (foot) foot.innerHTML = isTour
      ? '<b>出团物料链路：</b>计调录入（团号必填）→ 导游线下实际拿走（不进系统，仓库代登记实拿量）→ 仓库按单盘点核对 → 一致确定出库。<br>每一步留痕：录入人/时间、导游姓名/领走时间/实拿量、盘点人/核对结果/差异说明。团号在计调录入时确定，贯穿出库单与团期报表。'
      : '<b>直播礼品链路：</b>主播申请（填团号，必填）→ 销售逐物品手动填写客户信息、填写并邮寄 → 仓库确定出库 → 在途/签收。<b>行政物料 / 总部仓库</b>＝领用人申请 → 仓库确定数量金额 → 出库。<br>团号由主播在领用锁定时填写，贯穿交接单 → 出库单 → 团期报表，销售端只读不可改；客户信息全部手动录入，不接客户库。';
    var ttl = $('so-todo-title');
    if (ttl) {
      var cur = SO_OWNERS.filter(function (o) { return o.key === soOwner; })[0];
      ttl.textContent = '待办明细 · ' + (cur ? cur.name : '全部归属');
    }

    var want = ($('so-status-filter') && $('so-status-filter').value) || '全部状态';
    var list = scoped.filter(function (r) {
      if (want === '待办理') return soStage(r) <= 1;
      if (want === '待仓库确定') return soStage(r) === 2;
      return true;
    });
    var body = $('so-todo-body');
    if (body) {
      if (!list.length) { body.innerHTML = emptyRow(9, '当前归属暂无待办理单据'); }
      else body.innerHTML = list.map(function (r) {
        var its = itemsOf(r);
        var qty = its.reduce(function (a, i) { return a + n(i.quantity); }, 0);
        var tno = soTourNo(r);
        var ci = soCustInfo(r);
        var handled = soHandled(r);
        var status = soStageTag(r);
        var info = ci.n
          ? '<span class="so-cinfo"><span class="filled">已填 ' + ci.n + ' 位客户 · ' + ci.qty + ' 件（预览）</span></span>'
          : '<span class="so-cinfo"><span class="empty">未填写</span></span>';
        var act = soActOf(r);
        return '<tr><td class="lnk">' + esc(r.code || '') + '</td>' +
          '<td>' + (tno ? '<span class="so-tno">' + esc(tno) + '</span>' : '<span class="so-tno empty">未填</span>') + '</td>' +
          '<td>' + esc(r.purpose || r.tour_name || '—') + '</td>' +
          '<td>' + esc(soApplicantName(r) || '—') + (soApplicantAcc(r) != null ? '<small style="color:#a09890"> · ' + esc(accountNameOfId(soApplicantAcc(r))) + '</small>' : '') + '</td>' +
          '<td>' + esc(its.map(function (i) { return i.name; }).join('、') || '—') + '（' + its.length + ' 项）</td>' +
          '<td class="num">' + qty + '</td>' +
          '<td>' + info + '</td><td>' + status + '</td><td>' + act + '</td></tr>';
      }).join('');
    }
    var liveLocked = all.filter(function (r) { return soOwnerOf(r) === 'live'; })
      .reduce(function (a, r) { return a + qtyOf(r); }, 0);
    var en = $('so-entry-num'), lb = $('so-lock-big');
    if (en) en.textContent = liveLocked;
    if (lb) lb.textContent = liveLocked;
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
      si.innerHTML = kpiCard('待仓库确定', pendPO + ' <small>单</small>', '', 'y') +
        kpiCard('部分确定', partPO + ' <small>单</small>', '', 'b') +
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
      spt.innerHTML = kpiCard('待仓库确定退回', pendRet + ' <small>单</small>', '', 'y') +
        kpiCard('已回补', aprvRet + ' <small>单</small>', '', 'g') +
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
      rq.innerHTML = kpiCard('待办理', audit + ' <small>单</small>', '', 'y') +
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
    renderStockOutBoard();
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
    function logout() {
      try {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('inv_session');
        sessionStorage.removeItem('inv_subject');
      } catch (e) {}
      window.location.href = 'index.html';
    }
    var ex = $('hq-btn-exit');
    if (ex) ex.onclick = logout;
    // 侧边栏底部「退出」原来没有任何绑定，点不动（v6.14 修）
    var lo = $('.btn-logout');
    if (lo) lo.onclick = logout;
    var rf = $('hq-btn-refresh');
    if (rf) rf.onclick = function () { loadAll(); };
  }

  // ---------- 启动 ----------
  function boot() {
    // 首屏同步渲染一次（此时云端尚未回来），把 HTML 里的设计稿假数字全部覆盖为真实空态，
    // 避免"先闪几秒假数据、再变成无数据页"。随后 loadAll 云端数据覆盖。
    readMyAccount();
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
    setOwner: function (key) { currentOwner = key; renderMonthly(key); },
    setStockOutOwner: function (key) { soOwner = key; renderStockOutBoard(); },
    setIdentity: function (key) { if (myRoles.indexOf(key) >= 0) { curIdentity = key; renderStockOutBoard(); renderStockOut(); } },
    getIdentity: function () { return curIdentity; },
    getMyRoles: function () { return myRoles.slice(); },
    getMyAccount: function () { return myAccount; },
    soStage: soStage, soFlow: soFlow
  };

  // 设计稿的内联脚本已处理模块切换/展开，这里只补数据。等 DOM 就绪。
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
