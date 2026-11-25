/**
 * HQ Actions - 遇见美好总部：按钮 / 附属弹窗页 / 真实写库（v6.3）
 * 依赖：hq-app.js 暴露的 window.HQApp（同一份 D 数据与 renderAll 入口）
 * 所有写操作一律经 SupaDB.* 落 Supabase；所有删除/仓库确定走自定义确认弹窗。
 * v6.12：六链路流转，末端岗位统一「仓库」，全流程无审核、无核销节点（底层 API 名保留历史命名）。
 */
(function () {
  'use strict';

  var H = window.HQApp;
  if (!H) { console.warn('[HQ Actions] HQApp 未就绪'); return; }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function findIn(arr, id) { return (arr || []).find(function (x) { return String(x.id) === String(id); }); }

  // ---------- 模态框基座 ----------
  var STYLE = [
    '#hq-modal-root .hqm-mask{position:fixed;inset:0;background:rgba(45,38,32,.42);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;overflow:auto}',
    '#hq-modal-root .hqm{background:#fff;border:1.5px solid #d4cdc4;border-radius:17px 8px 19px 9px/9px 19px 8px 17px;width:min(1080px,100%);box-shadow:0 18px 50px rgba(45,38,32,.22);animation:hqmA .16s ease-out}',
    '@keyframes hqmA{from{transform:translateY(9px);opacity:.4}to{transform:none;opacity:1}}',
    '#hq-modal-root .hqm-head{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1.5px solid #e8e2da;font-size:15px;font-weight:800}',
    '#hq-modal-root .hqm-x{border:none;background:none;font-size:22px;line-height:1;cursor:pointer;color:#a09890}',
    '#hq-modal-root .hqm-body{padding:18px 20px;max-height:68vh;overflow:auto}',
    '#hq-modal-root .hqm-foot{display:flex;justify-content:flex-end;gap:9px;padding:13px 20px;border-top:1.5px solid #e8e2da}',
    '#hq-modal-root .hqf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
    '#hq-modal-root .hqf{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:#5e554c;font-weight:600}',
    '#hq-modal-root .hqf input,#hq-modal-root .hqf select,#hq-modal-root .hqf textarea{border:1.5px solid #d4cdc4;border-radius:8px 3px 9px 4px/4px 9px 3px 8px;padding:8px 10px;font-size:12.5px;font-family:inherit;color:#2d2620;background:#fff;width:100%}',
    '#hq-modal-root .hqf input:focus,#hq-modal-root .hqf select:focus{outline:none;border-color:#c23616}',
    '#hq-modal-root .hq-sec{font-size:12.5px;font-weight:800;margin:16px 0 9px;display:flex;align-items:center;gap:7px}',
    '#hq-modal-root .hq-sec::before{content:"";width:3px;height:14px;background:#c23616;border-radius:2px}',
    '#hq-modal-root .hq-line{display:flex;gap:6px;align-items:center;margin-bottom:7px;flex-wrap:wrap}',
    '#hq-modal-root .hq-line input,#hq-modal-root .hq-line select{border:1.5px solid #d4cdc4;border-radius:7px;padding:6px 8px;font-size:12px;font-family:inherit;flex:1 1 96px;min-width:72px;color:#2d2620;background:#fff}',
    '#hq-modal-root .hq-line input[type=number]{max-width:92px}',
    '#hq-modal-root .hq-del{border:1.5px solid #e8e2da;background:#fff;color:#c0392b;border-radius:7px;width:27px;height:29px;cursor:pointer;font-size:15px;flex:0 0 27px}',
    '#hq-modal-root .hq-addline{border:1.5px dashed #a8a098;background:transparent;color:#5e554c;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;margin-top:4px;font-family:inherit}',
    '#hq-modal-root .hq-pick{border:1.5px solid #c23616;background:#fff;color:#c23616;border-radius:7px;padding:5px 8px;cursor:pointer;font-size:11px;font-family:inherit;flex:0 0 auto;font-weight:700}',
    '#hq-modal-root .hq-pick-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e8e2da;border-radius:9px;margin-bottom:7px;font-size:12.5px}',
    '#hq-modal-root .hq-pick-row span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#hq-modal-root .hq-pick-row small{color:#a09890;font-size:11px}',
    '#hq-modal-root .hq-pick-row .stk{color:#5e554c;white-space:nowrap}',
    '#hq-modal-root .hq-msg{font-size:13.5px;line-height:1.9;color:#5e554c}',
    '#hq-modal-root .hq-notice{font-size:12px;line-height:1.7;color:#8a5a12;background:#fff9e6;border:1.5px solid #f0d9a8;border-radius:8px;padding:9px 12px;margin:12px 0}',
    '#hq-modal-root .hqf-grid>select,#hq-modal-root .hqf-grid>input{border:1.5px solid #d4cdc4;border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:inherit;color:#2d2620;background:#fff;width:100%}',
    '#hq-modal-root .po-group select,#hq-modal-root .po-group input[type=text],#hq-modal-root .po-group input:not([type]){border:1.5px solid #d4cdc4;border-radius:6px;padding:7px 8px;font-size:12.5px;font-family:inherit;width:100%;min-width:0;height:34px;box-sizing:border-box;background:#fff;color:#2d2620}',
    '#hq-modal-root .po-group input[type=number]{border:1.5px solid #d4cdc4;border-radius:6px;padding:7px 6px;font-size:12.5px;font-family:inherit;width:100%;min-width:0;height:34px;box-sizing:border-box;background:#fff;color:#2d2620}',
    '#hq-modal-root .po-group th{font-size:11.5px;white-space:nowrap;padding:8px 6px}',
    '#hq-modal-root .po-group td{padding:6px}',
    '#hq-modal-root .hq-detail{font-size:12.5px;color:#5e554c;line-height:1.95}',
    '#hq-modal-root .hq-detail b{color:#2d2620}',
    '.row-act{background:none;border:none;color:#c23616;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;padding:0 2px}',
    '.row-act:hover{text-decoration:underline}',
    '.hq-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:hqSpin .7s linear infinite;vertical-align:-2px}',
    '@keyframes hqSpin{to{transform:rotate(360deg)}}',
    '.hq-toast{position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#2d2620;color:#fff;padding:10px 20px;border-radius:9px;z-index:9999;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:80vw;text-align:center}',
    '.hq-toast.err{background:#c0392b}',
    // 列车 toast.js 组件样式：独立页无 style.css，这里补等价视觉基座（不依赖 CSS 变量）
    '#toast-container{position:fixed;top:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:400px}',
    '#toast-container .toast{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;background:#fff;border:1.5px solid #d4cdc4;border-radius:11px;box-shadow:0 8px 24px rgba(45,38,32,.16);pointer-events:auto;opacity:0;transform:translateX(40px);transition:opacity .3s,transform .3s;min-width:260px}',
    '#toast-container .toast.show{opacity:1;transform:translateX(0)}',
    '#toast-container .toast.hide{opacity:0;transform:translateX(40px)}',
    '#toast-container .toast-icon{flex-shrink:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;margin-top:1px}',
    '#toast-container .toast-success{border-left:3px solid #16a34a}',
    '#toast-container .toast-success .toast-icon{color:#16a34a}',
    '#toast-container .toast-error{border-left:3px solid #c0392b}',
    '#toast-container .toast-error .toast-icon{color:#c0392b}',
    '#toast-container .toast-warning{border-left:3px solid #d97706}',
    '#toast-container .toast-warning .toast-icon{color:#d97706}',
    '#toast-container .toast-info{border-left:3px solid #2563eb}',
    '#toast-container .toast-info .toast-icon{color:#2563eb}',
    '#toast-container .toast-message{flex:1;font-size:13px;line-height:1.5;color:#2d2620;word-break:break-word}',
    '#toast-container .toast-close{flex-shrink:0;background:none;border:none;font-size:16px;color:#a09890;cursor:pointer;padding:0;line-height:1}',
    '#custom-confirm-overlay{position:fixed;inset:0;z-index:99998;background:rgba(45,38,32,.34);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}',
    '#custom-confirm-overlay.show{opacity:1}',
    '#custom-confirm-overlay .confirm-dialog{background:#fff;border:1.5px solid #d4cdc4;border-radius:13px;box-shadow:0 12px 40px rgba(45,38,32,.25);padding:26px 30px 22px;max-width:400px;width:90%;text-align:center;transform:scale(.94);transition:transform .25s}',
    '#custom-confirm-overlay.show .confirm-dialog{transform:scale(1)}',
    '#custom-confirm-overlay .confirm-icon{color:#d97706;margin-bottom:12px}',
    '#custom-confirm-overlay .confirm-message{font-size:14px;line-height:1.7;color:#2d2620;margin-bottom:20px}',
    '#custom-confirm-overlay .confirm-actions{display:flex;gap:10px;justify-content:center}',
    '#custom-confirm-overlay .confirm-actions .btn{padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;border:1.5px solid #d4cdc4;background:#fff;color:#2d2620}',
    '#custom-confirm-overlay .confirm-actions .btn-danger{background:#c0392b;border-color:#c0392b;color:#fff}',
    '#custom-confirm-overlay .prompt-input{width:100%;padding:9px 11px;border:1.5px solid #d4cdc4;border-radius:8px;margin-bottom:18px;font-size:13px;font-family:inherit}',
    '.btn-loading{position:relative;pointer-events:none;opacity:.85}',
    '.btn-loading .spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:hqBtnSpin .6s linear infinite;vertical-align:-2px;margin-right:6px}',
    '@keyframes hqBtnSpin{to{transform:rotate(360deg)}}'
  ].join('\n');

  function ensureModal() {
    var root = $('#hq-modal-root');
    if (root) return root;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'hq-modal-root'; document.body.appendChild(root);
    return root;
  }
  function openModal(title, bodyHTML, footHTML) {
    var root = ensureModal();
    root.innerHTML = '<div class="hqm-mask"><div class="hqm">' +
      '<div class="hqm-head"><b>' + esc(title) + '</b><button class="hqm-x" aria-label="关闭">×</button></div>' +
      '<div class="hqm-body">' + bodyHTML + '</div>' +
      '<div class="hqm-foot">' + (footHTML || '') + '</div></div></div>';
    var mask = $('.hqm-mask', root);
    function close() { root.innerHTML = ''; }
    $('.hqm-x', root).onclick = close;
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    return { root: root, body: $('.hqm-body', root), foot: $('.hqm-foot', root), close: close };
  }
  // 通用 UI 直接复用列车 toast.js：showToast / showButtonLoading / hideButtonLoading / showConfirm
  function toast(msg, kind) {
    if (typeof showToast === 'function') return showToast(msg, kind === 'err' ? 'error' : 'success');
    var old = $('.hq-toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'hq-toast' + (kind === 'err' ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3200);
  }
  function busy(btn, text, on) {
    if (!btn) return;
    if (typeof showButtonLoading === 'function' && typeof hideButtonLoading === 'function') {
      if (on) showButtonLoading(btn, text || '处理中'); else hideButtonLoading(btn);
      return;
    }
    if (on) {
      if (btn.dataset._html === undefined) btn.dataset._html = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="hq-spin"></span> ' + (text || '处理中');
    } else {
      btn.disabled = false;
      if (btn.dataset._html !== undefined) { btn.innerHTML = btn.dataset._html; delete btn.dataset._html; }
    }
  }
  function confirmBox(title, msg, onOk, opts) {
    opts = opts || {};
    if (typeof showConfirm === 'function') {
      // 列车统一确认弹窗：onConfirm 返回 Promise 时自带等待动画并在完成后自动关闭
      showConfirm('<b>' + esc(title) + '</b><br>' + esc(msg).replace(/\n/g, '<br>'), function () {
        return Promise.resolve().then(onOk).then(function () {
          toast(opts.okText || '已完成'); H.loadAll();
        }).catch(function (e) {
          toast('操作失败：' + (e && e.message || e), 'err');
        });
      });
      var okBtn = $('#confirm-ok-btn');
      if (okBtn) {
        if (opts.confirmText) okBtn.textContent = opts.confirmText;
        if (opts.danger) okBtn.classList.add('btn-danger');
      }
      return;
    }
    // 兜底：toast.js 未加载时保留原有自建弹窗
    var m = openModal(title, '<div class="hq-msg">' + esc(msg).replace(/\n/g, '<br>') + '</div>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-ok>' + esc(opts.confirmText || '确认') + '</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-ok]', m.root).onclick = function () {
      var b = this; busy(b, '处理中', true);
      Promise.resolve().then(onOk).then(function () { m.close(); toast(opts.okText || '已完成'); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('操作失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ---------- 表单工具 ----------
  function field(label, name, val, type, options) {
    type = type || 'text'; options = options || {};
    var input;
    if (type === 'select') {
      input = '<select name="' + esc(name) + '">' + (options.options || []).map(function (o) {
        var v = (o && typeof o === 'object') ? o.v : o;
        var t = (o && typeof o === 'object') ? o.t : o;
        return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>';
    } else if (type === 'textarea') {
      input = '<textarea name="' + esc(name) + '" rows="2">' + esc(val || '') + '</textarea>';
    } else {
      input = '<input name="' + esc(name) + '" type="' + type + '" value="' + esc(val == null ? '' : val) + '"' + (options.attrs || '') + '>';
    }
    return '<label class="hqf"><span>' + esc(label) + '</span>' + input + '</label>';
  }
  function formValues(form) {
    var out = {};
    $$('[name]', form).forEach(function (el) {
      out[el.name] = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
    });
    return out;
  }
  function ownNames() {
    var names = (H.D.categories || []).map(function (c) { return c.name; });
    H.OWNERS.forEach(function (o) { if (names.indexOf(o.name) < 0) names.unshift(o.name); });
    if (names.indexOf('未分类') < 0) names.push('未分类');
    return names;
  }
  function ownOpts(sel) {
    return ownNames().map(function (n) {
      return '<option value="' + esc(n) + '"' + (String(sel) === n ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }

  // 归属名 → 台账 usage_code（与 20261123_hq_foundation.sql 预置一致）
  var USAGE_CODE = { '直播礼品': 'live_gift', '出团物料': 'tour_material', '行政物料': 'admin_material', '总部仓库': 'warehouse' };
  function usageCodeOf(cat) {
    if (!cat) return 'warehouse';
    if (USAGE_CODE[cat]) return USAGE_CODE[cat];
    var hit = (H.D.categories || []).find(function (c) { return c.name === cat || c.code === cat; });
    return hit && hit.code ? hit.code : 'warehouse';
  }
  /**
   * 业务单据落库后同步过账到总部台账：复用列车已做好的 HQFoundation.postDocument，
   * 自动单号 / 幂等 / 平衡公式 / 流水全部由地基引擎负责。台账异常只告警，不阻断业务。
   */
  function postLedger(docType, lines, category, dateStr, bizDocNo) {
    if (!window.HQFoundation || typeof HQFoundation.postDocument !== 'function') return Promise.resolve([]);
    var period = String(dateStr || today()).slice(0, 7);
    var jobs = (lines || []).map(function (x, i) {
      var qty = num(x.actual_quantity != null ? x.actual_quantity : x.quantity);
      if (qty <= 0) return null;
      return HQFoundation.postDocument({
        doc_type: docType,
        period: period,
        usage_code: usageCodeOf(x.category || category),
        item: { item_id: x.item_id || x.inventory_item_id || null, sku: x.code || null, name: x.name },
        qty: qty,
        // 业务单号+行号做台账单号：天然幂等，且红冲可按业务单号前缀反查
        doc_no: bizDocNo ? bizDocNo + '-' + (i + 1) : undefined,
        meta: { source: 'hq-app', biz_doc: bizDocNo || null }
      });
    }).filter(Boolean);
    if (!jobs.length) return Promise.resolve([]);
    return Promise.all(jobs.map(function (p) {
      return Promise.resolve(p).catch(function (e) { return { ok: false, error: String(e && e.message || e) }; });
    })).then(function (rs) {
      var bad = rs.filter(function (r) { return r && r.ok === false; });
      if (bad.length) console.warn('[HQ台账] 过账未完全成功（业务单据已落库）', bad);
      return rs;
    });
  }

  /** 可增删的明细编辑表，返回 get() 取当前行数组 */
  /** 从库存选择已有物品（对齐列车 purchase.js 的 picker：分类筛选 + 关键字搜索 + 库存量展示） */
  function openInvPicker(onPick) {
    var inv = H.D.inventory || [];
    var cats = [];
    inv.forEach(function (x) { var c = x.category_name || x.category || '未分类'; if (cats.indexOf(c) < 0) cats.push(c); });
    var m = openModal('从库存选择已有物品',
      '<div class="hqf-grid">' +
      field('用途归属', 'cat', '', 'select', { options: ['全部归属'].concat(cats) }) +
      field('搜索（名称/编码/品牌/型号）', 'kw', '') +
      '</div><div id="hq-inv-pick-list" style="margin-top:14px"></div>',
      '<button class="btn" data-hq-cancel>关闭</button>');
    var list = $('#hq-inv-pick-list', m.root);
    function renderList() {
      var cat = $('[name="cat"]', m.root).value;
      var kw = String($('[name="kw"]', m.root).value || '').trim().toLowerCase();
      var items = inv.filter(function (x) {
        var c = x.category_name || x.category || '未分类';
        if (cat !== '全部归属' && c !== cat) return false;
        if (!kw) return true;
        return [x.name, x.code, x.brand, x.model, c].some(function (v) { return String(v || '').toLowerCase().indexOf(kw) >= 0; });
      });
      list.innerHTML = items.length ? items.map(function (x) {
        var c = x.category_name || x.category || '未分类';
        return '<div class="hq-pick-row"><span><b>' + esc(x.name) + '</b> <small>' + esc(x.code || '无编码') +
          ' · ' + esc(x.brand || '') + ' ' + esc(x.model || '') + ' · ' + esc(c) + '</small></span>' +
          '<span class="stk">库存 ' + num(x.stock) + esc(x.unit || '') + '</span>' +
          '<button type="button" class="btn" data-pick="' + esc(x.id) + '">添加</button></div>';
      }).join('') : '<div class="hq-msg">未找到匹配的库存物品</div>';
    }
    $('[name="cat"]', m.root).onchange = renderList;
    $('[name="kw"]', m.root).oninput = renderList;
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pick]'); if (!btn) return;
      var item = inv.find(function (x) { return String(x.id) === btn.getAttribute('data-pick'); });
      if (item) { m.close(); onPick(item); }
    });
    renderList();
  }

  function linesEditor(mount, initial, withPrice) {
    var rows = JSON.parse(JSON.stringify(initial || []));
    var dlId = 'hq-inv-names-' + Math.random().toString(36).slice(2, 8);
    function invByName(name) {
      var n = String(name || '').trim().toLowerCase();
      return (H.D.inventory || []).find(function (x) { return String(x.name || '').trim().toLowerCase() === n; });
    }
    function fillFromInv(row, item) {
      if (!item || !row) return;
      row.code = item.code || row.code || '';
      row.brand = item.brand || row.brand || '';
      row.model = item.model || row.model || '';
      row.unit = item.unit || row.unit || '';
      if (!row.category || row.category === '未分类') row.category = item.category_name || item.category || row.category;
      if (withPrice && !row.price) row.price = item.unit_price || '';
      row.item_id = item.id;
    }
    function render() {
      mount.innerHTML = '<datalist id="' + dlId + '">' + (H.D.inventory || []).map(function (x) {
        return '<option value="' + esc(x.name) + '">';
      }).join('') + '</datalist>' + rows.map(function (r, i) {
        return '<div class="hq-line" data-i="' + i + '">' +
          '<input data-k="name" list="' + dlId + '" placeholder="物品名称（可搜索库存）" value="' + esc(r.name || '') + '">' +
          '<button type="button" class="hq-pick" data-i="' + i + '" title="从库存选择">库存</button>' +
          '<input data-k="code" placeholder="编码" value="' + esc(r.code || '') + '">' +
          '<input data-k="brand" placeholder="品牌" value="' + esc(r.brand || '') + '">' +
          '<input data-k="model" placeholder="型号" value="' + esc(r.model || '') + '">' +
          '<select data-k="category">' + ownOpts(r.category || r.category_name) + '</select>' +
          '<input data-k="quantity" type="number" min="0" step="0.01" placeholder="数量" value="' + esc(r.quantity == null ? '' : r.quantity) + '">' +
          '<input data-k="unit" placeholder="单位" value="' + esc(r.unit || '') + '">' +
          (withPrice ? '<input data-k="price" type="number" min="0" step="0.01" placeholder="单价" value="' + esc(r.price == null ? '' : r.price) + '">' : '') +
          '<button type="button" class="hq-del" data-i="' + i + '" title="删除该行">×</button></div>';
      }).join('') + '<button type="button" class="hq-addline">+ 添加明细行</button>';
    }
    ['input', 'change'].forEach(function (evt) {
      mount.addEventListener(evt, function (e) {
        var k = e.target.getAttribute('data-k'); if (!k) return;
        var i = Number(e.target.parentNode.getAttribute('data-i'));
        if (!rows[i]) return;
        rows[i][k] = e.target.value;
        if (k === 'name' && evt === 'change') { fillFromInv(rows[i], invByName(e.target.value)); render(); }
      });
    });
    mount.addEventListener('click', function (e) {
      if (e.target.classList.contains('hq-addline')) { rows.push({ name: '', code: '', brand: '', model: '', category: ownNames()[0], quantity: '', unit: '', price: '' }); render(); }
      if (e.target.classList.contains('hq-del')) { rows.splice(Number(e.target.getAttribute('data-i')), 1); render(); }
      if (e.target.classList.contains('hq-pick')) {
        var i = Number(e.target.getAttribute('data-i'));
        openInvPicker(function (item) { fillFromInv(rows[i], item); render(); });
      }
    });
    render();
    return {
      get: function () { return rows.filter(function (r) { return String(r.name || '').trim(); }); },
      addRow: function (row) { rows.push(row); render(); }
    };
  }
  function attachItemId(items) {
    return items.map(function (it) {
      var o = Object.assign({}, it);
      var hit = (H.D.inventory || []).find(function (x) {
        return (it.item_id && String(x.id) === String(it.item_id)) ||
          (it.code && String(x.code) === String(it.code)) ||
          (it.name && String(x.name).trim().toLowerCase() === String(it.name).trim().toLowerCase());
      });
      if (hit) o.item_id = hit.id;
      o.quantity = num(o.quantity); o.price = num(o.price);
      if (!o.category || o.category === '未分类') o.category = hit ? (hit.category_name || hit.category || '未分类') : '未分类';
      if (!o.unit && hit) o.unit = hit.unit;
      if (!o.brand && hit) o.brand = hit.brand;
      if (!o.model && hit) o.model = hit.model;
      return o;
    });
  }

  // ---------- 库存物品 ----------
  function editItem(id, btn) {
    var it = id ? findIn(H.D.inventory, id) : null;
    var oldStock = it ? num(it.stock) : 0;
    var m = openModal(it ? '编辑物品 · ' + (it.code || '') : '新增物品（首次盘库）',
      '<form id="hq-item-form"><div class="hqf-grid">' +
      field('物品名称', 'name', it && it.name, 'text', { attrs: 'required' }) +
      field('编码（留空自动生成）', 'code', it && it.code) +
      field('品牌', 'brand', it && it.brand) +
      field('规格 / 型号', 'model', it && it.model) +
      field('单位', 'unit', it && it.unit || '个') +
      field('单价（元）', 'unit_price', it && it.unit_price || 0, 'number', { attrs: 'min="0" step="0.01"' }) +
      field('库存数量', 'stock', it ? num(it.stock) : 0, 'number', { attrs: 'min="0" step="0.01"' }) +
      field('安全库存', 'safety_stock', it && it.safety_stock || 10, 'number', { attrs: 'min="0" step="1"' }) +
      field('用途归属', 'category_name', it && (it.category_name || it.category), 'select', { options: ownNames() }) +
      '</div><div class="hq-msg" style="margin-top:14px;font-size:11.5px">首次盘库可在此直接录入初始库存，也能修改物品全部字段。日常数量增减仍需走采购入库 / 领用出库 / 报损单据；手工改动会自动生成调整记录，全程可追溯。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>' + (it ? '保存修改' : '创建物品') + '</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-item-form', m.root);
      if (!f.reportValidity()) return;
      var v = formValues(f);
      var newStock = num(v.stock), delta = newStock - oldStock;
      var payload = {
        name: v.name, code: v.code, brand: v.brand, model: v.model, unit: v.unit,
        unit_price: num(v.unit_price), stock: newStock,
        safety_stock: num(v.safety_stock), category_name: v.category_name
      };
      if (!payload.code) delete payload.code;
      busy(b, '保存中', true);
      Promise.resolve(it ? SupaDB.updateInventoryItem(it.id, payload) : SupaDB.createInventoryItem(payload))
        .then(function (saved) {
          // 库存有变动就写调整记录（复用列车同款 SupaDB.createInventoryAdjustment，自动带审计日志）
          if (Math.abs(delta) < 0.0001 || !SupaDB.createInventoryAdjustment) return saved;
          var adj = {
            inventory_item_id: it ? it.id : (saved && saved.id),
            item_code: payload.code || (saved && saved.code) || v.name,
            delta: delta, new_stock: newStock,
            reason: it ? '总部手工调整（盘库/修正）' : '首次盘库建账',
            created_by: (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || 'system'
          };
          if (!adj.inventory_item_id) return saved;
          return Promise.resolve(SupaDB.createInventoryAdjustment(adj))
            .catch(function (e) { console.warn('[HQ] 调整记录落库失败', e.message); })
            .then(function () { return saved; });
        })
        .then(function () { m.close(); toast(it ? '物品已更新（库存变动已记账）' : '物品已创建'); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ---------- 用途归属 ----------
  function addCategory(btn) {
    var m = openModal('新增用途归属',
      '<form id="hq-cat-form"><div class="hqf-grid">' +
      field('归属名称', 'name', '', 'text', { attrs: 'required placeholder="例如：直播礼品"' }) +
      '</div><div class="hq-msg" style="margin-top:12px;font-size:11.5px">新归属会同步进入采购单、领用单、库存物品的归属下拉。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>创建归属</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-cat-form', m.root);
      if (!f.reportValidity()) return;
      var name = formValues(f).name;
      busy(b, '创建中', true);
      Promise.resolve(SupaDB.createCategory(name)).then(function () { m.close(); toast('归属已创建：' + name); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('创建失败：' + (e && e.message || e), 'err'); });
    };
  }
  function editCategory(card) {
    var name = $('.nm', card) ? $('.nm', card).textContent.trim() : '';
    if (!name) return;
    var meta = $('.meta', card) ? $('.meta', card).textContent.trim() : '';
    var cat = (H.D.categories || []).find(function (c) { return c.name === name; });
    var m = openModal('用途归属 · ' + name,
      '<div class="hq-detail"><b>归属名称：</b>' + esc(name) + '<br><b>说明：</b>' + esc(meta || '—') + '<br><b>物品数：</b>' + ($('.cnt', card) ? $('.cnt', card).textContent : '0') + '</div>' +
      (cat ? '<form id="hq-cat-edit" style="margin-top:14px"><div class="hqf-grid">' + field('重命名归属', 'newName', name, 'text', { attrs: 'required' }) + '</div></form>' : '<div class="hq-msg" style="margin-top:12px;font-size:11.5px">该归属为系统预置，名称不可修改。</div>'),
      (cat ? '<button class="btn" data-hq-del style="margin-right:auto;color:#c0392b">删除</button>' : '') +
      '<button class="btn" data-hq-cancel>关闭</button>' + (cat ? '<button class="btn primary" data-hq-save>保存</button>' : ''));
    $('[data-hq-cancel]', m.root).onclick = m.close;
    if (cat) {
      $('[data-hq-save]', m.root).onclick = function () {
        var b = this, f = $('#hq-cat-edit', m.root); if (!f.reportValidity()) return;
        var nn = formValues(f).newName; busy(b, '保存中', true);
        Promise.resolve(SupaDB.updateCategory(cat.id, nn)).then(function () { m.close(); toast('归属已更新'); H.loadAll(); })
          .catch(function (e) { busy(b, null, false); toast('失败：' + (e && e.message || e), 'err'); });
      };
      $('[data-hq-del]', m.root).onclick = function () {
        confirmBox('删除用途归属', '确认删除「' + name + '」？已被物品使用的归属删除后物品会显示为未分类。', function () {
          return SupaDB.deleteCategory(cat.id);
        }, { danger: true, confirmText: '确认删除', okText: '已删除' });
      };
    }
  }

  // ---------- 采购单（对齐列车模板 + 总部4归属定制） ----------
  // 表格列：类别/物品名称/品牌/型号/数量/单位/单价/金额/操作，供应商行选填，小计实时联动
  function editPO(id, btn) {
    var p = id ? findIn(H.D.purchase, id) : null;
    var its = p ? H.itemsOf(p).map(function (x) { return { name: x.name, code: x.code, brand: x.brand, model: x.model, category: x.category, quantity: x.quantity, unit: x.unit, price: x.price, item_id: x.item_id || x.inventory_item_id }; }) : [];
    var suppliers = [];
    if (p && p.suppliers) { try { suppliers = typeof p.suppliers === 'string' ? JSON.parse(p.suppliers) : p.suppliers; } catch (e) {} }
    var m = openModal(p ? '编辑采购单 · ' + (p.code || '') : '新建采购单',
      '<form id="hq-po-form">' +
      '<div class="hqf-grid">' +
      field('采购日期 *', 'purchase_date', p && p.purchase_date || today(), 'date', { attrs: 'required' }) +
      field('采购人 *', 'purchaser', p && p.purchaser || (function(){try{var u=JSON.parse(localStorage.getItem('currentUser')||'null');return u&&u.name||'';}catch(e){return '';}})(), 'text', { attrs: 'required placeholder="请输入采购人姓名"' }) +
      '</div>' +
      '<div class="hq-sec">采购明细 <small style="font-weight:400;color:#a09890">按用途归属分类，已有商品可从库存选择</small></div>' +
      '<div id="hq-supplier-rows"></div>' +
      '<button type="button" class="btn" id="hq-add-supplier" style="margin-top:10px">+ 添加供应商</button>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注说明', 'remark', p && p.remark, 'textarea', { attrs: 'placeholder="选填"' }) + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>' + (p ? '保存修改' : '提交采购单') + '</button>');
    var host = $('#hq-supplier-rows', m.root);
    var groups = [];
    function makeGroup(supplierName, items) {
      var g = { supplier: supplierName || '', items: JSON.parse(JSON.stringify(items || [])) };
      groups.push(g);
      return g;
    }
    if (suppliers.length) suppliers.forEach(function (s, i) {
      var nm = typeof s === 'string' ? s : (s.name || '');
      var its2 = its.filter(function (x) { return (x.supplier || '') === nm; });
      makeGroup(nm, its2);
    });
    if (!groups.length) makeGroup('', its.length ? its : [emptyPorow()]);
    function emptyPorow() { return { name: '', code: '', brand: '', model: '', category: ownNames()[0], quantity: '', unit: '', price: '' }; }
    function render() {
      host.innerHTML = groups.map(function (g, gi) {
        var rows = g.items.length ? g.items : [emptyPorow()];
        var subtotal = g.items.reduce(function (a, r) { return a + num(r.quantity) * num(r.price); }, 0);
        var body = rows.map(function (r, ri) {
          return '<tr data-g="' + gi + '" data-r="' + ri + '">' +
            '<td><select data-k="category">' + ownOpts(r.category) + '</select></td>' +
            '<td><input data-k="name" list="hq-po-names" value="' + esc(r.name || '') + '" placeholder="物品名称" required></td>' +
            '<td><input data-k="brand" value="' + esc(r.brand || '') + '" placeholder="品牌"></td>' +
            '<td><input data-k="model" value="' + esc(r.model || '') + '" placeholder="型号"></td>' +
            '<td><input data-k="quantity" type="number" min="0" step="0.01" value="' + esc(r.quantity == null ? '' : r.quantity) + '" placeholder="数量" required></td>' +
            '<td><input data-k="unit" value="' + esc(r.unit || '') + '" placeholder="单位"></td>' +
            '<td><input data-k="price" type="number" min="0" step="0.01" value="' + esc(r.price == null ? '' : r.price) + '" placeholder="单价"></td>' +
            '<td class="num po-amt">' + (num(r.quantity) * num(r.price)).toFixed(2) + '</td>' +
            '<td><button type="button" class="hq-del" data-del="' + gi + ':' + ri + '" title="删除该行">×</button></td></tr>';
        }).join('');
        return '<div class="po-group" data-gi="' + gi + '" style="border:1.5px solid #e8e2da;background:#faf7f2;border-radius:12px;padding:13px;margin-bottom:13px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
          '<label style="font-size:11px;color:#5e554c;font-weight:600">供应商名称（选填）</label>' +
          '<button type="button" class="btn" data-delg="' + gi + '" style="padding:3px 10px;color:#c0392b">删除</button></div>' +
          '<input class="supplier-name" value="' + esc(g.supplier || '') + '" placeholder="请输入供应商名称（可不填）" style="width:100%;box-sizing:border-box;border:1.5px solid #d4cdc4;border-radius:7px;padding:7px 10px;font-size:12px;margin-bottom:10px">' +
          '<datalist id="hq-po-names">' + (H.D.inventory || []).map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>' +
          '<div class="tw"><table style="width:100%;min-width:900px;table-layout:fixed"><colgroup><col style="width:110px"><col style="width:170px"><col style="width:110px"><col style="width:110px"><col style="width:85px"><col style="width:70px"><col style="width:95px"><col style="width:95px"><col style="width:55px"></colgroup><thead><tr><th>类别</th><th>物品名称</th><th>品牌</th><th>型号</th><th class="num">数量</th><th>单位</th><th class="num">单价(元)</th><th class="num">金额(元)</th><th>操作</th></tr></thead><tbody>' + body + '</tbody>' +
          '<tfoot><tr style="background:#f0e9df;font-weight:700"><td colspan="7" style="text-align:right">小计</td><td class="num po-subtotal">' + subtotal.toFixed(2) + '</td><td></td></tr></tfoot></table></div>' +
          '<div style="display:flex;gap:8px;margin-top:9px">' +
          '<button type="button" class="btn" data-addrow="' + gi + '">+ 添加新物品</button>' +
          '<button type="button" class="btn" data-pick="' + gi + '" style="border-color:#c23616;color:#c23616">从库存中选择</button></div>' +
          '</div>';
      }).join('');
    }
    function syncCell(tr) {
      var gi = Number(tr.getAttribute('data-g')), ri = Number(tr.getAttribute('data-r'));
      var k = tr.getAttribute('data-k'); // handled by input listener below via target
    }
    host.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('supplier-name')) {
        var gr0 = t.closest('.po-group');
        if (gr0 && groups[Number(gr0.getAttribute('data-gi'))]) groups[Number(gr0.getAttribute('data-gi'))].supplier = t.value;
        return;
      }
      var tr = t.closest('tr[data-g]'); if (!tr || !t.hasAttribute('data-k')) return;
      var gi = Number(tr.getAttribute('data-g')), ri = Number(tr.getAttribute('data-r'));
      groups[gi].items[ri][t.getAttribute('data-k')] = t.value;
      if (t.getAttribute('data-k') === 'quantity' || t.getAttribute('data-k') === 'price') {
        var row = groups[gi].items[ri];
        tr.querySelector('.po-amt').textContent = (num(row.quantity) * num(row.price)).toFixed(2);
        var sub = 0; groups[gi].items.forEach(function (x) { sub += num(x.quantity) * num(x.price); });
        tr.closest('.po-group').querySelector('.po-subtotal').textContent = sub.toFixed(2);
      }
      if (t.getAttribute('data-k') === 'name') {
        var hit = (H.D.inventory || []).find(function (x) { return x.name === t.value; });
        if (hit) {
          ['brand', 'model', 'unit', 'price', 'category'].forEach(function (k) {
            var val = k === 'category' ? (hit.category_name || hit.category) : (k === 'price' ? hit.unit_price : hit[k]);
            if (val) { groups[gi].items[ri][k] = val; var inp = tr.querySelector('[data-k="' + k + '"]'); if (inp) inp.value = val; }
          });
        }
      }
    });
    host.addEventListener('change', function (e) {
      var t = e.target, tr = t.closest('tr[data-g]'); if (!tr || !t.hasAttribute('data-k')) return;
      var gi = Number(tr.getAttribute('data-g')), ri = Number(tr.getAttribute('data-r'));
      groups[gi].items[ri][t.getAttribute('data-k')] = t.value;
    });
    host.addEventListener('click', function (e) {
      var add = e.target.closest('[data-addrow]');
      if (add) { groups[Number(add.getAttribute('data-addrow'))].items.push(emptyPorow()); render(); return; }
      var pick = e.target.closest('[data-pick]');
      if (pick) {
        var gi = Number(pick.getAttribute('data-pick'));
        openInvPicker(function (item) {
          groups[gi].items.push({ name: item.name, code: item.code, brand: item.brand, model: item.model, category: item.category_name || item.category, quantity: '', unit: item.unit, price: item.unit_price, item_id: item.id });
          render();
        });
        return;
      }
      var del = e.target.closest('[data-del]');
      if (del) { var a = del.getAttribute('data-del').split(':'); groups[Number(a[0])].items.splice(Number(a[1]), 1); render(); return; }
      var delg = e.target.closest('[data-delg]');
      if (delg) { groups.splice(Number(delg.getAttribute('data-delg')), 1); if (!groups.length) makeGroup('', [emptyPorow()]); render(); return; }
    });
    $('#hq-add-supplier', m.root).onclick = function () { makeGroup('', [emptyPorow()]); render(); };
    render();
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-po-form', m.root); if (!f.reportValidity()) return;
      host.querySelectorAll('.po-group').forEach(function (gr, gi) { if (groups[gi]) groups[gi].supplier = gr.querySelector('.supplier-name').value; });
      var allRows = [];
      groups.forEach(function (g) { g.items.forEach(function (r) { if (String(r.name || '').trim()) allRows.push(Object.assign({}, r, { supplier: g.supplier })); }); });
      if (!allRows.length) { toast('请至少填写一行采购明细', 'err'); return; }
      var seen = {}, seq = {};
      allRows.forEach(function (r) {
        var base = String(r.code || '').trim();
        if (!base || !seen[base]) { if (base) seen[base] = true; return; }
        var n = (seq[base] = (seq[base] || 1) + 1);
        r.code = base + '-' + n;
      });
      var uniq = [];
      allRows.forEach(function (r) { if (r.supplier && uniq.indexOf(r.supplier) < 0) uniq.push(r.supplier); });
      var payload = {
        purchase_date: f.purchase_date.value, purchaser: f.purchaser.value, remark: f.remark.value,
        suppliers: uniq.map(function (name) { return { name: name }; }),
        items: allRows.map(function (r) {
          return { name: r.name, code: r.code, brand: r.brand, model: r.model, category: r.category, supplier: r.supplier, quantity: num(r.quantity), unit: r.unit, price: num(r.price), amount: Number((num(r.quantity) * num(r.price)).toFixed(2)), item_id: r.item_id };
        })
      };
      payload.total_amount = payload.items.reduce(function (a, i) { return a + i.amount; }, 0);
      busy(b, '保存中', true);
      var task = p ? SupaDB.updatePurchaseOrder(p.id, payload) : SupaDB.createPurchaseOrder(payload);
      Promise.resolve(task).then(function (r) { m.close(); toast(p ? '采购单已更新' : '采购单已创建：' + (r && r.code || '')); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }
  function viewPO(id) {
    var p = findIn(H.D.purchase, id); if (!p) return;
    var its = H.itemsOf(p);
    var rows = its.map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.code || '—') + '</td><td>' + esc(it.category || '未分类') + '</td><td class="num">' + num(it.quantity) + '</td><td class="num">¥' + num(it.price).toFixed(2) + '</td><td class="num">¥' + num(it.amount).toFixed(2) + '</td></tr>';
    }).join('');
    openModal('采购单 · ' + (p.code || ''),
      '<div class="hq-detail"><b>采购日期：</b>' + esc(p.purchase_date || '—') + '　<b>采购人：</b>' + esc(p.purchaser || '—') + '<br><b>总金额：</b>¥' + num(p.total_amount).toFixed(2) + '　<b>状态：</b>' + esc(p.status || '—') + '</div>' +
      '<div class="hq-sec">明细 ' + its.length + ' 项</div><div class="tw"><table><thead><tr><th>名称</th><th>编码</th><th>归属</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">无明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn" data-hq-cancel>关闭</button>').root.querySelector('[data-hq-cancel]').onclick = function () { ensureModal().innerHTML = ''; };
  }

  // ---------- 入库验收 ----------
  function acceptStockIn(poId, btn) {
    var p = findIn(H.D.purchase, poId); if (!p) { toast('找不到采购单', 'err'); return; }
    var its = H.itemsOf(p);
    var received = {};
    (H.D.stockin || []).forEach(function (s) {
      if (String(s.purchase_order_id) !== String(p.id)) return;
      H.itemsOf(s).forEach(function (x) { var k = x.code || x.name; received[k] = (received[k] || 0) + num(x.actual_quantity || x.quantity); });
    });
    var m = openModal('验收入库 · ' + (p.code || ''),
      '<form id="hq-si-form"><div class="hqf-grid">' +
      field('入库日期', 'stockin_date', today(), 'date') +
      field('批次号', 'batch_code', 'B' + String(Date.now()).slice(-8)) +
      '</div><div class="hq-sec">本次实收数量 <small style="font-weight:400;color:#a09890">数量或「不入库」变化会实时重算金额</small></div>' +
      '<div class="tw"><table><thead><tr><th>名称</th><th>品牌/型号</th><th class="num">订购</th><th class="num">已收</th><th class="num">剩余</th><th class="num">实收</th><th>单位</th><th class="num">单价</th><th class="num">金额</th><th>不入库</th></tr></thead><tbody>' +
      its.map(function (it, i) {
        var key = it.code || it.name, done = received[key] || 0;
        var left = Math.max(0, num(it.quantity) - done), price = num(it.price);
        return '<tr data-si-row="' + i + '"><td>' + esc(it.name) + '</td><td>' + esc(it.brand || '') + ' ' + esc(it.model || '') + '</td>' +
          '<td class="num">' + num(it.quantity) + '</td><td class="num">' + done + '</td><td class="num">' + left + '</td>' +
          '<td><input data-si-i="' + i + '" type="number" min="0" max="' + left + '" step="0.01" value="' + left + '" style="width:76px"></td>' +
          '<td>' + esc(it.unit || '') + '</td><td class="num">¥' + price.toFixed(2) + '</td>' +
          '<td class="num si-amt">¥' + (left * price).toFixed(2) + '</td>' +
          '<td><input data-skip-i="' + i + '" type="checkbox"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div style="margin-top:10px;padding:9px 12px;background:#faf7f2;border:1.5px solid #e8e2da;border-radius:8px;font-size:12.5px;color:#5e554c">实收合计：<b id="si-sum-qty" style="color:#2d2620">0</b>　金额：<b id="si-sum-amt" style="color:#c23616">¥0.00</b></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>确认入库</button>');
    function recalcSI() {
      var q = 0, a = 0;
      its.forEach(function (it, i) {
        var skip = $('[data-skip-i="' + i + '"]', m.root), inp = $('[data-si-i="' + i + '"]', m.root);
        var n = skip && skip.checked ? 0 : num(inp && inp.value), price = num(it.price);
        var amt = $('[data-si-row="' + i + '"] .si-amt', m.root);
        if (amt) amt.textContent = '¥' + (n * price).toFixed(2);
        q += n; a += n * price;
      });
      var sq = $('#si-sum-qty', m.root), sa = $('#si-sum-amt', m.root);
      if (sq) sq.textContent = String(q);
      if (sa) sa.textContent = '¥' + a.toFixed(2);
    }
    $('#hq-si-form', m.root).addEventListener('input', recalcSI);
    $('#hq-si-form', m.root).addEventListener('change', recalcSI);
    recalcSI();
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, v = formValues($('#hq-si-form', m.root));
      var lines = [];
      its.forEach(function (it, i) {
        var skip = $('[data-skip-i="' + i + '"]', m.root);
        var q = num($('[data-si-i="' + i + '"]', m.root) && $('[data-si-i="' + i + '"]', m.root).value);
        if (skip && skip.checked) { lines.push({ name: it.name, code: it.code, brand: it.brand, model: it.model, category: it.category, quantity: num(it.quantity), actual_quantity: 0, price: num(it.price), unit: it.unit, is_skipped: true }); return; }
        if (q > 0) lines.push({ name: it.name, code: it.code, brand: it.brand, model: it.model, category: it.category, quantity: num(it.quantity), actual_quantity: q, price: num(it.price), unit: it.unit, item_id: it.item_id || it.inventory_item_id });
      });
      var positive = lines.filter(function (x) { return !x.is_skipped; });
      if (!positive.length && !lines.some(function (x) { return x.is_skipped; })) { toast('请至少填写一个实收数量或勾选不入库', 'err'); return; }
      var payload = { stockin_date: v.stockin_date, batch_code: v.batch_code, remark: v.remark,
        items: positive, total_quantity: positive.reduce(function (a, x) { return a + x.actual_quantity; }, 0),
        total_amount: positive.reduce(function (a, x) { return a + x.actual_quantity * x.price; }, 0) };
      busy(b, '入库中', true);
      Promise.resolve(SupaDB.partialConfirmStockIn(p.id, payload))
        .then(function (r) {
          // 标记"不入库"行（迁移已执行时才生效，失败不影响主流程）
          lines.filter(function (x) { return x.is_skipped; }).forEach(function (x) {
            var hit = (p.purchase_order_items || []).find(function (poi) { return (x.code && poi.item_code === x.code) || poi.name === x.name; });
            if (hit && hit.id) SupaDB.setPurchaseOrderItemSkipped(hit.id, true).catch(function () {});
          });
          postLedger('purchase_acceptance', positive, (positive[0] || {}).category, v.stockin_date, r && r.code);
          m.close(); toast('验收入库完成：' + (r && r.code || '')); H.loadAll();
        })
        .catch(function (e) { busy(b, null, false); toast('入库失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ---------- 领用单（按用途归属分链路 · v6.12 六链路流程流转） ----------
  // 领用 1 直播礼品：主播申请·锁定(填团号) → 销售填写并邮寄(客户信息手动、一物多客户) → 仓库数据确认·出库
  // 领用 2 出团物料：计调填团期单(填团号) → 仓库核对导游实拿一致 → 仓库确定出库
  // 领用 3 行政物料/总部仓库：领用人申请 → 仓库确定数量金额 → 仓库确定出库
  // 末端岗位统一「仓库」（行政/库存/仓库为同一岗位，用户 2026-11-25 定稿），全流程无审核、无核销节点。

  // ---------- 六链路流程负载（v6.12） ----------
  // 客户明细 / 实拿量 / 金额 等结构化数据：零 DDL 时序列化进 requisitions.remark（必成功、可回显、可追溯）；
  // 迁移脚本执行后，双写 flow_stage / flow_payload 列；列不存在自动降级，不影响主流程。
  function _b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function _b64dec(str) { try { return decodeURIComponent(escape(atob(str))); } catch (e) { return ''; } }
  var FLOW_TAG = 'HQ_FLOW2:';
  function readFlowPayload(r) {
    var rm = String((r && r.remark) || ''), i = rm.indexOf(FLOW_TAG);
    if (i < 0) return null;
    var tail = rm.slice(i + FLOW_TAG.length), end = tail.indexOf(' / HQ_');
    var b64 = (end >= 0 ? tail.slice(0, end) : tail).trim();
    try { return JSON.parse(_b64dec(b64)); } catch (e) { return null; }
  }
  function tourNoFromRemark(r) {
    var m = String((r && r.remark) || '').match(/团号[:：]\s*([^\s/，,]+)/);
    return m ? m[1] : '';
  }
  function writeFlowPayload(req, payload) {
    var rm = String(req.remark || '').replace(/\s*\/\s*HQ_FLOW2:[^/]*/g, '').replace(/\s*\/\s*HQ_HANDLED/g, '').trim();
    var pkg = 'HQ_HANDLED / ' + FLOW_TAG + _b64enc(JSON.stringify(payload));
    var next = rm ? rm + ' / ' + pkg : pkg;
    var sb = (typeof getSupabase === 'function') ? getSupabase() : null;
    if (!sb) return Promise.resolve();
    return Promise.resolve(sb.from('requisitions').update({
      remark: next, flow_stage: payload.step, flow_payload: JSON.stringify(payload)
    }).eq('id', req.id)).then(function (res) {
      if (res && res.error) throw res.error;
    }).catch(function () {
      // 线上无 flow_stage / flow_payload 列（42703）时降级为仅写 remark
      return Promise.resolve(sb.from('requisitions').update({ remark: next }).eq('id', req.id)).then(function (r2) {
        if (r2 && r2.error) throw r2.error;
      });
    });
  }
  function chainOfReq(r) {
    var its = H.itemsOf(r), cats = {};
    its.forEach(function (i) { if (i.category) cats[i.category] = 1; });
    var keys = Object.keys(cats);
    if (r.scenario === 'live_plan' || (keys.length === 1 && cats['直播礼品'])) return 'live';
    if (keys.indexOf('出团物料') >= 0 || r.scenario === 'tour') return 'tour';
    return 'normal';
  }
  function priceOfItem(it) {
    var hit = (H.D.inventory || []).find(function (x) {
      return (it.code && x.code === it.code) || (it.name && x.name === it.name);
    });
    return hit ? num(hit.unit_price) : num(it.price);
  }
  // 推进「中间环节已办理」：复用合法状态 approved（约束未放宽时降级 pending_outbound），
  // 让 confirmStockOut 的「未审核禁止出库」门禁放行；业务语义是办理完成、不是审核。
  function advanceHandled(req, remarkText) {
    return Promise.resolve(SupaDB.approveRequisition(req.id, remarkText || '流程办理完成'))
      .catch(function () { return null; }); // 已 approved / 约束降级失败时不阻断主流程
  }
  var CHAIN_INFO = {
    '直播礼品': { key: 'live_plan', label: '领用1 · 直播礼品（三段）', tip: '主播填申请并锁定库存、团号必填 → 销售关联单据填写并邮寄（客户信息全部手动填写，一物可寄多客户）→ 仓库数据确认与出库。', applicant: '主播姓名' },
    '出团物料': { key: 'tour', label: '领用2 · 出团物料', tip: '计调填对应团期领用单、团号必填 → 仓库核对导游实际拿走的数量与物品与领用单一致（差异须说明）→ 确定出库。', applicant: '计调' },
    '行政物料': { key: 'normal', label: '领用3 · 行政物料', tip: '领用人实际申请领用 → 仓库确定数量与金额（金额=数量×单价）→ 出库。无需团号。', applicant: '领用人' },
    '总部仓库': { key: 'normal', label: '领用3 · 总部仓库', tip: '领用人实际申请领用 → 仓库确定数量与金额（金额=数量×单价）→ 出库。无需团号。', applicant: '领用人' }
  };
  function chainOf(cat) { return CHAIN_INFO[cat] || { key: 'normal', label: '领用3 · 常规领用', tip: '领用人申请 → 仓库确定数量金额 → 出库。', applicant: '领用人' }; }

  function newReq(btn) {
    var cats = ownNames().filter(function (x) { return x !== '未分类'; });
    var first = cats.indexOf('直播礼品') >= 0 ? '直播礼品' : cats[0];
    var m = openModal('新建领用单（按用途归属分链路）',
      '<form id="hq-rq-form">' +
      '<div class="hqf-grid">' +
      field('用途归属', 'category', first, 'select', { options: cats }) +
      field('申请日期', 'apply_date', today(), 'date') +
      '</div>' +
      '<div class="hq-notice" id="hq-rq-tip"></div>' +
      '<div class="hqf-grid" id="hq-rq-chain-fields"></div>' +
      '<div class="hq-sec">添加出库物品</div>' +
      '<div class="hqf-grid"><select id="rq-pick-cat"><option value="">全部分类</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<input id="rq-pick-kw" placeholder="搜索名称/编码/型号"></div>' +
      '<div id="rq-pick-list" style="border:1.5px solid #e8e2da;border-radius:10px;margin-top:8px;max-height:190px;overflow:auto"></div>' +
      '<div class="hq-sec">已选物品</div><div id="hq-rq-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>提交领用单</button>');
    var ed = linesEditor($('#hq-rq-lines', m.root), [], false);
    var catSel = $('[name="category"]', m.root);
    var tip = $('#hq-rq-tip', m.root), fields = $('#hq-rq-chain-fields', m.root);
    // 库存物品选择器（对齐列车：分类筛选 + 搜索 + 库存量 + 添加按钮，可重复添加）
    var pickCat = $('#rq-pick-cat', m.root), pickKw = $('#rq-pick-kw', m.root), pickList = $('#rq-pick-list', m.root);
    function renderPickList() {
      var c = pickCat.value, kw = String(pickKw.value || '').trim().toLowerCase();
      var items = (H.D.inventory || []).filter(function (x) {
        var xc = x.category_name || x.category || '未分类';
        if (c && xc !== c) return false;
        if (!kw) return true;
        return [x.name, x.code, x.brand, x.model].some(function (v) { return String(v || '').toLowerCase().indexOf(kw) >= 0; });
      });
      pickList.innerHTML = items.length ? items.map(function (x, i) {
        var xc = x.category_name || x.category || '未分类';
        return '<div class="hq-pick-row"><span><b>' + esc(x.name) + '</b> <small>' + esc(x.code || '无编码') + ' · ' + esc(x.brand || '') + ' ' + esc(x.model || '') + ' · ' + esc(xc) + '</small></span>' +
          '<span class="stk">库存 ' + num(x.stock) + esc(x.unit || '') + '</span>' +
          '<button type="button" class="hq-pick" data-addinv="' + esc(x.id) + '">+ 添加</button></div>';
      }).join('') : '<div class="hq-msg" style="padding:14px;text-align:center">未找到匹配的库存物品</div>';
    }
    pickCat.onchange = renderPickList; pickKw.oninput = renderPickList;
    pickList.addEventListener('click', function (e) {
      var ab = e.target.closest('[data-addinv]'); if (!ab) return;
      var item = (H.D.inventory || []).find(function (x) { return String(x.id) === ab.getAttribute('data-addinv'); });
      if (!item) return;
      ed.addRow({ name: item.name, code: item.code, brand: item.brand, model: item.model, category: catSel.value, quantity: '', unit: item.unit, item_id: item.id });
      toast('已添加 ' + item.name + ' 到已选物品');
    });
    renderPickList();
    function renderChain() {
      var cat = catSel.value, info = chainOf(cat);
      tip.textContent = info.tip;
      if (info.key === 'live_plan') {
        fields.innerHTML = field('团号 *（必填）', 'tour_no', '', 'text', { attrs: 'required placeholder="例如：T1126-DB12"' }) +
          field('直播场次/主题', 'purpose', '', 'text', { attrs: 'required placeholder="例如：1125 双十一专场直播"' }) +
          field(info.applicant, 'applicant', '', 'text', { attrs: 'required placeholder="主播姓名"' });
      } else if (info.key === 'tour') {
        fields.innerHTML = field('团号 *（必填）', 'tour_no', '', 'text', { attrs: 'required placeholder="例如：T1124-HD"' }) +
          field('团期名称', 'tour_name', '', 'text', { attrs: 'required placeholder="例如：0918 华东五日游"' }) +
          field('团期日期', 'tour_date', today(), 'date', { attrs: 'required' }) +
          field(info.applicant, 'applicant', '', 'text', { attrs: 'required placeholder="例如：计调-孙"' }) +
          field('出团用途说明', 'purpose', '', 'text', { attrs: 'placeholder="选填"' });
      } else {
        fields.innerHTML = field(info.applicant, 'applicant', '', 'text', { attrs: 'required placeholder="领用人姓名"' }) +
          field('用途说明', 'purpose', '', 'text', { attrs: 'placeholder="选填，例如：办公领用"' });
      }
    }
    catSel.onchange = renderChain;
    renderChain();
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-rq-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), rows = attachItemId(ed.get());
      // 团号必填（用户 2026-11-25 定稿）：直播礼品、出团物料必须填
      var needTour = chainOf(v.category).key === 'live_plan' || chainOf(v.category).key === 'tour';
      if (needTour && !String(v.tour_no || '').trim()) { toast('团号必填，请先填写团号再保存', 'err'); return; }
      if (!rows.length) { toast('请至少填写一行领用明细', 'err'); return; }
      // 明细归属统一跟随所选用途归属（便于按归属切换筛选与链路判定）
      rows.forEach(function (r) { r.category = v.category; });
      var info = chainOf(v.category);
      var remarkBits = ['归属：' + v.category];
      if (v.tour_no) remarkBits.push('团号：' + String(v.tour_no).trim()); // 团号必填，零 DDL 落 remark 供全链路读取
      if (v.purpose) remarkBits.push((info.key === 'live_plan' ? '直播场次：' : '用途：') + v.purpose);
      if (v.remark) remarkBits.push(v.remark);
      var payload = {
        apply_date: v.apply_date, applicant: v.applicant, purpose: v.purpose || '',
        remark: remarkBits.join(' / '),
        scenario: info.key,
        category_name: v.category,
        tour_name: info.key === 'tour' ? v.tour_name : '',
        tour_date: info.key === 'tour' ? v.tour_date : null,
        total_quantity: rows.reduce(function (a, r) { return a + num(r.quantity); }, 0),
        items: rows.map(function (r) { return { item_id: r.item_id, name: r.name, code: r.code, category: v.category, unit: r.unit, quantity: num(r.quantity), brand: r.brand, model: r.model }; })
      };
      busy(b, '提交中', true);
      var task = info.key === 'live_plan'
        ? SupaDB.createRequisition(payload).then(function (r) {
            // 直播链路：主播拟出库即锁定库存，走台账 win_register（locked +1）
            postLedger('win_register', rows, v.category, v.apply_date, r && r.code);
            return r;
          })
        : SupaDB.createRequisition(payload);
      Promise.resolve(task).then(function (r) { m.close(); toast('申请已提交：' + (r && r.code || '') + (info.key === 'live_plan' ? '（主播申请·已锁定库存）' : '') + '，待下一岗位办理'); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('提交失败：' + (e && e.message || e), 'err'); });
    };
  }
  // ---------- 六链路 · 中间环节办理（v6.12） ----------
  // live   销售填写并邮寄：客户信息全部手动填写、一物可寄多客户、分配合计=本次数量；库存与锁定不动
  // tour   仓库核对实拿：逐项登记导游实际拿走量，与计划量比对，差异须说明
  // normal 仓库确定数量金额：金额 = 数量 × 单价（只展示留痕，零 DDL）
  // 三个环节都只写「流程负载」+ 推进到合法状态 approved（降级 pending_outbound），由仓库在末端确定出库。
  function handleReq(id) {
    var r = findIn(H.D.requisitions, id); if (!r) return;
    var chain = chainOfReq(r);
    if (chain === 'live') return handleLive(r);
    if (chain === 'tour') return handleTour(r);
    return handleNormal(r);
  }
  function flowHead(r, extra) {
    var tno = tourNoFromRemark(r);
    return '<div class="hqf-grid" style="margin-bottom:10px">' +
      field('团号（申请时填写 · 只读）', '_tno', tno || '未填写', 'text', { attrs: 'disabled' }) +
      field(extra.label, '_ctx', extra.value || '—', 'text', { attrs: 'disabled' }) +
      field('申请人', '_app', r.applicant || '—', 'text', { attrs: 'disabled' }) +
      '</div>';
  }
  function saveHandled(req, payload, okMsg) {
    return writeFlowPayload(req, payload)
      .then(function () { return advanceHandled(req, payload.stepLabel + ' · ' + (payload.handledBy || '')); })
      .then(function () { toast(okMsg); H.loadAll(); });
  }

  // ===== 领用1 直播礼品：销售填写并邮寄（客户信息手动、一物多客户） =====
  function handleLive(r) {
    var its = H.itemsOf(r);
    var st = its.map(function (it) {
      return { key: it.code || it.name, name: it.name, code: it.code, unit: it.unit || '',
        plan: num(it.quantity), qty: num(it.quantity), on: true, cust: [] };
    });
    var active = 0;
    var tno = tourNoFromRemark(r);
    if (!tno) { toast('该单未填团号（必填），请由主播补填后再办理', 'err'); return; }
    var m = openModal('销售填写并邮寄 · ' + (r.code || ''),
      '<form id="hq-live-form">' +
      '<div class="hq-notice">主播申请时已确定团号并锁定库存；本步只做客户管理与邮寄登记，<b>库存与锁定都不动</b>，由仓库在末端数据确认后出库。客户信息<b>全部手动填写</b>，一个物品可拆给多个客户。</div>' +
      flowHead(r, { label: '直播场次', value: r.purpose || r.tour_name }) +
      '<div class="hq-sec">本次邮寄物品（勾选并填本次数量）</div>' +
      '<div class="tw"><table><thead><tr><th>办理</th><th>物品</th><th class="num">锁定量</th><th class="num">本次数量</th><th>单位</th><th>客户邮寄信息</th></tr></thead><tbody id="lv-body"></tbody></table></div>' +
      '<div class="hq-sec" style="margin-top:14px">客户明细 · <span id="lv-active-name"></span>（手动填写，可增加多位客户）</div>' +
      '<div id="lv-cust"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('销售 / 办理人', 'handledBy', '', 'text', { attrs: 'required placeholder="销售姓名"' }) + '</div>' +
      '</form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>保存并邮寄 ›</button>');
    function drawBody() {
      $('#lv-body', m.root).innerHTML = st.map(function (it, i) {
        var sum = it.cust.reduce(function (a, c) { return a + num(c.qty); }, 0);
        var info = it.cust.length ? '<span class="lnk" style="color:#2d8659" data-lv-pick="' + i + '">已填 ' + it.cust.length + ' 位客户 · ' + sum + ' 件（预览/编辑）›</span>'
          : '<span class="lnk" data-lv-pick="' + i + '">填写客户信息 ›</span>';
        return '<tr><td><input type="checkbox" data-lv-on="' + i + '"' + (it.on ? ' checked' : '') + '></td>' +
          '<td><b>' + esc(it.name) + '</b> <small style="color:#a09890">' + esc(it.code || '') + '</small></td>' +
          '<td class="num">' + it.plan + '</td>' +
          '<td><input type="number" min="0" max="' + it.plan + '" step="1" data-lv-qty="' + i + '" value="' + it.qty + '" style="width:78px"></td>' +
          '<td>' + esc(it.unit) + '</td><td>' + (it.on ? info : '<small style="color:#a09890">未办理</small>') + '</td></tr>';
      }).join('');
    }
    function drawCust() {
      var it = st[active];
      $('#lv-active-name', m.root).textContent = it ? it.name + '（本次 ' + it.qty + ' ' + it.unit + '）' : '';
      $('#lv-cust', m.root).innerHTML = it ? (
        '<div class="hq-msg" style="margin-bottom:8px;font-size:11.5px">分配合计须等于本次数量 <b>' + it.qty + '</b>；当前 <b id="lv-csum">' + it.cust.reduce(function (a, c) { return a + num(c.qty); }, 0) + '</b>。收件人 / 电话 / 地址 / 数量必填，快递单号可后补。</div>' +
        (it.cust.length ? it.cust.map(function (c, j) {
          return '<div style="border:1.5px solid #e8e2da;border-radius:8px;padding:9px 10px;margin-bottom:8px;background:#fdfcfa">' +
            '<div style="font-weight:700;font-size:12px;margin-bottom:6px">客户 ' + (j + 1) + ' <button type="button" class="btn sm" data-lv-del="' + j + '" style="float:right;color:#c0392b">删除</button></div>' +
            '<div class="hqf-grid">' +
            field('收件人 *', '_n' + j, c.name, 'text', { attrs: 'placeholder="手动填写"' }) +
            field('联系电话 *', '_p' + j, c.phone, 'text', { attrs: 'placeholder="手动填写"' }) +
            field('数量 *', '_q' + j, c.qty, 'number', { attrs: 'min="1" step="1"' }) +
            field('快递公司', '_c' + j, c.carrier, 'text', { attrs: 'placeholder="选填"' }) +
            field('快递单号（可后补）', '_t' + j, c.track, 'text', { attrs: 'placeholder="选填"' }) +
            field('备注', '_r' + j, c.remark, 'text', { attrs: 'placeholder="选填"' }) +
            '</div>' + field('收件地址 *', '_a' + j, c.addr, 'text', { attrs: 'placeholder="手动填写完整地址"' }) + '</div>';
        }).join('') : '<div class="hq-msg" style="padding:12px;text-align:center">尚未填写客户信息，点下方「增加客户明细」开始</div>') +
        '<button type="button" class="btn sm" id="lv-add" style="margin-top:4px">+ 增加客户明细</button>'
      ) : '';
    }
    function syncCust() {
      var it = st[active]; if (!it) return;
      it.cust.forEach(function (c, j) {
        ['name', 'phone', 'qty', 'carrier', 'track', 'remark', 'addr'].forEach(function (f, k) {
          var el = $('[name="_' + ['n', 'p', 'q', 'c', 't', 'r', 'a'][k] + j + '"]', m.root);
          if (el) c[f] = (f === 'qty') ? num(el.value) : el.value;
        });
      });
      var cs = $('#lv-csum', m.root);
      if (cs) cs.textContent = String(it.cust.reduce(function (a, c) { return a + num(c.qty); }, 0));
    }
    function switchActive(i) { syncCust(); active = i; drawCust(); drawBody(); }
    m.root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-lv-qty')) { st[Number(t.getAttribute('data-lv-qty'))].qty = Math.max(0, Math.min(num(t.value), st[Number(t.getAttribute('data-lv-qty'))].plan)); }
      syncCust();
    });
    m.root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-lv-on')) { st[Number(t.getAttribute('data-lv-on'))].on = t.checked; drawBody(); }
    });
    m.root.addEventListener('click', function (e) {
      var pk = e.target.closest('[data-lv-pick]');
      if (pk) { switchActive(Number(pk.getAttribute('data-lv-pick'))); return; }
      if (e.target.closest('#lv-add')) { syncCust(); st[active].cust.push({ name: '', phone: '', addr: '', carrier: '', track: '', qty: 1, remark: '' }); drawCust(); return; }
      var dl = e.target.closest('[data-lv-del]');
      if (dl) { syncCust(); st[active].cust.splice(Number(dl.getAttribute('data-lv-del')), 1); drawCust(); }
    });
    drawBody(); drawCust();
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-live-form', m.root); if (!f.reportValidity()) return;
      syncCust();
      var v = formValues(f);
      var items = st.filter(function (it) { return it.on && it.qty > 0; });
      if (!items.length) { toast('请至少勾选一件物品并填写本次数量', 'err'); return; }
      for (var i = 0; i < items.length; i++) {
        var it = items[i], sum = it.cust.reduce(function (a, c) { return a + num(c.qty); }, 0);
        if (!it.cust.length) { toast('「' + it.name + '」尚未填写客户信息', 'err'); return; }
        if (sum !== it.qty) { toast('「' + it.name + '」客户分配合计 ' + sum + ' 与本次数量 ' + it.qty + ' 不一致', 'err'); return; }
        for (var j = 0; j < it.cust.length; j++) {
          var c = it.cust[j];
          if (!String(c.name || '').trim() || !String(c.phone || '').trim() || !String(c.addr || '').trim()) { toast('「' + it.name + '」第 ' + (j + 1) + ' 位客户的收件人/电话/地址必填', 'err'); return; }
        }
      }
      var payload = {
        step: 'handled', stepLabel: '销售填写并邮寄', chain: 'live', tourNo: tno,
        session: r.purpose || r.tour_name || '', applicant: r.applicant || '',
        handledBy: v.handledBy, handledAt: today(),
        items: items.map(function (it) { return { key: it.key, name: it.name, code: it.code, unit: it.unit, plan: it.plan, qty: it.qty, customers: it.cust }; })
      };
      busy(b, '保存中', true);
      saveHandled(r, payload, '已填写并邮寄 ' + (r.code || '') + '：' + items.reduce(function (a, x) { return a + x.customers.length; }, 0) + ' 条客户明细，待仓库确定出库')
        .then(function () { m.close(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ===== 领用2 出团物料：仓库核对导游实拿量与单据一致 =====
  function handleTour(r) {
    var its = H.itemsOf(r);
    var tno = tourNoFromRemark(r);
    if (!tno) { toast('该单未填团号（必填），请由计调补填后再办理', 'err'); return; }
    var m = openModal('仓库核对导游实拿 · ' + (r.code || ''),
      '<form id="hq-tour-form">' +
      '<div class="hq-notice">导游线下实际拿走物料（不进系统），仓库按计调单据逐项核对<b>数量与物品是否一致</b>；一致方可确定出库，有差异须填写说明。本步<b>不扣库存</b>。</div>' +
      flowHead(r, { label: '团期', value: r.tour_name }) +
      '<div class="hq-sec">逐项实拿登记</div>' +
      '<div class="tw"><table><thead><tr><th>物品</th><th class="num">计划量（计调单）</th><th class="num">导游实拿量</th><th>单位</th><th>核对</th></tr></thead><tbody>' +
      its.map(function (it, i) {
        return '<tr><td><b>' + esc(it.name) + '</b> <small style="color:#a09890">' + esc(it.code || '') + '</small></td>' +
          '<td class="num">' + num(it.quantity) + '</td>' +
          '<td><input type="number" min="0" max="' + num(it.quantity) + '" step="1" data-tr-qty="' + i + '" value="' + num(it.quantity) + '" style="width:82px"></td>' +
          '<td>' + esc(it.unit || '') + '</td><td data-tr-diff="' + i + '">—</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="hqf-grid" style="margin-top:12px">' +
      field('仓库 / 核对人', 'handledBy', '', 'text', { attrs: 'required placeholder="仓库经办人"' }) +
      '</div><div id="tr-diff-box" style="margin-top:8px"></div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>保存核对结果 ›</button>');
    function recalc() {
      var diff = false;
      its.forEach(function (it, i) {
        var q = num($('[data-tr-qty="' + i + '"]', m.root).value), d = q - num(it.quantity);
        $('[data-tr-diff="' + i + '"]', m.root).innerHTML = d === 0 ? '<span class="tag g">一致 ✓</span>' : '<span class="tag r">差异 ' + (d > 0 ? '+' : '') + d + '</span>';
        if (d !== 0) diff = true;
      });
      $('#tr-diff-box', m.root).innerHTML = diff
        ? '<div class="hqf-grid">' + field('差异说明 *（由仓库核对人填写，不设复核角色）', 'diffNote', '', 'textarea', { attrs: 'placeholder="如：矿泉水少领 2 箱，已现场退回仓库，核对人现场确认"' }) + '</div>'
        : '<div class="hq-msg" style="font-size:11.5px;color:#2d8659">全部一致，可直接确定出库。</div>';
      return diff;
    }
    $('#hq-tour-form', m.root).addEventListener('input', recalc);
    recalc();
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-tour-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), diff = false;
      var items = its.map(function (it, i) {
        var q = num($('[data-tr-qty="' + i + '"]', m.root).value), d = q - num(it.quantity);
        if (d !== 0) diff = true;
        return { key: it.code || it.name, name: it.name, code: it.code, unit: it.unit || '', plan: num(it.quantity), actual: q, diff: d, price: priceOfItem(it) };
      });
      if (diff && !String(v.diffNote || '').trim()) { toast('存在数量差异，请先填写差异说明', 'err'); return; }
      var payload = {
        step: 'handled', stepLabel: '仓库核对导游实拿', chain: 'tour', tourNo: tno,
        session: r.tour_name || '', applicant: r.applicant || '',
        handledBy: v.handledBy, handledAt: today(), diffNote: diff ? v.diffNote : '',
        items: items
      };
      busy(b, '保存中', true);
      saveHandled(r, payload, '已核对 ' + (r.code || '') + (diff ? '（含差异说明）' : '（全部一致）') + '，待仓库确定出库')
        .then(function () { m.close(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ===== 领用3 行政物料/总部仓库：仓库确定数量与金额 =====
  function handleNormal(r) {
    var its = H.itemsOf(r);
    var m = openModal('仓库确定数量与金额 · ' + (r.code || ''),
      '<form id="hq-normal-form">' +
      '<div class="hq-notice">仓库核对领用数量与金额（金额 = 数量 × 单价，单价取库存物品 unit_price，<b>只展示留痕、不落新列</b>）；确定后由仓库在末端出库。</div>' +
      flowHead(r, { label: '用途', value: r.purpose || r.tour_name || '常规领用' }) +
      '<div class="hq-sec">数量与金额核对</div>' +
      '<div class="tw"><table><thead><tr><th>物品</th><th class="num">申请数量</th><th class="num">单价</th><th class="num">金额</th><th>单位</th></tr></thead><tbody>' +
      its.map(function (it) {
        var p = priceOfItem(it), q = num(it.quantity);
        return '<tr><td><b>' + esc(it.name) + '</b></td><td class="num">' + q + '</td><td class="num">¥' + p.toFixed(2) + '</td>' +
          '<td class="num">¥' + (q * p).toFixed(2) + '</td><td>' + esc(it.unit || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div style="margin-top:10px;padding:9px 12px;background:#faf7f2;border:1.5px solid #e8e2da;border-radius:8px;font-size:12.5px">金额合计：<b style="color:#c23616">¥' +
      its.reduce(function (a, it) { return a + num(it.quantity) * priceOfItem(it); }, 0).toFixed(2) + '</b></div>' +
      '<div class="hqf-grid" style="margin-top:12px">' + field('仓库 / 确定人', 'handledBy', '', 'text', { attrs: 'required placeholder="仓库经办人"' }) + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>保存确定结果 ›</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-normal-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f);
      var items = its.map(function (it) {
        var q = num(it.quantity), p = priceOfItem(it);
        return { key: it.code || it.name, name: it.name, code: it.code, unit: it.unit || '', plan: q, qty: q, price: p, amount: q * p };
      });
      var payload = {
        step: 'handled', stepLabel: '仓库确定数量金额', chain: 'normal', tourNo: '',
        session: r.purpose || r.tour_name || '', applicant: r.applicant || '',
        handledBy: v.handledBy, handledAt: today(),
        totalAmount: items.reduce(function (a, x) { return a + x.amount; }, 0), items: items
      };
      busy(b, '保存中', true);
      saveHandled(r, payload, '已确定数量与金额 ' + (r.code || '') + '（¥' + payload.totalAmount.toFixed(2) + '），待仓库确定出库')
        .then(function () { m.close(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ===== 末端：仓库确定出库（三段链路共用，扣库存 / 释放锁定 / 生成出库单） =====
  function outReq(id, btn) {
    var r = findIn(H.D.requisitions, id); if (!r) { toast('找不到领用单', 'err'); return; }
    var its = H.itemsOf(r);
    var done = {};
    (H.D.stockout || []).forEach(function (s) {
      if (String(s.requisition_id) !== String(r.id)) return;
      H.itemsOf(s).forEach(function (x) { var k = x.code || x.name; done[k] = (done[k] || 0) + num(x.quantity); });
    });
    var chain = chainOfReq(r), fp = readFlowPayload(r);
    var tno = tourNoFromRemark(r);
    var summary = '';
    if (fp) {
      if (chain === 'live') {
        var nc = fp.items.reduce(function (a, x) { return a + (x.customers || []).length; }, 0);
        summary = '已填 ' + nc + ' 位客户 · ' + fp.items.reduce(function (a, x) { return a + num(x.qty); }, 0) + ' 件（团号 ' + esc(fp.tourNo || '—') + '）';
      } else if (chain === 'tour') {
        summary = '导游实拿合计 ' + fp.items.reduce(function (a, x) { return a + num(x.actual); }, 0) + ' 件' + (fp.diffNote ? ' · <b style="color:#c77f0a">差异说明：' + esc(fp.diffNote) + '</b>' : ' · 核对一致');
      } else {
        summary = '金额合计 ¥' + num(fp.totalAmount).toFixed(2);
      }
    } else summary = '（该单未经过中间办理，按申请量出库）';
    var chainLabel = chain === 'live' ? '领用1 直播礼品' : (chain === 'tour' ? '领用2 出团物料' : '领用3 常规领用');
    var m = openModal('仓库确定出库 · ' + (r.code || ''),
      '<form id="hq-out-form">' +
      '<div class="hq-notice"><b>' + chainLabel + '</b> · 末端由<b>仓库</b>做数据确认后出库：确认即按实出数量扣库存、释放锁定、生成出库单。' +
      (tno ? '<br>团号：<b>' + esc(tno) + '</b>（申请时确定，全链路只读）。' : '') +
      '<br>上一步结果：' + summary + '</div>' +
      '<div class="hqf-grid">' +
      field('出库日期', 'stockout_date', today(), 'date') +
      field('仓库 / 确定人', 'operator', '', 'text', { attrs: 'required placeholder="仓库经办人"' }) +
      '</div><div class="hq-sec">本次确定出库数量</div>' +
      its.map(function (it, i) {
        var k = it.code || it.name, d = done[k] || 0, left = Math.max(0, num(it.quantity) - d);
        var preset = left;
        if (fp && fp.items) {
          var hit = fp.items.find(function (x) { return x.key === k || x.name === it.name; });
          if (hit) preset = Math.min(left, num(chain === 'tour' ? hit.actual : hit.qty));
        }
        return '<div class="hq-line"><span style="flex:1 1 130px;font-size:12px">' + esc(it.name) + ' <small style="color:#a09890">申请 ' + num(it.quantity) + ' · 已出 ' + d + '</small></span>' +
          '<input data-out-i="' + i + '" type="number" min="0" max="' + left + '" step="1" value="' + preset + '" style="max-width:100px"></div>';
      }).join('') + '</form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>确认出库 ›</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, v = formValues($('#hq-out-form', m.root));
      var lines = [];
      its.forEach(function (it, i) {
        var q = num($('[data-out-i="' + i + '"]', m.root).value);
        if (q > 0) lines.push({ name: it.name, code: it.code, category: it.category, unit: it.unit, quantity: q, requested_quantity: num(it.quantity), item_id: it.inventory_item_id, price: num(it.price) || priceOfItem(it) });
      });
      if (!lines.length) { toast('请至少填写一个出库数量', 'err'); return; }
      if (!v.operator) { toast('请填写仓库确定人', 'err'); return; }
      busy(b, '出库处理中', true);
      // 未办理的单（status 仍为 pending_approval）先推进到合法状态，绕过 confirmStockOut 门禁
      var pre = (r.status === 'pending_approval' || r.status === 'pending') ? advanceHandled(r, '仓库直接确定出库') : Promise.resolve();
      Promise.resolve(pre)
        .then(function () { return SupaDB.confirmStockOut(r.id, { stockout_date: v.stockout_date, confirmed_by: v.operator, items: lines, total_quantity: lines.reduce(function (a, x) { return a + x.quantity; }, 0) }); })
        .then(function (res) {
          postLedger(chain === 'live' ? 'prize_ship' : 'tour_signoff', lines, (lines[0] || {}).category, v.stockout_date, res && res.code);
          m.close(); toast('仓库已确定出库：' + (res && res.code || '')); H.loadAll();
        })
        .catch(function (e) { busy(b, null, false); toast('出库失败：' + (e && e.message || e), 'err'); });
    };
  }
  function viewReq(id) {
    var r = findIn(H.D.requisitions, id); if (!r) return;
    var its = H.itemsOf(r);
    var rows = its.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.category || '未分类') + '</td><td class="num">' + num(it.quantity) + '</td><td>' + esc(it.unit || '') + '</td></tr>'; }).join('');
    var m = openModal('领用单 · ' + (r.code || ''),
      '<div class="hq-detail"><b>申请日期：</b>' + esc(r.apply_date || '—') + '　<b>申请人：</b>' + esc(r.applicant || '—') + '<br>' +
      '<b>团号：</b>' + esc(tourNoFromRemark(r) || '—') + '　<b>团期：</b>' + esc(r.tour_name || '—') + '　<b>状态：</b>' + esc(r.status || '—') +
      (function () { var fp = readFlowPayload(r); if (!fp) return '';
        var extra = fp.chain === 'live' ? ('客户明细 ' + fp.items.reduce(function (a, x) { return a + (x.customers || []).length; }, 0) + ' 条')
          : fp.chain === 'tour' ? ('实拿合计 ' + fp.items.reduce(function (a, x) { return a + num(x.actual); }, 0) + ' 件' + (fp.diffNote ? ' · 差异：' + esc(fp.diffNote) : ''))
          : ('金额合计 ¥' + num(fp.totalAmount).toFixed(2));
        return '<br><b>办理结果：</b>' + esc(fp.stepLabel || '—') + ' · ' + esc(fp.handledBy || '—') + ' · ' + esc(fp.handledAt || '') + ' · ' + extra; })() +
      '</div>' +
      '<div class="hq-sec">明细 ' + its.length + ' 项</div><div class="tw"><table><thead><tr><th>名称</th><th>归属</th><th class="num">数量</th><th>单位</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4">无明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn" data-hq-cancel>关闭</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
  }

  // ---------- 填写并邮寄（领用1 直播礼品的中间环节入口） ----------
  // v6.12：邮寄必须关联主播已锁定库存的直播礼品领用单（团号在申请时确定、全链路只读），
  // 不再独立建档；客户信息由销售在 handleLive() 中全部手动填写，仓库在末端确定出库。
  function mailOut(btn) {
    var pend = (H.D.requisitions || []).filter(function (r) {
      var st = String(r.status || '');
      if (st === 'outbound_completed' || st === 'withdrawn' || st === 'rejected') return false;
      if (/HQ_HANDLED/.test(String(r.remark || ''))) return false; // 已办理过的不再重复填写
      return chainOfReq(r) === 'live';
    });
    if (!pend.length) { toast('当前没有待销售填写并邮寄的直播礼品领用单，请先由主播提交申请（团号必填）', 'err'); return; }
    if (pend.length === 1) { handleLive(pend[0]); return; }
    var opts = pend.map(function (r) {
      return { v: r.id, t: (r.code || '') + ' · ' + (r.applicant || '') + ' · 团号 ' + (tourNoFromRemark(r) || '—') };
    });
    var m = openModal('销售填写并邮寄 · 选择单据',
      '<form id="hq-pick-mail"><div class="hqf-grid">' + field('选择直播礼品领用单', 'reqId', pend[0].id, 'select', { options: opts }) + '</div>' +
      '<div class="hq-notice">邮寄必须关联主播已锁定库存的领用单；团号在申请时确定、本步只读。客户信息<b>全部手动填写</b>，一个物品可拆给多位客户，保存后待仓库确定出库。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-next>下一步 ›</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-next]', m.root).onclick = function () {
      var id = formValues($('#hq-pick-mail', m.root)).reqId;
      var r = findIn(H.D.requisitions, id);
      m.close();
      if (r) handleLive(r);
    };
  }
  function viewSO(id) {
    var s = findIn(H.D.stockout, id); if (!s) return;
    var its = H.itemsOf(s);
    var rows = its.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.category || '未分类') + '</td><td class="num">' + num(it.quantity) + '</td></tr>'; }).join('');
    var m = openModal('出库单 · ' + (s.code || ''),
      '<div class="hq-detail"><b>出库日期：</b>' + esc(s.stockout_date || '—') + '　<b>状态：</b>' + esc(s.status || '—') + '<br><b>快递单号：</b>' + esc(s.tracking_no || '—') + '　<b>领用单：</b>' + esc(s.requisition_code || '—') + '</div>' +
      '<div class="hq-sec">明细 ' + its.length + ' 项</div><div class="tw"><table><thead><tr><th>名称</th><th>归属</th><th class="num">数量</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">无明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn" data-hq-reverse style="margin-right:auto;color:#c0392b">红冲台账</button>' +
      '<button class="btn" data-hq-cancel>关闭</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-reverse]', m.root).onclick = function () {
      confirmBox('红冲台账', '确认对出库单 ' + (s.code || '') + ' 的台账流水做红冲？将生成冲销流水，原单保留可追溯。', function () {
        if (!window.HQFoundation || typeof HQFoundation.reverseDocument !== 'function') throw new Error('过账引擎未加载');
        return HQFoundation.reverseDocument(s.code, '总部后台台账红冲').then(function (r) {
          if (r && r.ok === false) throw new Error(r.error || '红冲失败');
          m.close();
        });
      }, { danger: true, confirmText: '确认红冲', okText: '台账已红冲' });
    };
  }

  // ---------- 特殊入库（库存退回）—— 出团物料关联领用单 ----------
  function newReturn(btn) {
    var cats = ownNames().filter(function (x) { return x !== '未分类'; });
    var m = openModal('新建退回入库单',
      '<form id="hq-return-form">' +
      '<div class="hqf-grid">' +
      field('退回方式', 'mode', 'linked', 'select', { options: [{ v: 'linked', t: '关联领用单退回（出团物料）' }, { v: 'free', t: '普通物品退回' }] }) +
      field('用途归属', 'category', '出团物料', 'select', { options: cats }) +
      '</div>' +
      '<div id="hq-ret-linked">' +
      '<div class="hqf-grid" style="margin-top:10px">' +
      field('筛选团期', 'tour', '', 'select', { options: ['全部团期'] }) +
      field('选择领用单', 'req', '', 'select', { options: ['请先选择团期'] }) +
      '</div>' +
      '<div id="hq-ret-preview" style="margin-top:10px;border:1.5px dashed #d4cdc4;border-radius:10px;padding:12px;min-height:52px;color:#a09890;font-size:12px">选择领用单后可预览明细，并勾选要退回的物品与数量</div>' +
      '</div>' +
      '<div id="hq-ret-free" style="display:none;margin-top:10px" class="hqf-grid">' +
      field('退回物品', 'name', '', 'text', { attrs: 'list="hq-ret-names" placeholder="选择库存物品或输入名称"' }) +
      '<datalist id="hq-ret-names">' + (H.D.inventory || []).map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>' +
      field('物品编码', 'code', '', 'text') +
      field('退回数量', 'qty', '', 'number', { attrs: 'min="0.01" step="0.01" placeholder="数量"' }) +
      field('单位', 'unit', '', 'text') +
      '</div>' +
      '<div class="hqf-grid" style="margin-top:12px">' +
      field('申请人', 'applicant', '', 'text', { attrs: 'required placeholder="退回经办人"' }) +
      field('退回原因', 'reason', '', 'text', { attrs: 'required placeholder="例如：团后剩余物料退回"' }) +
      '</div>' +
      '<div class="hq-notice">退回单提交后为「待仓库确定」，仓库确定退回实物后才回补库存；入库成本按物品当前加权均价计，均价不变。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>提交退回单</button>');
    var f = $('#hq-return-form', m.root);
    var modeSel = $('[name="mode"]', f), catSel = $('[name="category"]', f);
    var tourSel = $('[name="tour"]', f), reqSel = $('[name="req"]', f), preview = $('#hq-ret-preview', m.root);
    var selectedReq = null;
    // 已出库量按领用单统计（按 code/name）
    function outedMap(reqId) {
      var mp = {};
      (H.D.stockout || []).forEach(function (s) {
        if (String(s.requisition_id) !== String(reqId)) return;
        H.itemsOf(s).forEach(function (it) { var k = it.code || it.name; mp[k] = (mp[k] || 0) + num(it.quantity); });
      });
      return mp;
    }
    // 已退回量按领用单号关联（退回单 reason 里带「领用单 HQRQ…」），驳回的不算。
    function returnedMap(reqCode) {
      var mp = {};
      (H.D.returns || []).forEach(function (rr) {
        if (rr.status === 'rejected') return;
        if (!reqCode || String(rr.reason || '').indexOf(reqCode) < 0) return;
        var k = rr.item_code || rr.code || rr.name;
        if (!k) return;
        mp[k] = (mp[k] || 0) + num(rr.qty);
      });
      return mp;
    }
    function rebuildTours() {
      var tours = {};
      (H.D.requisitions || []).forEach(function (r) {
        if (r.status === 'withdrawn') return;
        var its = H.itemsOf(r);
        var cat = its[0] && its[0].category;
        if (catSel.value === '出团物料' && !r.tour_name) return;
        if (cat && cat !== catSel.value) return;
        if (r.tour_name) tours[r.tour_name] = 1;
      });
      var tl = Object.keys(tours);
      tourSel.innerHTML = '<option value="">全部' + (catSel.value === '出团物料' ? '团期' : '单据') + '</option>' + tl.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
      rebuildReqs();
    }
    function rebuildReqs() {
      var tour = tourSel.value;
      var list = (H.D.requisitions || []).filter(function (r) {
        if (r.status === 'withdrawn') return false;
        var its = H.itemsOf(r);
        var cat = its[0] && its[0].category;
        if (cat && cat !== catSel.value) return false;
        if (catSel.value === '出团物料' && tour && r.tour_name !== tour) return false;
        return true;
      });
      reqSel.innerHTML = list.length ? '<option value="">请选择领用单</option>' + list.map(function (r) {
        return '<option value="' + esc(r.id) + '">' + esc(r.code) + ' · ' + esc(r.tour_name || r.applicant || '') + ' · ' + esc((r.created_at || '').slice(5, 10)) + '</option>';
      }).join('') : '<option value="">该团期暂无领用单</option>';
      selectedReq = null; preview.innerHTML = '选择领用单后可预览明细，并勾选要退回的物品与数量';
    }
    function renderPreview() {
      var r = selectedReq; if (!r) return;
      var its = H.itemsOf(r), outed = outedMap(r.id), returned = returnedMap(r.code);
      if (!its.length) { preview.innerHTML = '该领用单无明细'; return; }
      preview.innerHTML = '<div style="font-weight:700;color:#2d2620;margin-bottom:8px">领用单 ' + esc(r.code) + ' · ' + esc(r.tour_name || r.applicant || '') + ' · 明细预览</div>' +
        '<div style="font-size:11px;color:#8a8278;margin-bottom:6px">可退回 = 已出库 − 已退回（只有带出去没用完的才能退；领了但没出库的仍在库存里，不需退）</div>' +
        '<table style="width:100%;font-size:11.5px;border-collapse:collapse"><thead><tr style="background:#f0e9df"><th style="text-align:left;padding:5px">退?</th><th style="text-align:left;padding:5px">物品</th><th style="padding:5px">领用</th><th style="padding:5px">已出库</th><th style="padding:5px">已退回</th><th style="padding:5px">可退回</th><th style="padding:5px">退回数量</th></tr></thead><tbody>' +
        its.map(function (it, i) {
          var k = it.code || it.name, total = num(it.quantity), od = outed[k] || 0, rt = returned[k] || 0, left = Math.max(0, od - rt);
          return '<tr><td style="padding:4px"><input type="checkbox" data-retck="' + i + '"' + (left > 0 ? '' : ' disabled') + '></td>' +
            '<td style="padding:4px">' + esc(it.name) + '</td><td style="text-align:center;padding:4px">' + total + '</td>' +
            '<td style="text-align:center;padding:4px">' + od + '</td><td style="text-align:center;padding:4px;color:#2d8659">' + rt + '</td><td style="text-align:center;padding:4px;font-weight:700">' + left + '</td>' +
            '<td style="padding:4px"><input type="number" data-retqty="' + i + '" min="0" max="' + left + '" step="0.01" value="' + left + '" style="width:74px;border:1px solid #d4cdc4;border-radius:6px;padding:4px"></td></tr>';
        }).join('') + '</tbody></table>';
    }
    function switchMode() {
      var linked = modeSel.value === 'linked';
      $('#hq-ret-linked', m.root).style.display = linked ? '' : 'none';
      $('#hq-ret-free', m.root).style.display = linked ? 'none' : '';
      if (linked) rebuildTours();
    }
    modeSel.onchange = switchMode;
    catSel.onchange = switchMode;
    tourSel.onchange = rebuildReqs;
    reqSel.onchange = function () { selectedReq = findIn(H.D.requisitions || [], reqSel.value); renderPreview(); };
    switchMode();
    // 普通模式：物品名带出编码/单位
    var nameInput = $('[name="name"]', f);
    if (nameInput) nameInput.onchange = function () {
      var hit = (H.D.inventory || []).find(function (x) { return x.name === nameInput.value; });
      if (hit) { $('[name="code"]', f).value = hit.code || ''; $('[name="unit"]', f).value = hit.unit || ''; }
    };
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this; if (!f.reportValidity()) return;
      var v = formValues(f);
      var linked = modeSel.value === 'linked';
      var jobs = [];
      if (linked) {
        if (!selectedReq) { toast('请选择要退回的领用单', 'err'); return; }
        var its = H.itemsOf(selectedReq), outed = outedMap(selectedReq.id), returned = returnedMap(selectedReq.code), picked = 0;
        its.forEach(function (it, i) {
          var ck = $('[data-retck="' + i + '"]', preview), qi = $('[data-retqty="' + i + '"]', preview);
          if (!ck || !ck.checked) return;
          var k = it.code || it.name, q = num(qi && qi.value), od = outed[k] || 0, rt = returned[k] || 0, left = Math.max(0, od - rt);
          if (q <= 0) return;
          if (q > left) { toast(it.name + ' 退回数量超过可退回量 ' + left + '（已出库 ' + od + ' − 已退回 ' + rt + '）', 'err'); return; }
          picked++;
          jobs.push({ code: it.code, name: it.name, category: catSel.value, unit: it.unit, qty: q, reason: '团期物料退回 / 领用单 ' + selectedReq.code + (v.reason ? ' / ' + v.reason : '') + ' / 申请人：' + v.applicant });
        });
        if (!picked) { toast('请至少勾选一项并填写退回数量', 'err'); return; }
      } else {
        if (!v.name || num(v.qty) <= 0) { toast('请填写退回物品与数量', 'err'); return; }
        jobs.push({ code: v.code, name: v.name, category: v.category, unit: v.unit, qty: num(v.qty), reason: (v.reason || '') + ' / 申请人：' + v.applicant });
      }
      busy(b, '提交中', true);
      Promise.all(jobs.map(function (j) {
        return SupaDB.createNonPurchaseStockIn({ code: j.code, name: j.name, category: j.category, unit: j.unit, qty: j.qty, reason: j.reason, price: 0 });
      })).then(function (rs) {
        m.close(); toast('退回单已提交 ' + rs.length + ' 张（待仓库确定）'); H.loadAll();
      }).catch(function (e) { busy(b, null, false); toast('提交失败：' + (e && e.message || e), 'err'); });
    };
  }
  function findReturn(id) { return findIn(H.D.returns || [], id); }
  function approveReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    confirmBox('仓库确定退回入库', '确认将 ' + (rr.code || '') + ' · ' + esc(rr.name || '') + ' × ' + num(rr.qty) + ' 确定入库？确定后回补库存。', function () {
      return SupaDB.approveNonPurchaseStockIn(rr.id, '总部仓库确定退回入库').then(function () {
        postLedger('recovery_acceptance', [{ name: rr.name, code: rr.item_code || rr.code, category: rr.category_name || rr.category, quantity: num(rr.qty), item_id: null }],
          rr.category_name || rr.category, today(), rr.code);
      });
    }, { confirmText: '仓库确定入库', okText: '已回补库存' });
  }
  function rejectReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    confirmBox('驳回退回单', '确认驳回 ' + (rr.code || '') + '？驳回后不会回补库存。', function () {
      return SupaDB.rejectNonPurchaseStockIn(rr.id, '总部仓库驳回');
    }, { danger: true, confirmText: '确认驳回', okText: '已驳回' });
  }
  function viewReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    var stMap = { pending: '待仓库确定', approved: '已回补', rejected: '已驳回' };
    var m = openModal('退回入库单 · ' + (rr.code || ''),
      '<div class="hq-detail"><b>物品：</b>' + esc(rr.name || '—') + '　<b>编码：</b>' + esc(rr.item_code || rr.code || '—') + '<br>' +
      '<b>归属：</b>' + esc(rr.category_name || rr.category || '—') + '　<b>数量：</b>' + num(rr.qty) + ' ' + esc(rr.unit || '') + '<br>' +
      '<b>状态：</b>' + esc(stMap[rr.status] || rr.status || '—') + '　<b>申请人：</b>' + esc(rr.applicant_name || '—') + '<br>' +
      '<b>退回原因：</b>' + esc(rr.reason || '—') + (rr.remark ? '<br><b>备注：</b>' + esc(rr.remark) : '') + '</div>',
      '<button class="btn" data-hq-cancel>关闭</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
  }

  // ---------- 账号 ----------
  function newUser(btn) {
    var roles = [{ v: 'admin', t: 'admin（全部权限）' }, { v: 'warehouse', t: 'warehouse（仓库）' }, { v: 'staff', t: 'staff（普通）' }];
    var m = openModal('新增账号',
      '<form id="hq-user-form"><div class="hqf-grid">' +
      field('登录账号', 'username', '', 'text', { attrs: 'required' }) +
      field('姓名', 'name', '', 'text', { attrs: 'required' }) +
      field('角色', 'role', 'staff', 'select', { options: roles }) +
      field('初始状态', 'status', 'active', 'select', { options: [{ v: 'active', t: '启用' }, { v: 'pending', t: '停用' }] }) +
      '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>创建账号</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-user-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f);
      var maxId = (H.D.users || []).reduce(function (a, u) { return Math.max(a, num(u.id)); }, 0);
      busy(b, '创建中', true);
      Promise.resolve(SupaDB.createUser({ id: maxId + 1, username: v.username, name: v.name, role: v.role, status: v.status, description: '总部账号' }))
        .then(function () { m.close(); toast('账号已创建：' + v.username); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('创建失败：' + (e && e.message || e), 'err'); });
    };
  }
  function userPerm(username) {
    var u = (H.D.users || []).find(function (x) { return x.username === username; }); if (!u) return;
    var roles = ['admin', 'warehouse', 'purchase', 'finance', 'staff'];
    var m = openModal('账号权限 · ' + username,
      '<form id="hq-perm-form"><div class="hqf-grid">' +
      field('登录账号', 'username', u.username, 'text', { attrs: 'readonly' }) +
      field('姓名', 'name', u.name, 'text', { attrs: 'readonly' }) +
      field('角色', 'role', u.role, 'select', { options: roles }) +
      field('状态', 'status', u.status === 'active' || u.is_active ? 'active' : 'pending', 'select', { options: [{ v: 'active', t: '启用' }, { v: 'pending', t: '停用' }] }) +
      '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>保存权限</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, v = formValues($('#hq-perm-form', m.root));
      busy(b, '保存中', true);
      Promise.resolve(SupaDB.updateUser(username, { role: v.role, status: v.status }))
        .then(function () { m.close(); toast('权限已保存'); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('保存失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ---------- 导入 / 导出 / 筛选 ----------
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var old = document.querySelector('script[src="' + src + '"]'); if (old && window.XLSX) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function importPO(btn) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      busy(btn, '解析中', true);
      loadScript('js/vendor/xlsx.full.min.js').then(function () {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (data.length < 2) throw new Error('表格没有数据行');
            var head = data[0].map(function (x) { return String(x).trim(); });
            function col(aliases, fallback) {
              for (var i = 0; i < head.length; i++) {
                if (aliases.some(function (a) { return head[i].indexOf(a) >= 0; })) return i;
              }
              return fallback;
            }
            var ci = {
              name: col(['名称', '物品'], 0), code: col(['编码'], 1), cat: col(['归属', '分类'], 2),
              qty: col(['数量'], 3), unit: col(['单位'], 4), price: col(['单价'], 5), date: col(['日期'], 6), buyer: col(['采购人', '申请人'], 7)
            };
            var items = [], d = '', buyer = '';
            data.slice(1).forEach(function (r) {
              var nm = String(r[ci.name] || '').trim(); if (!nm) return;
              items.push({ name: nm, code: String(r[ci.code] || '').trim(), category: String(r[ci.cat] || '未分类').trim() || '未分类',
                quantity: num(r[ci.qty]), unit: String(r[ci.unit] || '').trim(), price: num(r[ci.price]) });
              if (!d) d = String(r[ci.date] || '').trim();
              if (!buyer) buyer = String(r[ci.buyer] || '').trim();
            });
            if (!items.length) throw new Error('未读到有效明细，请检查列名');
            items = attachItemId(items);
            var payload = { purchase_date: d || today(), purchaser: buyer || '管理员', remark: 'Excel 导入 ' + f.name, suppliers: [],
              items: items.map(function (x) { return { name: x.name, code: x.code, category: x.category, quantity: num(x.quantity), unit: x.unit, price: num(x.price), amount: Number((num(x.quantity) * num(x.price)).toFixed(2)), item_id: x.item_id }; }) };
            payload.total_amount = payload.items.reduce(function (a, x) { return a + x.amount; }, 0);
            SupaDB.createPurchaseOrder(payload).then(function (o) { busy(btn, null, false); toast('已导入 ' + items.length + ' 行，采购单 ' + (o && o.code || '')); H.loadAll(); })
              .catch(function (e) { busy(btn, null, false); toast('导入失败：' + (e && e.message || e), 'err'); });
          } catch (e) { busy(btn, null, false); toast('解析失败：' + (e && e.message || e), 'err'); }
        };
        reader.readAsArrayBuffer(f);
      }).catch(function () { busy(btn, null, false); toast('本地 Excel 解析库加载失败', 'err'); });
    };
    inp.click();
  }
  // 库存概览批量导入：模板下载 + 逐行校验 + 首次盘库建账（对齐采购导入的解析/落库范式）
  var INV_TPL_HEAD = ['编码', '名称', '品牌', '型号', '单位', '单价', '安全库存', '用途归属', '初始库存'];
  function downloadInvTemplate() {
    var btn = $('#btn-inv-template');
    busy(btn, '生成中', true);
    loadScript('js/vendor/xlsx.full.min.js').then(function () {
      var ws = XLSX.utils.aoa_to_sheet([
        INV_TPL_HEAD,
        ['示例-001', '示例物品（导入前请删除本行）', '示例品牌', '示例型号', '个', 10, 10, '直播礼品', 0]
      ]);
      ws['!cols'] = [16, 30, 14, 14, 8, 10, 12, 14, 12].map(function (w) { return { wch: w }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '库存导入');
      XLSX.writeFile(wb, '总部库存导入模板.xlsx');
      busy(btn, null, false); toast('模板已下载');
    }).catch(function () { busy(btn, null, false); toast('本地 Excel 解析库加载失败', 'err'); });
  }
  function importInventory(btn) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      busy(btn, '解析中', true);
      loadScript('js/vendor/xlsx.full.min.js').then(function () {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            var data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
            if (data.length < 2) throw new Error('表格没有数据行');
            var head = data[0].map(function (x) { return String(x).trim(); });
            function col(aliases, fallback) {
              for (var i = 0; i < head.length; i++) {
                if (aliases.some(function (a) { return head[i].indexOf(a) >= 0; })) return i;
              }
              return fallback;
            }
            var ci = {
              code: col(['编码'], 0), name: col(['名称', '物品'], 1), brand: col(['品牌'], 2),
              model: col(['型号', '规格'], 3), unit: col(['单位'], 4), price: col(['单价'], 5),
              safety: col(['安全库存'], 6), cat: col(['用途归属', '归属', '分类'], 7), stock: col(['初始库存', '库存'], 8)
            };
            var validCats = ownNames(), seenCode = {}, seenName = {}, rows = [], errs = [];
            (H.D.inventory || []).forEach(function (x) {
              if (x.code) seenCode[String(x.code).trim().toLowerCase()] = 1;
              if (x.name) seenName[String(x.name).trim().toLowerCase()] = 1;
            });
            data.slice(1).forEach(function (r, idx) {
              var line = idx + 2, name = String(r[ci.name] || '').trim();
              if (!name || name.indexOf('示例') >= 0) return;
              var code = String(r[ci.code] || '').trim();
              var cat = String(r[ci.cat] || '').trim() || '未分类';
              var stock = num(r[ci.stock]), price = num(r[ci.price]), safety = num(r[ci.safety]);
              if (validCats.indexOf(cat) < 0) { errs.push('第' + line + '行：用途归属「' + cat + '」不是有效分类'); return; }
              if (stock < 0 || price < 0 || safety < 0) { errs.push('第' + line + '行：单价/安全库存/初始库存不能为负数'); return; }
              var ck = code.toLowerCase(), nk = name.toLowerCase();
              if (code && seenCode[ck]) { errs.push('第' + line + '行：编码「' + code + '」重复'); return; }
              if (seenName[nk]) { errs.push('第' + line + '行：物品名称「' + name + '」已存在'); return; }
              if (code) seenCode[ck] = 1;
              seenName[nk] = 1;
              rows.push({ code: code, name: name, brand: String(r[ci.brand] || '').trim(), model: String(r[ci.model] || '').trim(),
                unit: String(r[ci.unit] || '个').trim(), unit_price: price, safety_stock: safety || 10,
                category_name: cat, stock: stock });
            });
            if (!rows.length && !errs.length) throw new Error('未读到有效数据行（示例行会被自动跳过）');
            if (errs.length) {
              busy(btn, null, false);
              var mm = openModal('导入校验未通过 · ' + errs.length + ' 处问题',
                '<div class="hq-msg">' + errs.slice(0, 20).map(esc).join('<br>') + (errs.length > 20 ? '<br>…' : '') + '</div>',
                '<button class="btn primary" data-hq-close>知道了</button>');
              $('[data-hq-close]', mm.root).onclick = mm.close;
              return;
            }
            var i = 0, ok = 0, fail = [];
            function next() {
              if (i >= rows.length) {
                busy(btn, null, false);
                toast('导入完成：成功 ' + ok + ' 行' + (fail.length ? '，失败 ' + fail.length + ' 行：' + fail.join('；') : ''));
                H.loadAll(); return;
              }
              var r = rows[i++];
              var payload = { name: r.name, brand: r.brand, model: r.model, unit: r.unit, unit_price: r.unit_price,
                stock: r.stock, safety_stock: r.safety_stock, category_name: r.category_name };
              if (r.code) payload.code = r.code;
              var savedId = null, savedCode = null;
              Promise.resolve(SupaDB.createInventoryItem(payload)).then(function (saved) {
                savedId = saved && saved.id; savedCode = payload.code || (saved && saved.code) || r.name;
                ok++;
                if (r.stock > 0 && SupaDB.createInventoryAdjustment && savedId) {
                  return Promise.resolve(SupaDB.createInventoryAdjustment({
                    inventory_item_id: savedId, item_code: savedCode, delta: r.stock, new_stock: r.stock,
                    reason: 'Excel 批量导入·首次盘库建账', created_by: 'hq-import'
                  })).catch(function (e) { console.warn('[HQ导入] 调整记录失败', e.message); });
                }
              }).catch(function (e) { fail.push(r.name + '：' + (e && e.message || e)); }).then(next);
            }
            next();
          } catch (e) { busy(btn, null, false); toast('解析失败：' + (e && e.message || e), 'err'); }
        };
        reader.readAsArrayBuffer(f);
      }).catch(function () { busy(btn, null, false); toast('本地 Excel 解析库加载失败', 'err'); });
    };
    inp.click();
  }
  function exportCSV(mod) {
    var table = $('#mod-' + mod + ' table'); if (!table) { toast('当前模块没有可导出的表格', 'err'); return; }
    var lines = $$('tr', table).map(function (tr) {
      return $$('th,td', tr).map(function (c) { return '"' + (c.textContent || '').trim().replace(/\s+/g, ' ').replace(/"/g, '""') + '"'; }).join(',');
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '遇见美好总部_' + mod + '_' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已导出 CSV');
  }
  function filterRows(mod, colIdx, val) {
    $$('#mod-' + mod + ' tbody tr').forEach(function (tr) {
      if (!tr.querySelector('td')) return;
      var cell = tr.querySelectorAll('td')[colIdx];
      var txt = cell ? cell.textContent : '';
      var all = !val || val.indexOf('全部') === 0;
      tr.style.display = (all || txt.indexOf(val) >= 0) ? '' : 'none';
    });
  }
  function queryReports() { H.loadAll(); toast('团期数据已刷新'); }
  function expandAll(btn) {
    var groups = $$('#mod-reports .tr-group');
    var anyClosed = groups.some(function (g) { return !g.classList.contains('open'); });
    groups.forEach(function (g) { g.classList.toggle('open', anyClosed); });
    toast(anyClosed ? '已展开全部团期' : '已收起全部团期');
  }
  function saveSetting(el) {
    var key = el.id || el.getAttribute('data-key');
    if (!key) return;
    Promise.resolve(SupaDB.upsertSetting(key, el.checked ? 'true' : 'false'))
      .then(function () { toast('设置已保存'); })
      .catch(function (e) { toast('设置保存失败：' + (e && e.message || e), 'err'); });
  }

  // ---------- 仪表盘数字下钻 ----------
  var OWN_NAME = { live: '直播礼品', tour: '出团物料', admin: '行政物料', wh: '总部仓库' };
  function drillDown(kind, ownerKey) {
    var own = OWN_NAME[ownerKey] || '全部归属';
    var rows = [], title = '', note = '';
    if (kind === 'locked') {
      // 直播拟出库锁定：逐单逐场列出
      title = '锁定待出库明细 · ' + own;
      note = '主播已拟出库、尚未由销售实际出库的物料。锁定数量 = 申请量 − 已出库量。';
      var outedByReq = {};
      (H.D.stockout || []).forEach(function (s) {
        if (!s.requisition_id) return;
        var k = String(s.requisition_id);
        H.itemsOf(s).forEach(function (it) { outedByReq[k] = (outedByReq[k] || 0) + num(it.quantity); });
      });
      (H.D.requisitions || []).forEach(function (r) {
        if (r.status === 'outbound_completed' || r.status === 'withdrawn') return;
        var its = H.itemsOf(r);
        var hit = its.filter(function (it) { return !ownerKey || it.category === own; });
        if (!hit.length) return;
        var isLive = r.scenario === 'live_plan' || (hit[0] && hit[0].category === '直播礼品');
        if (ownerKey === 'live' && !isLive) return;
        var outed = outedByReq[String(r.id)] || 0;
        var session = (r.purpose || r.remark || '').replace(/归属：.*/, '').trim() || '未命名场次';
        hit.forEach(function (it) {
          var left = Math.max(0, num(it.quantity) - outed);
          outed = Math.max(0, outed - num(it.quantity));
          if (left <= 0) return;
          rows.push({ cells: [esc(r.code || ''), esc(session), esc(r.applicant || '—'), esc(it.name), num(it.quantity).toFixed(0), left.toFixed(0), esc(it.unit || '')] });
        });
      });
    } else if (kind === 'out') {
      // 实际出库：逐单列出，直播礼品含中奖邮寄
      title = '实际出库明细 · ' + own;
      note = '已实际发出的物料，按出库单统计；直播礼品含中奖邮寄出库。';
      (H.D.stockout || []).forEach(function (s) {
        var isMail = s.out_type === 'mail' || s.is_mail || (s.remark || '').indexOf('邮寄') >= 0;
        H.itemsOf(s).forEach(function (it) {
          if (ownerKey && it.category !== own) return;
          rows.push({ cells: [esc(s.code || ''), esc((s.stockout_date || '').slice(5, 10)), isMail ? '中奖邮寄' : '领用出库', esc(it.name), num(it.quantity).toFixed(0), esc(it.unit || ''), esc(s.tracking_no || (isMail ? '待填写' : '—'))] });
        });
      });
    } else if (kind === 'returned') {
      title = '退回入库明细 · ' + own;
      note = '领用/邮寄后剩余物料退回，仓库确定后已回补库存的流水。';
      (H.D.returns || []).filter(function (r) { return r.status === 'approved'; }).forEach(function (r) {
        if (ownerKey && (r.category_name || r.category) !== own) return;
        rows.push({ cells: [esc(r.code || ''), esc((r.created_at || '').slice(5, 10)), esc(r.name || ''), esc(r.reason || '—'), num(r.qty).toFixed(0), esc(r.applicant_name || '—'), esc(r.remark || '—')] });
      });
    }
    var heads;
    if (kind === 'locked') heads = ['领用单号', '直播场次', '主播', '物料', '拟出库量', '锁定待出', '单位'];
    else if (kind === 'out') heads = ['出库单号', '日期', '出库类型', '物料', '数量', '单位', '快递单号'];
    else heads = ['退回单号', '日期', '物料', '退回原因', '数量', '申请人', '备注'];
    var body = rows.length
      ? '<div class="tw"><table><thead><tr>' + heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.cells.map(function (c, i) { return '<td' + (i >= 4 && i <= 5 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>'
      : '<div class="hq-msg" style="text-align:center;padding:24px 0">暂无' + esc(title.replace(/明细.*/, '')) + '记录</div>';
    var foot = '<button class="btn" data-hq-cancel>关闭</button>';
    if (kind === 'locked') foot = '<button class="btn" data-hq-goto-stockout style="margin-right:auto">前往出库管理办理 ›</button>' + foot;
    if (kind === 'out' || kind === 'returned') foot = '<button class="btn" data-hq-goto-monthly style="margin-right:auto">查看出入库明细 ›</button>' + foot;
    var m = openModal(title,
      '<div class="hq-notice">' + esc(note) + '</div>' + body,
      foot);
    $('[data-hq-cancel]', m.root).onclick = m.close;
    var gs = $('[data-hq-goto-stockout]', m.root);
    if (gs) gs.onclick = function () {
      m.close();
      if (window.HQApp && HQApp.setStockOutOwner) HQApp.setStockOutOwner(ownerKey || 'live');
      var nav = document.querySelector('.nav-item[data-mod="stockout"]');
      if (nav) nav.click();
    };
    var go = $('[data-hq-goto-monthly]', m.root);
    if (go) go.onclick = function () {
      m.close();
      if (window.HQApp && HQApp.setOwner) HQApp.setOwner(ownerKey || 'all');
      var nav = document.querySelector('.nav-item[data-mod="monthly"]');
      if (nav) nav.click();
    };
  }

  // ---------- 事件分发 ----------
  var ACTS = {
    'item-edit': function (id, b) { editItem(id, b); },
    'po-edit': function (id, b) { editPO(id, b); },
    'po-view': function (id) { viewPO(id); },
    'po-stockin': function (id, b) { acceptStockIn(id, b); },
    'si-accept': function (id, b) { acceptStockIn(id, b); },
    'rq-handle': function (id) { handleReq(id); },
    'rq-approve': function (id) { handleReq(id); }, // 兼容旧缓存的 data-act
    'rq-out': function (id, b) { outReq(id, b); },
    'rq-view': function (id) { viewReq(id); },
    'so-view': function (id) { viewSO(id); },
    'spt-approve': function (id) { approveReturn(id); },
    'spt-reject': function (id) { rejectReturn(id); },
    'spt-view': function (id) { viewReturn(id); },
    'user-perm': function (id) { userPerm(id); }
  };
  document.addEventListener('click', function (e) {
    var drill = e.target.closest('[data-drill]');
    if (drill) { e.preventDefault(); drillDown(drill.getAttribute('data-drill'), drill.getAttribute('data-own')); return; }
    var row = e.target.closest('.row-act');
    if (row) {
      e.preventDefault(); var fn = ACTS[row.getAttribute('data-act')];
      if (fn) fn(row.getAttribute('data-id'), row); else toast('未知操作', 'err');
      return;
    }
    var add = e.target.closest('.cat-add');
    if (add) { addCategory(add); return; }
    var card = e.target.closest('.cat-card');
    if (card) { editCategory(card); return; }

    var btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'btn-inv-template') { downloadInvTemplate(); return; }
    if (btn.id === 'btn-inv-import') { importInventory(btn); return; }
    // 弹窗内按钮已由各自 openModal 的 [data-hq-*] 单独绑定；全局「按文字分发」必须排除，
    // 否则弹窗里出现「填写并邮寄 ›」「仓库确定出库 ›」等字样会被冒泡再次触发（v6.12）。
    if (btn.closest('#hq-modal-root')) return;
    var txt = (btn.textContent || '').trim();
    var m0 = $('.mod:not(.hidden)'); var mod = m0 ? m0.id.replace('mod-', '') : '';
    if (txt.indexOf('新增物品') >= 0) editItem(null, btn);
    else if (txt.indexOf('新增归属') >= 0) addCategory(btn);
    else if (txt.indexOf('新建采购单') >= 0) editPO(null, btn);
    else if (txt.indexOf('导入Excel') >= 0) importPO(btn);
    else if (txt.indexOf('新建领用单') >= 0) newReq(btn);
    else if (txt.indexOf('新建退回单') >= 0) newReturn(btn);
    else if (txt.indexOf('邮寄出库') >= 0 || txt.indexOf('填写并邮寄') >= 0) mailOut(btn);
    else if ((txt.indexOf('领用出库') >= 0 || txt.indexOf('仓库确定出库') >= 0) && mod === 'stockout') outReqPrompt(btn);
    else if (txt.indexOf('导出') >= 0) exportCSV(mod);
    else if (txt.indexOf('查询') >= 0 && mod === 'reports') queryReports();
    else if (txt.indexOf('展开全部') >= 0) expandAll(btn);
    else if (txt.indexOf('新增账号') >= 0) newUser(btn);
  });
  function outReqPrompt(btn) {
    var pend = (H.D.requisitions || []).filter(function (r) { return r.status === 'approved' || r.status === 'pending_outbound' || r.status === 'partially_outbounded'; });
    if (!pend.length) { toast('当前没有待仓库确定出库的单据，请先完成上一岗位办理', 'err'); return; }
    if (pend.length === 1) { outReq(pend[0].id, btn); return; }
    var opts = pend.map(function (r) { return { v: r.id, t: (r.code || '') + ' · ' + (r.applicant || '') + ' · ' + (r.tour_name || '—') }; });
    var m = openModal('仓库确定出库 · 选择单据',
      '<form id="hq-pick-out"><div class="hqf-grid">' + field('选择领用单', 'reqId', pend[0].id, 'select', { options: opts }) + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-next>下一步</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-next]', m.root).onclick = function () { var id = formValues($('#hq-pick-out', m.root)).reqId; m.close(); outReq(id, btn); };
  }
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('#mod-inventory .filterbar .sel')) filterRows('inventory', 7, el.value);
    else if (el.matches('#mod-purchase .filterbar .sel')) filterRows('purchase', 5, el.value);
    else if (el.matches('#mod-stockin .filterbar .sel')) filterRows('stockin', 4, el.value);
    else if (el.matches('#mod-specialin .filterbar .sel')) {
      var ss2 = $$('#mod-specialin .filterbar .sel');
      if (ss2[0] === el) filterRows('specialin', 3, el.value);
      else filterRows('specialin', 7, el.value);
    }
    else if (el.matches('#mod-requisition .filterbar .sel')) {
      var sels = $$('#mod-requisition .filterbar .sel');
      if (sels[0] === el) filterRows('requisition', 5, el.value);
      else {
        // 流程状态按当前高亮节点匹配（申请 / 中间办理 / 仓库确定出库）
        var want = { '待办理': '申请', '待仓库确定': '确定', '已出库': '出库' }[el.value] || '';
        $$('#mod-requisition tbody tr').forEach(function (tr) {
          var on = $('.flow .step.on', tr);
          var txt = on ? on.textContent.trim() : '';
          tr.style.display = (!want || txt.indexOf(want) >= 0) ? '' : 'none';
        });
      }
    } else if (el.matches('#mod-stockout .filterbar .sel')) {
      var ss = $$('#mod-stockout .filterbar .sel');
      if (ss[0] === el) filterRows('stockout', 5, el.value);
      else filterRows('stockout', 1, el.value);
    } else if (el.matches('#mod-adminset input[type=checkbox]')) saveSetting(el);
  });

  // 设置项稳定 key（与 Supabase settings 表对应）
  (function tagSettings() {
    var boxes = $$('#mod-adminset input[type=checkbox]');
    var keys = ['require_req_approval', 'low_stock_alert', 'stockout_need_tour', 'mail_need_tracking', 'win_lock_stock', 'tour_verify_remind'];
    boxes.forEach(function (b, i) { if (!b.id) { b.id = keys[i] || ('hq_setting_' + i); b.setAttribute('data-key', b.id); } });
  })();

  toast('总部模块操作已就绪');
})();
