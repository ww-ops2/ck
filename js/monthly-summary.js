/**
 * 出入库明细模块（v5.73，原「月度汇总」改造）
 * 月份矩阵：行 = 物品，列 = 选中月份的 入库/出库/其他变动 + 期初/期末
 * 期初 = 最早选中月月初，期末 = 最晚选中月月末（由当前库存反推，无需快照表）
 * 其他变动 = 非采购入库（退库/盘盈，已审核）+ 手工调整 − 异常报损
 * 恒等式：期初 + 入库 − 出库 + 其他变动 = 期末
 */

// 当前选中月份（'YYYY-MM' 数组，升序）
let _msSelectedMonths = [];
// 可选月份列表（数据驱动，含当前月）
let _msAllMonths = [];
// 明细数据（每行一个物品）
let _msDetailData = [];

/* ================================================================
 * 初始化
 * ================================================================ */
function initMonthlySummary() {
  const btnAll = document.getElementById('ms-btn-all-months');
  const btnLatest = document.getElementById('ms-btn-latest-month');
  if (btnAll) btnAll.addEventListener('click', () => {
    if (_msAllMonths.length === 0) return;
    _msSelectedMonths = _msAllMonths.slice();
    loadMonthlySummary();
  });
  if (btnLatest) btnLatest.addEventListener('click', () => {
    if (_msAllMonths.length === 0) return;
    _msSelectedMonths = [_msAllMonths[_msAllMonths.length - 1]];
    loadMonthlySummary();
  });

  // 品类筛选（只重渲染表格，不重算数据）
  const catFilter = document.getElementById('ms-filter-category');
  if (catFilter) catFilter.addEventListener('change', () => _msRenderDetailTable());

  // 导出按钮
  const exportBtn = document.getElementById('ms-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', _msExportExcel);

  // 首次加载
  loadMonthlySummary();
}

/* ================================================================
 * 数据读取（缓存兜底）
 * ================================================================ */
function _msRead(key) {
  return (_appCache && _appCache[key]) ? _appCache[key] : [];
}

/* ================================================================
 * 工具函数
 * ================================================================ */
// 任意日期值 → 'YYYY-MM-DD'（失败返回 ''）
function _msDayStr(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// 'YYYY-MM-DD' → 'YYYY-MM'
function _msMonthOf(day) { return day ? day.slice(0, 7) : ''; }
// 月份月初 'YYYY-MM-01'
function _msMonthStart(mk) { return mk + '-01'; }
// 月份月末 'YYYY-MM-DD'
function _msMonthEnd(mk) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m, 0);
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// 月份显示名：同年显示「9月」，跨年显示「25/9」
function _msMonthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  const nowY = new Date().getFullYear();
  return (y === nowY) ? (m + '月') : (String(y).slice(2) + '/' + m);
}

/**
 * 在 itemMap 中按多种规则查找明细行对应的库存物品桶（容错）：
 * 1) 优先按 id（兼容 item_id / inventory_id / inventory_item_id 三种命名）
 * 2) id 未命中时按 code 匹配
 * 3) 还不行按 name 匹配
 */
function _msResolveItemBucket(itemMap, item) {
  if (!item) return null;
  const id = String(item.item_id || item.inventory_id || item.inventory_item_id || '');
  if (id && id !== 'undefined' && id !== 'null' && itemMap[id]) return itemMap[id];
  if (item.code) {
    const hit = Object.values(itemMap).find(b => b.code === item.code);
    if (hit) return hit;
  }
  if (item.name) {
    const hit = Object.values(itemMap).find(b => b.name === item.name);
    if (hit) return hit;
  }
  return null;
}

/** 按 code/name 查找物品桶（用于非采购入库、报损、调整等单条记录） */
function _msFindBucketByCodeName(itemMap, code, name) {
  if (code) {
    const hit = Object.values(itemMap).find(b => b.code === code);
    if (hit) return hit;
  }
  if (name) {
    const hit = Object.values(itemMap).find(b => b.name === name);
    if (hit) return hit;
  }
  return null;
}

/* ================================================================
 * 主加载函数：读缓存 → 算月份 → 建数据 → 渲染
 * ================================================================ */
function loadMonthlySummary() {
  const inventory = _msRead('inventory');
  const stockInRecords = _msRead('stockInRecords');
  const stockOutRecords = _msRead('stockOutRecords');
  const nonPurchases = _msRead('nonPurchaseStockIns');
  const losses = _msRead('lossRecords');
  const adjustments = _msRead('inventoryAdjustments');

  // ---- 1. 计算可选月份（数据月份 ∪ 当前月，最多回溯 24 个月）----
  _msAllMonths = _msComputeAllMonths(stockInRecords, stockOutRecords, nonPurchases, losses, adjustments);

  // ---- 2. 校正选中月份（保留仍存在的；空则取默认=最新有数据月）----
  _msSelectedMonths = _msSelectedMonths.filter(mk => _msAllMonths.indexOf(mk) >= 0);
  if (_msSelectedMonths.length === 0) {
    _msSelectedMonths = [_msAllMonths[_msAllMonths.length - 1]];
  }
  _msSelectedMonths.sort();

  // ---- 3. 构建明细数据 ----
  _msBuildDetailData(inventory, stockInRecords, stockOutRecords, nonPurchases, losses, adjustments);

  // ---- 4. 渲染 ----
  _msRenderMonthButtons();
  _msUpdateKPI(stockInRecords, stockOutRecords);
  _msRenderDetailTable();
}

/** 汇总所有单据的月份，生成可选月份列表（升序，含当前月，最多 24 个月） */
function _msComputeAllMonths(stockInRecords, stockOutRecords, nonPurchases, losses, adjustments) {
  const set = {};
  stockInRecords.forEach(r => { const mk = _msMonthOf(_msDayStr(r.stockin_date || r.created_at || r.confirmed_at)); if (mk) set[mk] = 1; });
  stockOutRecords.forEach(r => { const mk = _msMonthOf(_msDayStr(r.stockout_date || r.created_at || r.confirmed_at)); if (mk) set[mk] = 1; });
  nonPurchases.forEach(r => {
    if (r.status !== 'approved') return;
    const mk = _msMonthOf(_msDayStr(r.reviewed_at || r.created_at));
    if (mk) set[mk] = 1;
  });
  losses.forEach(r => { const mk = _msMonthOf(_msDayStr(r.created_at)); if (mk) set[mk] = 1; });
  adjustments.forEach(r => { const mk = _msMonthOf(_msDayStr(r.created_at)); if (mk) set[mk] = 1; });

  // 永远包含当前月
  const now = new Date();
  set[now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')] = 1;

  let months = Object.keys(set).sort();
  if (months.length > 24) months = months.slice(months.length - 24);
  return months;
}

/* ================================================================
 * 明细数据构建（月份矩阵）
 * ================================================================ */
function _msBuildDetailData(inventory, stockInRecords, stockOutRecords, nonPurchases, losses, adjustments) {
  const earliest = _msSelectedMonths[0];
  const latest = _msSelectedMonths[_msSelectedMonths.length - 1];
  const rangeStart = _msMonthStart(earliest);
  const rangeEnd = _msMonthEnd(latest);

  // 物品桶：monthly = {月: {in,out,np,loss,adj}}，movements = [{day, net}]（net 增为正）
  const itemMap = {};
  inventory.forEach(it => {
    itemMap[String(it.id)] = {
      id: String(it.id),
      code: it.code || '-',
      name: it.name,
      category: it.category_name || it.category || '未分类',
      brand: it.brand || '-',
      model: it.model || '-',
      unit: it.unit,
      currentStock: Number(it.stock) || 0,
      safetyStock: Number(it.safety_stock) || 0,
      monthly: {},
      movements: []
    };
  });

  const _addMove = (bucket, day, field, qty) => {
    if (!bucket || !qty) return;
    const mk = _msMonthOf(day);
    if (!mk) return;
    if (!bucket.monthly[mk]) bucket.monthly[mk] = { in: 0, out: 0, np: 0, loss: 0, adj: 0 };
    bucket.monthly[mk][field] += qty;
    const net = (field === 'in' || field === 'np' || field === 'adj') ? qty : -qty;
    bucket.movements.push({ day: day, net: net });
  };

  // 1. 采购入库
  stockInRecords.forEach(r => {
    const day = _msDayStr(r.stockin_date || r.created_at || r.confirmed_at);
    if (!day || !r.items) return;
    r.items.forEach(it => {
      const bucket = _msResolveItemBucket(itemMap, it);
      _addMove(bucket, day, 'in', Number(it.quantity) || 0);
    });
  });

  // 2. 出库
  stockOutRecords.forEach(r => {
    const day = _msDayStr(r.stockout_date || r.created_at || r.confirmed_at);
    if (!day || !r.items) return;
    r.items.forEach(it => {
      const bucket = _msResolveItemBucket(itemMap, it);
      _addMove(bucket, day, 'out', Number(it.quantity) || 0);
    });
  });

  // 3. 非采购入库（仅已审核，入库时点 = 审核通过时点）
  nonPurchases.forEach(r => {
    if (r.status !== 'approved') return;
    const day = _msDayStr(r.reviewed_at || r.created_at);
    if (!day) return;
    const bucket = _msFindBucketByCodeName(itemMap, r.item_code, r.name);
    _addMove(bucket, day, 'np', Number(r.qty) || 0);
  });

  // 4. 异常报损（减）
  losses.forEach(r => {
    const day = _msDayStr(r.created_at);
    if (!day) return;
    const bucket = _msFindBucketByCodeName(itemMap, r.item_code, r.name);
    _addMove(bucket, day, 'loss', Number(r.qty) || 0);
  });

  // 5. 手工调整（±delta）
  adjustments.forEach(r => {
    const day = _msDayStr(r.created_at);
    if (!day) return;
    let bucket = null;
    const iid = String(r.inventory_item_id || r.item_id || '');
    if (iid && iid !== 'undefined' && iid !== 'null') bucket = itemMap[iid] || null;
    if (!bucket) bucket = _msFindBucketByCodeName(itemMap, r.item_code, r.item_name || r.name);
    _addMove(bucket, day, 'adj', Number(r.delta) || 0);
  });

  // ---- 期初/期末反推 ----
  // 期末@最晚选中月月末 = 当前库存 − (期末之后的全部净变动)
  // 期初@最早选中月月初 = 期末 − 选中区间内的净变动
  Object.values(itemMap).forEach(b => {
    let afterNet = 0;   // 期末之后的净变动
    let withinNet = 0;  // 选中区间内的净变动
    b.movements.forEach(m => {
      if (m.day > rangeEnd) afterNet += m.net;
      else if (m.day >= rangeStart) withinNet += m.net;
    });
    b.endStock = b.currentStock - afterNet;
    b.beginStock = b.endStock - withinNet;
  });

  _msDetailData = Object.values(itemMap);

  // 填充分类筛选下拉
  const catFilter = document.getElementById('ms-filter-category');
  if (catFilter) {
    const currentVal = catFilter.value;
    const cats = [...new Set(_msDetailData.map(it => it.category))].sort();
    catFilter.innerHTML = '<option value="">全部分类</option>' +
      cats.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
  }
}

/* ================================================================
 * 月份开关渲染
 * ================================================================ */
function _msRenderMonthButtons() {
  const wrap = document.getElementById('ms-month-btns');
  if (!wrap) return;
  wrap.innerHTML = _msAllMonths.map(mk =>
    `<button type="button" class="ms-month-btn ${_msSelectedMonths.indexOf(mk) >= 0 ? 'active' : ''}" data-month="${mk}">${_msMonthLabel(mk)}</button>`
  ).join('');
  // 绑定（每次重建后重绑，用事件委托更稳）
  if (!wrap._msBound) {
    wrap._msBound = true;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.ms-month-btn');
      if (!btn) return;
      const mk = btn.dataset.month;
      let next;
      if (_msSelectedMonths.indexOf(mk) >= 0) {
        next = _msSelectedMonths.filter(m => m !== mk);
        // 不允许清空：取消最后一个月 = 切到该月
        if (next.length === 0) next = [mk];
      } else {
        next = _msSelectedMonths.concat([mk]).sort();
      }
      _msSelectedMonths = next;
      loadMonthlySummary();
    });
  }
}

/* ================================================================
 * KPI 卡片
 * ================================================================ */
function _msUpdateKPI(stockInRecords, stockOutRecords) {
  const rangeStart = _msMonthStart(_msSelectedMonths[0]);
  const rangeEnd = _msMonthEnd(_msSelectedMonths[_msSelectedMonths.length - 1]);

  let inQty = 0, outQty = 0, otherQty = 0;
  let beginStock = 0, endStock = 0, beginItems = 0, endItems = 0, lowStock = 0;

  _msDetailData.forEach(b => {
    beginStock += b.beginStock;
    endStock += b.endStock;
    if (b.beginStock > 0) beginItems++;
    if (b.endStock > 0) endItems++;
    _msSelectedMonths.forEach(mk => {
      const m = b.monthly[mk];
      if (!m) return;
      inQty += m.in;
      outQty += m.out;
      otherQty += (m.np - m.loss + m.adj);
    });
    // 低库存按当前库存口径（safety_stock 兜底 10）
    if (b.currentStock < (b.safetyStock || 10)) lowStock++;
  });

  const inCount = stockInRecords.filter(r => {
    const d = _msDayStr(r.stockin_date || r.created_at || r.confirmed_at);
    return d >= rangeStart && d <= rangeEnd;
  }).length;
  const outCount = stockOutRecords.filter(r => {
    const d = _msDayStr(r.stockout_date || r.created_at || r.confirmed_at);
    return d >= rangeStart && d <= rangeEnd;
  }).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ms-kpi-begin-items', beginItems);
  set('ms-kpi-begin-stock', beginStock);
  set('ms-kpi-in-count', inCount);
  set('ms-kpi-in-qty', '+' + inQty);
  set('ms-kpi-out-count', outCount);
  set('ms-kpi-out-qty', '-' + outQty);
  set('ms-kpi-other-qty', (otherQty > 0 ? '+' : '') + otherQty);
  set('ms-kpi-end-items', endItems);
  set('ms-kpi-end-stock', endStock);
  set('ms-kpi-low-stock', lowStock);

  const rangeLabel = document.getElementById('ms-range-label');
  if (rangeLabel) {
    rangeLabel.textContent = `${rangeStart} ~ ${rangeEnd} · 已选 ${_msSelectedMonths.length} 个月`;
  }
}

/* ================================================================
 * 明细表格渲染（月份矩阵）
 * ================================================================ */
function _msRenderDetailTable() {
  const thead = document.getElementById('ms-detail-thead');
  const tbody = document.getElementById('ms-detail-tbody');
  const colgroup = document.getElementById('ms-detail-colgroup');
  if (!thead || !tbody) return;

  // 列宽常量：与 CSS 中 .sticky-l 的 left 值严格对应（90/130/130/60/75）
  const W = { code: 90, name: 130, brand: 130, unit: 60, begin: 75, month: 62, end: 90 };

  const months = _msSelectedMonths;
  const totalCol = 5 + months.length * 3 + 1;

  // ---- colgroup：固定列宽（table-layout:fixed 依赖它）----
  if (colgroup) {
    let cols =
      `<col style="width:${W.code}px"><col style="width:${W.name}px"><col style="width:${W.brand}px">` +
      `<col style="width:${W.unit}px"><col style="width:${W.begin}px">`;
    months.forEach(() => { cols += `<col style="width:${W.month}px">`.repeat(3); });
    cols += `<col style="width:${W.end}px">`;
    colgroup.innerHTML = cols;
  }

  // ---- 表头（两层，基础列 rowspan=2 实现左侧冻结）----
  let h1 = '<tr>' +
    '<th rowspan="2" class="sticky-l c-code">物品编号</th>' +
    '<th rowspan="2" class="sticky-l c-name">物品名称</th>' +
    '<th rowspan="2" class="sticky-l c-brand">品牌/型号</th>' +
    '<th rowspan="2" class="sticky-l c-unit">单位</th>' +
    '<th rowspan="2" class="sticky-l c-begin">期初库存</th>';
  let h2 = '<tr class="ms-mx-sub">';
  months.forEach((mk, i) => {
    const s = i % 4;
    h1 += `<th colspan="3" class="mh-${s}">${_msMonthLabel(mk)}</th>`;
    h2 += `<th class="shade-${s} c-in">入库</th><th class="shade-${s} c-out">出库</th><th class="shade-${s} c-other">其他</th>`;
  });
  h1 += '<th rowspan="2" class="sticky-end">期末库存</th></tr>';
  h2 += '</tr>';
  thead.innerHTML = h1 + h2;

  // ---- 数据行 ----
  const catFilter = document.getElementById('ms-filter-category')?.value || '';
  let data = _msDetailData.slice();
  if (catFilter) data = data.filter(it => it.category === catFilter);
  data.sort((a, b) => a.category.localeCompare(b.category, 'zh') || a.code.localeCompare(b.code));

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalCol}" class="empty-state">暂无数据</td></tr>`;
    return;
  }

  // 单元格渲染辅助（s = 月份明暗索引）
  const _cell = (v, kind, s) => {
    if (kind === 'other') {
      const o = v || { np: 0, loss: 0, adj: 0 };
      if (!o.np && !o.loss && !o.adj) return `<td class="ms-m-cell ms-m-other shade-${s} ms-zero">·</td>`;
      const net = o.np - o.loss + o.adj;
      const parts = [];
      if (o.np) parts.push('非采购入库 +' + o.np);
      if (o.loss) parts.push('报损 −' + o.loss);
      if (o.adj) parts.push('调整 ' + (o.adj > 0 ? '+' : '') + o.adj);
      return `<td class="ms-m-cell ms-m-other shade-${s}" title="${parts.join(' / ')}">${net > 0 ? '+' : ''}${net}</td>`;
    }
    const cls = kind === 'in' ? 'ms-m-in' : 'ms-m-out';
    const sign = kind === 'in' ? '+' : '−';
    return v
      ? `<td class="ms-m-cell ${cls} shade-${s}">${sign}${v}</td>`
      : `<td class="ms-m-cell ${cls} shade-${s} ms-zero">·</td>`;
  };

  let html = '';
  let lastCat = '';
  data.forEach(it => {
    // 分类分组行（跨 5 列冻结 + 分类小计）
    if (it.category !== lastCat) {
      lastCat = it.category;
      const catItems = data.filter(d => d.category === it.category);
      let row = `<tr class="ms-cat-row">
        <td colspan="5" class="sticky-l c-cat">📁 ${it.category}<span style="font-weight:400;font-size:11px;color:var(--text-muted);margin-left:8px;">(${catItems.length} 种)</span></td>`;
      months.forEach((mk, i) => {
        const s = i % 4;
        let ci = 0, co = 0, cn = 0, cl = 0, ca = 0;
        catItems.forEach(d => { const m = d.monthly[mk]; if (m) { ci += m.in; co += m.out; cn += m.np; cl += m.loss; ca += m.adj; } });
        row += _cell(ci, 'in', s) + _cell(co, 'out', s) + _cell({ np: cn, loss: cl, adj: ca }, 'other', s);
      });
      row += `<td class="sticky-end">${catItems.reduce((sum, d) => sum + d.endStock, 0)}</td></tr>`;
      html += row;
    }

    // 物品行
    let row = `<tr class="ms-item-row">
      <td class="sticky-l c-code ms-code">${it.code}</td>
      <td class="sticky-l c-name ms-name" title="${it.name}">${it.name}</td>
      <td class="sticky-l c-brand ms-brand" title="${it.brand} ${it.model}">${it.brand}${it.model && it.model !== '-' ? ' / ' + it.model : ''}</td>
      <td class="sticky-l c-unit">${it.unit}</td>
      <td class="sticky-l c-begin">${it.beginStock}</td>`;
    months.forEach((mk, i) => {
      const s = i % 4;
      const m = it.monthly[mk] || { in: 0, out: 0, np: 0, loss: 0, adj: 0 };
      row += _cell(m.in, 'in', s) + _cell(m.out, 'out', s) + _cell(m, 'other', s);
    });
    row += `<td class="sticky-end ms-end-val">${it.endStock}</td></tr>`;
    html += row;
  });

  // 合计行
  let row = `<tr class="ms-total-row"><td colspan="5" class="sticky-l c-cat">合计</td>`;
  months.forEach((mk, i) => {
    const s = i % 4;
    let ti = 0, to = 0, tn = 0, tl = 0, ta = 0;
    data.forEach(d => { const m = d.monthly[mk]; if (m) { ti += m.in; to += m.out; tn += m.np; tl += m.loss; ta += m.adj; } });
    row += _cell(ti, 'in', s) + _cell(to, 'out', s) + _cell({ np: tn, loss: tl, adj: ta }, 'other', s);
  });
  row += `<td class="sticky-end ms-end-val">${data.reduce((sum, d) => sum + d.endStock, 0)}</td></tr>`;
  html += row;

  tbody.innerHTML = html;

  // 关键：显式设置表格宽度 = 列宽之和（table-layout:fixed 下必须这样做）
  // 否则浏览器会把表格锁成容器 100% 并按比例压缩所有列，
  // 而 .sticky-l 的 left 是硬编码像素（0/90/220/350/410），列一压缩就与 left 错位 → 冻结列重叠。
  const tbl = document.getElementById('ms-detail-table');
  if (tbl) {
    const totalW = W.code + W.name + W.brand + W.unit + W.begin + months.length * 3 * W.month + W.end;
    tbl.style.width = totalW + 'px';
  }
}

/* ================================================================
 * 导出 Excel（矩阵平铺）
 * ================================================================ */
function _msExportExcel() {
  if (_msDetailData.length === 0) {
    showToast('当前没有可导出的数据', 'warning');
    return;
  }

  const catFilter = document.getElementById('ms-filter-category')?.value || '';
  let data = _msDetailData.slice();
  if (catFilter) data = data.filter(it => it.category === catFilter);
  data.sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));

  const months = _msSelectedMonths;
  const header = ['物品编号', '物品名称', '品类', '品牌', '型号', '单位', '期初库存'];
  months.forEach(mk => {
    const label = mk.replace('-', '年') + '月';
    header.push(label + '入库', label + '出库', label + '其他变动');
  });
  header.push('期末库存');

  const rows = data.map(it => {
    const r = [it.code, it.name, it.category, it.brand, it.model, it.unit, it.beginStock];
    months.forEach(mk => {
      const m = it.monthly[mk] || { in: 0, out: 0, np: 0, loss: 0, adj: 0 };
      r.push(m.in, m.out, m.np - m.loss + m.adj);
    });
    r.push(it.endStock);
    return r;
  });

  // 合计行
  const total = ['合计', '', '', '', '', '', data.reduce((s, d) => s + d.beginStock, 0)];
  months.forEach(mk => {
    let ti = 0, to = 0, tn = 0, tl = 0, ta = 0;
    data.forEach(d => { const m = d.monthly[mk]; if (m) { ti += m.in; to += m.out; tn += m.np; tl += m.loss; ta += m.adj; } });
    total.push(ti, to, tn - tl + ta);
  });
  total.push(data.reduce((s, d) => s + d.endStock, 0));

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, total]);
    ws['!cols'] = header.map(h => ({ wch: Math.max(h.length * 2, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, '出入库明细');
    const rangeStart = _msMonthStart(months[0]).replace(/-/g, '');
    const rangeEnd = _msMonthEnd(months[months.length - 1]).replace(/-/g, '');
    XLSX.writeFile(wb, `出入库明细_${rangeStart}_${rangeEnd}.xlsx`);
  } else {
    showToast('导出组件未加载，请检查网络连接', 'error');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initMonthlySummary, loadMonthlySummary };
}
