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
    '#hq-modal-root .hq-msg{font-size:13.5px;line-height:1.9;color:#5e554c}',
    '#hq-modal-root .hq-detail{font-size:12.5px;color:#5e554c;line-height:1.95}',
    '#hq-modal-root .hq-detail b{color:#2d2620}',
    '.row-act{background:none;border:none;color:#c23616;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;padding:0 2px}',
    '.row-act:hover{text-decoration:underline}',
    '.hq-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:hqSpin .7s linear infinite;vertical-align:-2px}',
    '@keyframes hqSpin{to{transform:rotate(360deg)}}',
    '.hq-toast{position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#2d2620;color:#fff;padding:10px 20px;border-radius:9px;z-index:9999;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:80vw;text-align:center}',
    '.hq-toast.err{background:#c0392b}'
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
  function toast(msg, kind) {
    var old = $('.hq-toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'hq-toast' + (kind === 'err' ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3200);
  }
  function busy(btn, text, on) {
    if (!btn) return;
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

  /** 可增删的明细编辑表，返回 get() 取当前行数组 */
  function linesEditor(mount, initial, withPrice) {
    var rows = JSON.parse(JSON.stringify(initial || []));
    function render() {
      mount.innerHTML = rows.map(function (r, i) {
        return '<div class="hq-line" data-i="' + i + '">' +
          '<input data-k="name" placeholder="物品名称" value="' + esc(r.name || '') + '">' +
          '<input data-k="code" placeholder="编码" value="' + esc(r.code || '') + '">' +
          '<select data-k="category">' + ownOpts(r.category || r.category_name) + '</select>' +
          '<input data-k="quantity" type="number" min="0" step="1" placeholder="数量" value="' + esc(r.quantity == null ? '' : r.quantity) + '">' +
          '<input data-k="unit" placeholder="单位" value="' + esc(r.unit || '') + '">' +
          (withPrice ? '<input data-k="price" type="number" min="0" step="0.01" placeholder="单价" value="' + esc(r.price == null ? '' : r.price) + '">' : '') +
          '<button type="button" class="hq-del" data-i="' + i + '" title="删除该行">×</button></div>';
      }).join('') + '<button type="button" class="hq-addline">+ 添加明细行</button>';
    }
    mount.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k'); if (!k) return;
      rows[Number(e.target.parentNode.getAttribute('data-i'))][k] = e.target.value;
    });
    mount.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-k'); if (!k) return;
      rows[Number(e.target.parentNode.getAttribute('data-i'))][k] = e.target.value;
    });
    mount.addEventListener('click', function (e) {
      if (e.target.classList.contains('hq-addline')) { rows.push({ name: '', code: '', category: ownNames()[0], quantity: '', unit: '', price: '' }); render(); }
      if (e.target.classList.contains('hq-del')) { rows.splice(Number(e.target.getAttribute('data-i')), 1); render(); }
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
    var m = openModal(it ? '编辑物品 · ' + (it.code || '') : '新增物品',
      '<form id="hq-item-form"><div class="hqf-grid">' +
      field('物品名称', 'name', it && it.name, 'text', { attrs: 'required' }) +
      field('编码（留空自动生成）', 'code', it && it.code) +
      field('品牌', 'brand', it && it.brand) +
      field('规格 / 型号', 'model', it && it.model) +
      field('单位', 'unit', it && it.unit || '个') +
      field('单价（元）', 'unit_price', it && it.unit_price || 0, 'number', { attrs: 'min="0" step="0.01"' }) +
      field('安全库存', 'safety_stock', it && it.safety_stock || 10, 'number', { attrs: 'min="0" step="1"' }) +
      field('用途归属', 'category_name', it && (it.category_name || it.category), 'select', { options: ownNames() }) +
      '</div><div class="hq-msg" style="margin-top:14px;font-size:11.5px">物品数量只能通过采购入库 / 领用出库 / 报损等单据变化，此处不直接改库存。</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>' + (it ? '保存修改' : '创建物品') + '</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-item-form', m.root);
      if (!f.reportValidity()) return;
      var v = formValues(f);
      var payload = {
        name: v.name, code: v.code, brand: v.brand, model: v.model, unit: v.unit,
        unit_price: num(v.unit_price), safety_stock: num(v.safety_stock), category_name: v.category_name
      };
      if (!payload.code) delete payload.code;
      if (it) payload.stock = num(it.stock);
      busy(b, '保存中', true);
      var task = it ? SupaDB.updateInventoryItem(it.id, payload) : SupaDB.createInventoryItem(payload);
      Promise.resolve(task).then(function () { m.close(); toast(it ? '物品已更新' : '物品已创建'); H.loadAll(); })
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
    var its = p ? H.itemsOf(p).map(function (x) { return { name: x.name, code: x.code, category: x.category, quantity: x.quantity, unit: x.unit, price: x.price }; }) : [];
    var m = openModal(p ? '编辑采购单 · ' + (p.code || '') : '新建采购单',
      '<form id="hq-po-form"><div class="hqf-grid">' +
      field('采购日期', 'purchase_date', p && p.purchase_date || today(), 'date') +
      field('采购人', 'purchaser', p && p.purchaser || '') +
      '</div><div class="hq-sec">采购明细</div><div id="hq-po-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', p && p.remark, 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>' + (p ? '保存修改' : '创建采购单') + '</button>');
    var ed = linesEditor($('#hq-po-lines', m.root), its.length ? its : [{ name: '', code: '', category: ownNames()[0], quantity: '', unit: '', price: '' }], true);
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-po-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), rows = attachItemId(ed.get());
      if (!rows.length) { toast('请至少填写一行采购明细', 'err'); return; }
      var payload = {
        purchase_date: v.purchase_date, purchaser: v.purchaser, remark: v.remark, suppliers: [],
        items: rows.map(function (r) {
          return { name: r.name, code: r.code, category: r.category, quantity: num(r.quantity), unit: r.unit, price: num(r.price), amount: Number((num(r.quantity) * num(r.price)).toFixed(2)), item_id: r.item_id };
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
      '</div><div class="hq-sec">本次实收数量</div>' +
      its.map(function (it, i) {
        var key = it.code || it.name, done = received[key] || 0;
        var left = Math.max(0, num(it.quantity) - done);
        return '<div class="hq-line"><span style="flex:1 1 130px;font-size:12px">' + esc(it.name) + ' <small style="color:#a09890">订购 ' + num(it.quantity) + ' · 已收 ' + done + '</small></span>' +
          '<input data-si-i="' + i + '" type="number" min="0" max="' + left + '" step="1" value="' + left + '" style="max-width:100px">' +
          '<label style="font-size:11px;color:#5e554c"><input data-skip-i="' + i + '" type="checkbox"> 不入库</label></div>';
      }).join('') +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>确认入库</button>');
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, v = formValues($('#hq-si-form', m.root));
      var lines = [];
      its.forEach(function (it, i) {
        var skip = $('[data-skip-i="' + i + '"]', m.root);
        var q = num($('[data-si-i="' + i + '"]', m.root) && $('[data-si-i="' + i + '"]', m.root).value);
        if (skip && skip.checked) { lines.push({ name: it.name, code: it.code, category: it.category, quantity: num(it.quantity), actual_quantity: 0, price: num(it.price), unit: it.unit, is_skipped: true }); return; }
        if (q > 0) lines.push({ name: it.name, code: it.code, category: it.category, quantity: num(it.quantity), actual_quantity: q, price: num(it.price), unit: it.unit, item_id: it.inventory_item_id });
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
          m.close(); toast('验收入库完成：' + (r && r.code || '')); H.loadAll();
        })
        .catch(function (e) { busy(b, null, false); toast('入库失败：' + (e && e.message || e), 'err'); });
    };
  }

  // ---------- 领用单 ----------
  function newReq(btn) {
    var m = openModal('新建领用单',
      '<form id="hq-rq-form"><div class="hqf-grid">' +
      field('申请日期', 'apply_date', today(), 'date') +
      field('团期日期', 'tour_date', today(), 'date') +
      field('团期名称', 'tour_name', '', 'text', { attrs: 'placeholder="例如：0918 华东五日游"' }) +
      field('领用人', 'applicant', '', 'text', { attrs: 'required placeholder="例如：导游-陈"' }) +
      '</div><div class="hq-sec">领用明细</div><div id="hq-rq-lines"></div>' +
      '<div class="hqf-grid" style="margin-top:14px">' + field('备注', 'remark', '', 'textarea') + '</div></form>',
      '<button class="btn" data-hq-cancel>取消</button><button class="btn primary" data-hq-save>提交领用单</button>');
    var ed = linesEditor($('#hq-rq-lines', m.root), [{ name: '', code: '', category: ownNames()[0], quantity: '', unit: '' }], false);
    $('[data-hq-cancel]', m.root).onclick = m.close;
    $('[data-hq-save]', m.root).onclick = function () {
      var b = this, f = $('#hq-rq-form', m.root); if (!f.reportValidity()) return;
      var v = formValues(f), rows = attachItemId(ed.get());
      if (!rows.length) { toast('请至少填写一行领用明细', 'err'); return; }
      var payload = { apply_date: v.apply_date, tour_date: v.tour_date, tour_name: v.tour_name,
        applicant: v.applicant, remark: v.remark, total_quantity: rows.reduce(function (a, r) { return a + num(r.quantity); }, 0),
        items: rows.map(function (r) { return { item_id: r.item_id, name: r.name, code: r.code, category: r.category, unit: r.unit, quantity: num(r.quantity), brand: r.brand, model: r.model }; }) };
      busy(b, '提交中', true);
      Promise.resolve(SupaDB.createRequisition(payload)).then(function (r) { m.close(); toast('领用单已创建：' + (r && r.code || '')); H.loadAll(); })
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
    var m = openModal('领用出库 · ' + (r.code || ''),
      '<form id="hq-out-form"><div class="hqf-grid">' + field('出库日期', 'stockout_date', today(), 'date') + '</div>' +
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
      busy(b, '出库处理中', true);
      Promise.resolve(SupaDB.confirmStockOut(r.id, { stockout_date: v.stockout_date, items: lines, total_quantity: lines.reduce(function (a, x) { return a + x.quantity; }, 0) }))
        .then(function (res) { m.close(); toast('出库完成：' + (res && res.code || '')); H.loadAll(); })
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
      }).then(function (so) { m.close(); toast('邮寄出库完成：' + (so && so.code || '')); H.loadAll(); })
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
