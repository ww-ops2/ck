/**
 * HQ Custom - 总部主体专属定制（v6.0）
 * 只在 getCurrentSubject() === 'hq' 时执行；列车主体(train)整个文件零执行、零影响。
 * 职责：在列车原系统仪表盘顶部注入「四大用途归属概览」，数据全部来自 _appCache 真实聚合，
 *       不造假数据。列车已有的 30s 自动同步 + 切回刷新会驱动仪表盘重渲染，本模块随之重算。
 */
(function () {
  'use strict';

  // ---- 主体守卫：非 hq 直接退出，列车主体零影响 ----
  if (typeof getCurrentSubject !== 'function' || getCurrentSubject() !== 'hq') return;

  // ---- 4 归属定义（图标/配色/分类名匹配）----
  var OWNERS = [
    { key: 'live',  icon: '🎁', name: '直播礼品', cat: '直播礼品', cls: 'live' },
    { key: 'tour',  icon: '🚌', name: '出团物料', cat: '出团物料', cls: 'tour' },
    { key: 'admin', icon: '📎', name: '行政物料', cat: '行政物料', cls: 'admin' },
    { key: 'wh',    icon: '🏠', name: '总部仓库', cat: '总部仓库', cls: 'wh' }
  ];

  var INJECTED_ID = 'hq-owner-overview';

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function money(v) {
    v = n(v);
    if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + '万';
    return '¥' + Math.round(v);
  }
  function catOf(item) { return item && (item.category_name || item.category || '未分类'); }

  // ---- 真实数据聚合：按 4 归属分类汇总物品/库存/库存额/待办 ----
  function aggregate() {
    var cache = window._appCache || {};
    var inv = cache.inventory || [];
    var pos = cache.purchaseOrders || [];
    var reqs = cache.requisitions || [];
    var sout = cache.stockOutRecords || [];

    var out = {};
    OWNERS.forEach(function (o) {
      out[o.key] = { items: 0, stock: 0, value: 0, low: 0, pendingIn: 0, inTransit: 0, pendingAudit: 0 };
    });

    // 物品：按分类归属聚合
    inv.forEach(function (it) {
      var c = catOf(it);
      var hit = OWNERS.find(function (o) { return o.cat === c; });
      if (!hit) return;
      var b = out[hit.key];
      b.items += 1;
      b.stock += n(it.stock || it.quantity);
      b.value += n(it.stock || it.quantity) * n(it.unit_price);
      if (n(it.stock || it.quantity) < n(it.safety_stock || 10)) b.low += 1;
    });

    // 采购单待入库：按明细明细分类归属归属
    pos.forEach(function (p) {
      if (p.status !== 'pending_stockin' && p.status !== 'partially_stockin') return;
      var items = (p.items || []);
      var cats = {};
      items.forEach(function (li) { var c = li.category_name || li.category || ''; if (c) cats[c] = 1; });
      Object.keys(cats).forEach(function (c) {
        var hit = OWNERS.find(function (o) { return o.cat === c; });
        if (hit) out[hit.key].pendingIn += 1;
      });
    });

    // 领用单待审核 / 在途（pending_outbound / outbound_completed 未签收近似）
    reqs.forEach(function (r) {
      var items = r.items || [];
      var cats = {};
      items.forEach(function (li) { var c = li.category_name || li.category || ''; if (c) cats[c] = 1; });
      var catKeys = Object.keys(cats).map(function (c) { return OWNERS.find(function (o) { return o.cat === c; }); }).filter(Boolean);
      if (r.status === 'pending' || r.status === 'pending_approval') {
        catKeys.forEach(function (o) { out[o.key].pendingAudit += 1; });
      } else if (r.status === 'pending_outbound' || r.status === 'partially_outbounded') {
        catKeys.forEach(function (o) { out[o.key].inTransit += 1; });
      }
    });

    return out;
  }

  // ---- 生成归属卡 HTML ----
  function cardsHTML(agg) {
    return OWNERS.map(function (o) {
      var b = agg[o.key];
      var midLabel, midVal, midCls;
      if (o.key === 'live')       { midLabel = '锁定';   midVal = b.inTransit; midCls = 'red'; }
      else if (o.key === 'tour')  { midLabel = '在途';   midVal = b.inTransit; midCls = 'blu'; }
      else if (o.key === 'admin') { midLabel = '低库存'; midVal = b.low;       midCls = 'yel'; }
      else                        { midLabel = '待调拨'; midVal = b.pendingIn; midCls = 'yel'; }
      var tag = (b.low > 0 || b.inTransit > 0) ? '进行中' : '平稳';
      var tagCls = tag === '平稳' ? ' ok' : '';
      return '' +
        '<div class="own-card ' + o.cls + '">' +
          '<div class="oc-head"><span class="oc-ic">' + o.icon + '</span><span class="oc-name">' + o.name + '</span><span class="oc-tag' + tagCls + '">' + tag + '</span></div>' +
          '<div class="oc-grid">' +
            '<div><span>物品</span><b>' + b.items + ' <i>种</i></b></div>' +
            '<div><span>库存</span><b>' + b.stock + ' <i>件</i></b></div>' +
            '<div><span>' + midLabel + '</span><b class="' + midCls + '">' + midVal + ' <i>' + (midLabel === '低库存' ? '种' : '笔') + '</i></b></div>' +
            '<div><span>库存额</span><b>' + money(b.value) + '</b></div>' +
          '</div>' +
          '<div class="oc-foot">' +
            '<span class="st"><i style="background:var(--accent)"></i>待入库 <b>' + b.pendingIn + '</b></span>' +
            '<span class="st"><i style="background:var(--info)"></i>在途 <b>' + b.inTransit + '</b></span>' +
            '<span class="st"><i style="background:var(--warning)"></i>待审核 <b>' + b.pendingAudit + '</b></span>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  // ---- 注入样式（用列车 CSS 变量 + 兜底别名，不碰 style.css）----
  function ensureStyle() {
    if (document.getElementById('hq-owner-style')) return;
    var s = document.createElement('style');
    s.id = 'hq-owner-style';
    s.textContent = '' +
      ':root{--bg-card:var(--bg2,#fff);--accent-glow:rgba(194,54,22,.1);--success-bg:rgba(45,134,89,.12);--text-secondary:var(--text-secondary,#6b635a);--text-primary:var(--text,#2d261f)}' +
      '.hq-owner-wrap{margin:4px 0 20px}' +
      '.hq-owner-title{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:15px;font-weight:800;color:var(--text)}' +
      '.hq-owner-title .bar{width:4px;height:16px;border-radius:2px;background:var(--accent)}' +
      '.hq-owner-title .asof{margin-left:auto;font-size:11px;font-weight:400;color:var(--text-muted)}' +
      '.own-overview{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}' +
      '.own-card{border:1.5px solid var(--border);border-radius:var(--sketch-r1);padding:16px 17px;background:var(--bg2,#fff);box-shadow:var(--shadow-card);position:relative;overflow:hidden}' +
      '.own-card:nth-child(2){border-radius:var(--sketch-r2)}.own-card:nth-child(3){border-radius:var(--sketch-r3)}.own-card:nth-child(4){border-radius:var(--sketch-r4)}' +
      '.own-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px}' +
      '.own-card.live::before{background:var(--accent)}.own-card.tour::before{background:var(--info)}.own-card.admin::before{background:var(--purple)}.own-card.wh::before{background:var(--success)}' +
      '.oc-head{display:flex;align-items:center;gap:9px;margin-bottom:13px}' +
      '.oc-ic{font-size:19px}.oc-name{font-size:14.5px;font-weight:800;color:var(--text)}' +
      '.oc-tag{margin-left:auto;font-size:10px;padding:2px 8px;border-radius:var(--sketch-sm);background:var(--accent-glow);color:var(--accent);font-weight:700}' +
      '.oc-tag.ok{background:var(--success-bg);color:var(--success)}' +
      '.oc-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px 8px;padding-bottom:12px;border-bottom:1px dashed var(--border)}' +
      '.oc-grid>div{display:flex;flex-direction:column;gap:2px}' +
      '.oc-grid span{font-size:10.5px;color:var(--text-muted)}' +
      '.oc-grid b{font-size:19px;font-weight:800;letter-spacing:-.4px;color:var(--text)}' +
      '.oc-grid b i{font-size:10.5px;font-style:normal;font-weight:500;color:var(--text-muted)}' +
      '.oc-grid b.red{color:var(--accent)}.oc-grid b.blu{color:var(--info)}.oc-grid b.yel{color:var(--warning)}' +
      '.oc-foot{display:flex;gap:12px;flex-wrap:wrap;padding-top:11px}' +
      '.oc-foot .st{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text-muted)}' +
      '.oc-foot .st i{width:6px;height:6px;border-radius:50%}' +
      '.oc-foot .st b{color:var(--text);font-size:12px}' +
      '@media(max-width:1100px){.own-overview{grid-template-columns:repeat(2,1fr)}}';
    document.head.appendChild(s);
  }

  // ---- 渲染/重绘归属概览（幂等）----
  function renderOwnerOverview() {
    try {
      ensureStyle();
      var dash = document.getElementById('module-dashboard');
      if (!dash) return;
      var wrap = document.getElementById(INJECTED_ID);
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = INJECTED_ID;
        wrap.className = 'hq-owner-wrap';
        // 插到 dash-head 之后、今日待办之前
        var head = dash.querySelector('.dash-head');
        if (head && head.nextSibling) dash.insertBefore(wrap, head.nextSibling);
        else dash.insertBefore(wrap, dash.firstChild);
      }
      var agg = aggregate();
      var now = new Date().toLocaleTimeString('zh-CN');
      wrap.innerHTML =
        '<div class="hq-owner-title"><span class="bar"></span>四大用途归属 · 概览<span class="asof">数据截至 ' + now + ' · 每 30 秒自动同步</span></div>' +
        '<div class="own-overview">' + cardsHTML(agg) + '</div>';
    } catch (e) {
      console.warn('[HQCustom] renderOwnerOverview failed:', e);
    }
  }

  // ---- Hook 仪表盘渲染：loadDashboard 与 _dashRenderFromCache 之后重绘 ----
  function hookDashboard() {
    if (typeof window._dashRenderFromCache === 'function') {
      var origCache = window._dashRenderFromCache;
      window._dashRenderFromCache = function () {
        var r = origCache.apply(this, arguments);
        renderOwnerOverview();
        return r;
      };
    }
    if (typeof window.loadDashboard === 'function') {
      var origLoad = window.loadDashboard;
      window.loadDashboard = function () {
        var r = origLoad.apply(this, arguments);
        // loadDashboard 内部多次调 _dashRenderFromCache（已被 hook），这里再补一次确保覆盖
        if (r && typeof r.then === 'function') {
          return r.then(function (v) { renderOwnerOverview(); return v; });
        }
        renderOwnerOverview();
        return r;
      };
    }
  }

  // 模块切换进仪表盘时也刷新一次（navigation 的 switchModule/loadModuleData 之后）
  function hookSwitch() {
    if (typeof window.switchModule === 'function') {
      var origSwitch = window.switchModule;
      window.switchModule = function (mod) {
        var r = origSwitch.apply(this, arguments);
        if (mod === 'dashboard') setTimeout(renderOwnerOverview, 60);
        return r;
      };
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) setTimeout(renderOwnerOverview, 100);
    });
  }

  // ---- 启动：等 DOM 就绪后挂钩（app.js 在本文件之前加载，函数均已定义）----
  function boot() {
    hookDashboard();
    hookSwitch();
    renderOwnerOverview();
    // 轻量兜底：仪表盘可见时定时重绘（列车已有 30s 同步，这里 8s 仅保证卡片及时跟随 _appCache）
    setInterval(function () {
      var dash = document.getElementById('module-dashboard');
      if (dash && dash.classList && dash.classList.contains('active')) renderOwnerOverview();
    }, 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
