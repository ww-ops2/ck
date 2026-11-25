/**
 * HQ Actions - 遇见美好总部：按钮 / 附属弹窗页 / 真实写库（v6.3）
 * 依赖：hq-app.js 暴露的 window.HQApp（同一份 D 数据与 renderAll 入口）
 * 所有写操作一律经 SupaDB.* 落 Supabase；所有删除/审核走自定义确认弹窗。
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
    '#hq-modal-root .hqm{background:#fff;border:1.5px solid #d4cdc4;border-radius:17px 8px 19px 9px/9px 19px 8px 17px;width:min(820px,100%);box-shadow:0 18px 50px rgba(45,38,32,.22);animation:hqmA .16s ease-out}',
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
    return ownNames().map(function (n) { return '<option' + (String(sel) === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
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
    return { get: function () { return rows.filter(function (r) { return String(r.name || '').trim(); }); } };
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

  // ---------- 采购单 ----------
  function editPO(id, btn) {
    var p = id ? findIn(H.D.purchase, id) : null;
    var its = p ? H.itemsOf(p).map(function (x) { return { name: x.name, code: x.code, brand: x.brand, model: x.model, category: x.category, quantity: x.quantity, unit: x.unit, price: x.price, item_id: x.item_id || x.inventory_item_id }; }) : [];
    var m = openModal(p ? '编辑采购单 · ' + (p.code || '') : '新建采购单',
      '<form id="hq-po-form"><div class="hqf-grid">' +
      field('采购日期', 'purchase_date', p && p.purchase_date || today(), 'date') +
      field('采购人', 'purchaser', p && p.purchaser || '') +
      '</div><div class="hq-sec">采购明细 <small style="font-weight:400;color:#a09890">新商品直接填；已有商品点「库存」选择，自动带出品牌 / 型号 / 编码</small></div><div id="hq-po-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', p && p.remark, 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>' + (p ? '保存修改' : '创建采购单') + '</button>');
    var ed = linesEditor($('#hq-po-lines', m.root), its.length ? its : [{ name: '', code: '', brand: '', model: '', category: ownNames()[0], quantity: '', unit: '', price: '' }], true);
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-po-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), rows = attachItemId(ed.get());
      if (!rows.length) { toast('请至少填写一行采购明细', 'err'); return; }
      // 编码唯一化（对齐列车 reconcileItemCodes）：重复编码自动加 -2/-3 后缀，防撞号
      var seen = {}, seq = {};
      rows.forEach(function (r) {
        var base = String(r.code || '').trim();
        if (!base || !seen[base]) { if (base) seen[base] = true; return; }
        var n = (seq[base] = (seq[base] || 1) + 1);
        r.code = base + '-' + n;
      });
      var payload = {
        purchase_date: v.purchase_date, purchaser: v.purchaser, remark: v.remark, suppliers: [],
        items: rows.map(function (r) {
          return { name: r.name, code: r.code, brand: r.brand, model: r.model, category: r.category, quantity: num(r.quantity), unit: r.unit, price: num(r.price), amount: Number((num(r.quantity) * num(r.price)).toFixed(2)), item_id: r.item_id };
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

  // ---------- 领用单（按用途归属分链路） ----------
  // 直播礼品：主播拟出库(锁定) → 销售实际出库；出团物料：团期必填 → 领用出库 → 核销；行政/仓库：常规出库
  var CHAIN_INFO = {
    '直播礼品': { key: 'live_plan', label: '直播双链路', tip: '主播拟出库后库存进入「锁定待出」状态，实际出库由销售角色在「出库管理」完成。团期无需填写。', applicant: '主播姓名' },
    '出团物料': { key: 'tour', label: '团期领用', tip: '出团物料必须填写团期名称与团期日期，领用后按团期核销。', applicant: '领用人（导游）' },
    '行政物料': { key: 'normal', label: '常规出库', tip: '行政物料属常规物品出库，无需团期，审核后领用出库即可。', applicant: '领用人' },
    '总部仓库': { key: 'normal', label: '常规出库', tip: '总部仓库物料属常规出库，无需团期，审核后领用出库即可。', applicant: '领用人' }
  };
  function chainOf(cat) { return CHAIN_INFO[cat] || { key: 'normal', label: '常规出库', tip: '常规物品出库，无需团期。', applicant: '领用人' }; }

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
      '<div class="hq-sec">领用明细</div><div id="hq-rq-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>提交领用单</button>');
    var ed = linesEditor($('#hq-rq-lines', m.root), [{ name: '', code: '', category: first, quantity: '', unit: '' }], false);
    var catSel = $('[name="category"]', m.root);
    var tip = $('#hq-rq-tip', m.root), fields = $('#hq-rq-chain-fields', m.root);
    function renderChain() {
      var cat = catSel.value, info = chainOf(cat);
      tip.textContent = info.tip;
      if (info.key === 'live_plan') {
        fields.innerHTML = field('直播场次/主题（拟出库用途）', 'purpose', '', 'text', { attrs: 'required placeholder="例如：1125 双十一专场直播"' }) +
          field(info.applicant, 'applicant', '', 'text', { attrs: 'required placeholder="主播姓名"' });
      } else if (info.key === 'tour') {
        fields.innerHTML = field('团期名称', 'tour_name', '', 'text', { attrs: 'required placeholder="例如：0918 华东五日游"' }) +
          field('团期日期', 'tour_date', today(), 'date', { attrs: 'required' }) +
          field(info.applicant, 'applicant', '', 'text', { attrs: 'required placeholder="例如：导游-陈"' }) +
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
      if (!rows.length) { toast('请至少填写一行领用明细', 'err'); return; }
      // 明细归属统一跟随所选用途归属（便于按归属切换筛选与链路判定）
      rows.forEach(function (r) { r.category = v.category; });
      var info = chainOf(v.category);
      var remarkBits = ['归属：' + v.category];
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
      Promise.resolve(task).then(function (r) { m.close(); toast('领用单已创建：' + (r && r.code || '') + (info.key === 'live_plan' ? '（主播拟出库·已锁定）' : '')); H.loadAll(); })
        .catch(function (e) { busy(b, null, false); toast('提交失败：' + (e && e.message || e), 'err'); });
    };
  }
  function approveReq(id) {
    var r = findIn(H.D.requisitions, id); if (!r) return;
    confirmBox('审核领用单', '确认审核通过 ' + (r.code || '') + '？通过后该单可进入出库环节。', function () {
      return SupaDB.approveRequisition(r.id, '总部后台审核通过');
    }, { confirmText: '审核通过', okText: '审核已通过' });
  }
  function outReq(id, btn) {
    var r = findIn(H.D.requisitions, id); if (!r) { toast('找不到领用单', 'err'); return; }
    var its = H.itemsOf(r);
    var done = {};
    (H.D.stockout || []).forEach(function (s) {
      if (String(s.requisition_id) !== String(r.id)) return;
      H.itemsOf(s).forEach(function (x) { var k = x.code || x.name; done[k] = (done[k] || 0) + num(x.quantity); });
    });
    var chain = chainOf(r.category_name || (its[0] || {}).category);
    var isLive = chain.key === 'live_plan';
    var m = openModal((isLive ? '销售实际出库 · ' : '领用出库 · ') + (r.code || ''),
      '<form id="hq-out-form"><div class="hqf-grid">' +
      field('出库日期', 'stockout_date', today(), 'date') +
      field(isLive ? '出库销售' : '出库经办人', 'operator', '', 'text', { attrs: 'required placeholder="' + (isLive ? '销售姓名' : '经办人姓名') + '"' }) +
      '</div>' + (isLive ? '<div class="hq-notice">直播链路第二段：主播已拟出库并锁定库存，此处由销售确认实际出库，锁定自动释放。</div>' : '') +
      '<div class="hq-sec">本次出库数量</div>' +
      its.map(function (it, i) {
        var k = it.code || it.name, d = done[k] || 0, left = Math.max(0, num(it.quantity) - d);
        return '<div class="hq-line"><span style="flex:1 1 130px;font-size:12px">' + esc(it.name) + ' <small style="color:#a09890">申请 ' + num(it.quantity) + ' · 已出 ' + d + '</small></span>' +
          '<input data-out-i="' + i + '" type="number" min="0" max="' + left + '" step="1" value="' + left + '" style="max-width:100px"></div>';
      }).join('') + '</form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>确认出库</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, v = formValues($('#hq-out-form', m.root));
      var lines = [];
      its.forEach(function (it, i) {
        var q = num($('[data-out-i="' + i + '"]', m.root).value);
        if (q > 0) lines.push({ name: it.name, code: it.code, category: it.category, unit: it.unit, quantity: q, requested_quantity: num(it.quantity), item_id: it.inventory_item_id, price: num(it.price) });
      });
      if (!lines.length) { toast('请至少填写一个出库数量', 'err'); return; }
      if (!v.operator) { toast('请填写' + (isLive ? '出库销售' : '出库经办人'), 'err'); return; }
      busy(b, '出库处理中', true);
      Promise.resolve(SupaDB.confirmStockOut(r.id, { stockout_date: v.stockout_date, confirmed_by: v.operator, items: lines, total_quantity: lines.reduce(function (a, x) { return a + x.quantity; }, 0) }))
        .then(function (res) {
          // 直播：win_register 锁定已在拟出库时登记，实际出库用 prize_ship 解锁(locked -1 / physical -1)
          postLedger(isLive ? 'prize_ship' : 'tour_signoff', lines, (lines[0] || {}).category, v.stockout_date, res && res.code);
          m.close(); toast('出库完成：' + (res && res.code || '')); H.loadAll();
        })
        .catch(function (e) { busy(b, null, false); toast('出库失败：' + (e && e.message || e), 'err'); });
    };
  }
  function viewReq(id) {
    var r = findIn(H.D.requisitions, id); if (!r) return;
    var its = H.itemsOf(r);
    var rows = its.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.category || '未分类') + '</td><td class="num">' + num(it.quantity) + '</td><td>' + esc(it.unit || '') + '</td></tr>'; }).join('');
    var m = openModal('领用单 · ' + (r.code || ''),
      '<div class="hq-detail"><b>申请日期：</b>' + esc(r.apply_date || '—') + '　<b>领用人：</b>' + esc(r.applicant || '—') + '<br><b>团期：</b>' + esc(r.tour_name || '—') + '　<b>状态：</b>' + esc(r.status || '—') + '</div>' +
      '<div class="hq-sec">明细 ' + its.length + ' 项</div><div class="tw"><table><thead><tr><th>名称</th><th>归属</th><th class="num">数量</th><th>单位</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4">无明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn" data-hq-cancel>关闭</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
  }

  // ---------- 邮寄出库 ----------
  function mailOut(btn) {
    var m = openModal('邮寄出库（直播礼品中奖）',
      '<form id="hq-mail-form"><div class="hqf-grid">' +
      field('收件人', 'applicant', '', 'text', { attrs: 'required placeholder="中奖人姓名"' }) +
      field('快递公司', 'carrier', '顺丰速运') +
      field('快递单号', 'tracking_no', '') +
      field('出库日期', 'stockout_date', today(), 'date') +
      '</div><div class="hq-sec">邮寄明细</div><div id="hq-mail-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>确认邮寄出库</button>');
    var ed = linesEditor($('#hq-mail-lines', m.root), [{ name: '', code: '', category: '直播礼品', quantity: '', unit: '个' }], false);
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-mail-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), rows = attachItemId(ed.get());
      if (!rows.length) { toast('请至少填写一行邮寄明细', 'err'); return; }
      busy(b, '邮寄出库处理中', true);
      // 邮寄走领用出库链路建档 → 审核 → 出库 → 回写邮寄字段，全程落库可追溯
      SupaDB.createRequisition({
        apply_date: v.stockout_date, tour_date: v.stockout_date, tour_name: '中奖邮寄',
        scenario: '邮寄出库', applicant: v.applicant, remark: (v.remark || '') + ' / 快递 ' + v.carrier + ' ' + v.tracking_no,
        total_quantity: rows.reduce(function (a, r) { return a + num(r.quantity); }, 0),
        items: rows.map(function (r) { return { item_id: r.item_id, name: r.name, code: r.code, category: r.category, unit: r.unit, quantity: num(r.quantity) }; })
      }).then(function (req) {
        // 线上若未放宽状态约束，createRequisition 会降级为 pending_outbound，此时无需再审核
        var st = req.status || '';
        if (st !== 'pending_approval' && st !== 'pending') return req;
        return SupaDB.approveRequisition(req.id, '邮寄出库自动审核')
          .catch(function () { return null; }).then(function () { return req; });
      }).then(function (req) {
        return SupaDB.confirmStockOut(req.id, {
          stockout_date: v.stockout_date,
          items: rows.map(function (r) { return { item_id: r.item_id, name: r.name, code: r.code, category: r.category, unit: r.unit, quantity: num(r.quantity), price: num(r.price) }; }),
          total_quantity: rows.reduce(function (a, r) { return a + num(r.quantity); }, 0)
        });
      }).then(function (so) {
        var sb = getSupabase();
        return sb.from('stock_out_records').update({ out_type: 'mail', tracking_no: v.tracking_no || '待填写', remark: v.carrier + ' / ' + v.remark })
          .eq('id', so.id).then(function () { return so; });
      }).then(function (so) {
        postLedger('prize_ship', rows, '直播礼品', v.stockout_date, so && so.code);
        m.close(); toast('邮寄出库完成：' + (so && so.code || '')); H.loadAll();
      })
        .catch(function (e) { busy(b, null, false); toast('邮寄出库失败：' + (e && e.message || e), 'err'); });
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

  // ---------- 特殊入库（库存退回） ----------
  function newReturn(btn) {
    var cats = ownNames().filter(function (x) { return x !== '未分类'; });
    var m = openModal('新建退回入库单',
      '<form id="hq-return-form"><div class="hqf-grid">' +
      field('退回物品', 'name', '', 'text', { attrs: 'required list="hq-ret-names" placeholder="选择库存物品或输入名称"' }) +
      '<datalist id="hq-ret-names">' + (H.D.inventory || []).map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>' +
      field('物品编码', 'code', '', 'text') +
      field('用途归属', 'category', cats[0], 'select', { options: cats }) +
      field('退回数量', 'qty', '', 'number', { attrs: 'required min="0.01" step="0.01" placeholder="数量"' }) +
      field('单位', 'unit', '', 'text') +
      field('申请人', 'applicant', '', 'text', { attrs: 'required placeholder="退回经办人"' }) +
      '</div><div class="hqf-grid" style="margin-top:12px">' + field('退回原因', 'reason', '', 'textarea', { attrs: 'required placeholder="例如：直播后未发出的礼品退回 / 出团剩余物料退回"' }) + '</div>' +
      '<div class="hq-notice">退回单提交后为「待审核」，审核通过才回补库存；入库成本按物品当前加权均价计，均价不变。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>提交退回单</button>');
    var f = $('#hq-return-form', m.root);
    var nameInput = $('[name="name"]', f);
    nameInput.onchange = function () {
      var hit = (H.D.inventory || []).find(function (x) { return x.name === nameInput.value; });
      if (hit) {
        $('[name="code"]', f).value = hit.code || '';
        $('[name="unit"]', f).value = hit.unit || '';
        var cat = hit.category_name || hit.category;
        if (cat && Array.prototype.some.call($('[name="category"]', f).options, function (o) { return o.value === cat; })) $('[name="category"]', f).value = cat;
      }
    };
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this; if (!f.reportValidity()) return;
      var v = formValues(f);
      busy(b, '提交中', true);
      Promise.resolve(SupaDB.createNonPurchaseStockIn({
        code: v.code, name: v.name, category: v.category, unit: v.unit,
        qty: num(v.qty), reason: v.reason + ' / 申请人：' + v.applicant, price: 0
      })).then(function (r) {
        m.close(); toast('退回单已提交：' + (r && r.code || '') + '（待审核）'); H.loadAll();
      }).catch(function (e) { busy(b, null, false); toast('提交失败：' + (e && e.message || e), 'err'); });
    };
  }
  function findReturn(id) { return findIn(H.D.returns || [], id); }
  function approveReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    confirmBox('审核退回入库', '确认将 ' + (rr.code || '') + ' · ' + esc(rr.name || '') + ' × ' + num(rr.qty) + ' 审核入库？审核后回补库存。', function () {
      return SupaDB.approveNonPurchaseStockIn(rr.id, '总部审核退回入库').then(function () {
        postLedger('recovery_acceptance', [{ name: rr.name, code: rr.item_code || rr.code, category: rr.category_name || rr.category, quantity: num(rr.qty), item_id: null }],
          rr.category_name || rr.category, today(), rr.code);
      });
    }, { confirmText: '审核入库', okText: '已回补库存' });
  }
  function rejectReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    confirmBox('驳回退回单', '确认驳回 ' + (rr.code || '') + '？驳回后不会回补库存。', function () {
      return SupaDB.rejectNonPurchaseStockIn(rr.id, '总部审核驳回');
    }, { danger: true, confirmText: '确认驳回', okText: '已驳回' });
  }
  function viewReturn(id) {
    var rr = findReturn(id); if (!rr) return;
    var stMap = { pending: '待审核', approved: '已入库', rejected: '已驳回' };
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

  // ---------- 事件分发 ----------
  var ACTS = {
    'item-edit': function (id, b) { editItem(id, b); },
    'po-edit': function (id, b) { editPO(id, b); },
    'po-view': function (id) { viewPO(id); },
    'po-stockin': function (id, b) { acceptStockIn(id, b); },
    'si-accept': function (id, b) { acceptStockIn(id, b); },
    'rq-approve': function (id) { approveReq(id); },
    'rq-out': function (id, b) { outReq(id, b); },
    'rq-view': function (id) { viewReq(id); },
    'so-view': function (id) { viewSO(id); },
    'spt-approve': function (id) { approveReturn(id); },
    'spt-reject': function (id) { rejectReturn(id); },
    'spt-view': function (id) { viewReturn(id); },
    'user-perm': function (id) { userPerm(id); }
  };
  document.addEventListener('click', function (e) {
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
    var txt = (btn.textContent || '').trim();
    var m0 = $('.mod:not(.hidden)'); var mod = m0 ? m0.id.replace('mod-', '') : '';
    if (txt.indexOf('新增物品') >= 0) editItem(null, btn);
    else if (txt.indexOf('新增归属') >= 0) addCategory(btn);
    else if (txt.indexOf('新建采购单') >= 0) editPO(null, btn);
    else if (txt.indexOf('导入Excel') >= 0) importPO(btn);
    else if (txt.indexOf('新建领用单') >= 0) newReq(btn);
    else if (txt.indexOf('新建退回单') >= 0) newReturn(btn);
    else if (txt.indexOf('邮寄出库') >= 0) mailOut(btn);
    else if (txt.indexOf('领用出库') >= 0 && mod === 'stockout') outReqPrompt(btn);
    else if (txt.indexOf('导出') >= 0) exportCSV(mod);
    else if (txt.indexOf('查询') >= 0 && mod === 'reports') queryReports();
    else if (txt.indexOf('展开全部') >= 0) expandAll(btn);
    else if (txt.indexOf('新增账号') >= 0) newUser(btn);
  });
  function outReqPrompt(btn) {
    var pend = (H.D.requisitions || []).filter(function (r) { return r.status === 'approved' || r.status === 'pending_outbound' || r.status === 'partially_outbounded'; });
    if (!pend.length) { toast('当前没有可出库的领用单，请先新建并审核领用单', 'err'); return; }
    if (pend.length === 1) { outReq(pend[0].id, btn); return; }
    var opts = pend.map(function (r) { return { v: r.id, t: (r.code || '') + ' · ' + (r.applicant || '') + ' · ' + (r.tour_name || '—') }; });
    var m = openModal('领用出库 · 选择单据',
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
        // 流程状态按当前高亮步骤匹配（审核 / 在途 / 核销）
        var want = { '待审核': '审核', '在途': '在途', '已出库': '核销' }[el.value] || '';
        $$('#mod-requisition tbody tr').forEach(function (tr) {
          var on = $('.flow .step.on', tr);
          var txt = on ? on.textContent.trim() : '';
          tr.style.display = (!want || txt === want) ? '' : 'none';
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
