/**
 * 月度出入库数据汇总模块
 * 参考 SAP MM / 用友 U8 / 金蝶 K3 的通用做法
 * 三层结构：KPI 卡片 → 趋势图表 → 品类→物品明细报表
 */

// Chart 实例
let _msInoutChart = null;
let _msCategoryChart = null;
let _msTrendChart = null;

// 当前筛选范围
let _msStartDate = null;
let _msEndDate = null;

/**
 * 初始化月度汇总模块
 */
function initMonthlySummary() {
  // 快捷按钮
  const btnThisMonth = document.getElementById('ms-btn-this-month');
  const btnLastMonth = document.getElementById('ms-btn-last-month');
  const btnThisQuarter = document.getElementById('ms-btn-this-quarter');
  const btnThisYear = document.getElementById('ms-btn-this-year');

  if (btnThisMonth) btnThisMonth.addEventListener('click', () => _msSetQuickRange('thisMonth'));
  if (btnLastMonth) btnLastMonth.addEventListener('click', () => _msSetQuickRange('lastMonth'));
  if (btnThisQuarter) btnThisQuarter.addEventListener('click', () => _msSetQuickRange('thisQuarter'));
  if (btnThisYear) btnThisYear.addEventListener('click', () => _msSetQuickRange('thisYear'));

  // 月份选择器
  const monthPicker = document.getElementById('ms-month-picker');
  if (monthPicker) {
    monthPicker.addEventListener('change', () => {
      const val = monthPicker.value; // format: YYYY-MM
      if (val) {
        const [y, m] = val.split('-').map(Number);
        _msStartDate = new Date(y, m - 1, 1);
        _msEndDate = new Date(y, m, 0); // last day of month
        _msHighlightQuickBtn(null);
        loadMonthlySummary();
      }
    });
  }

  // 自定义日期范围
  const startInput = document.getElementById('ms-date-start');
  const endInput = document.getElementById('ms-date-end');
  if (startInput) startInput.addEventListener('change', _msOnCustomRangeChange);
  if (endInput) endInput.addEventListener('change', _msOnCustomRangeChange);

  // 品类筛选（明细报表）
  const catFilter = document.getElementById('ms-filter-category');
  if (catFilter) catFilter.addEventListener('change', () => _msRenderDetailTable());

  // 导出按钮
  const exportBtn = document.getElementById('ms-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', _msExportExcel);

  // 默认本月
  _msSetQuickRange('thisMonth');
}

/**
 * 设置快捷时间范围
 */
function _msSetQuickRange(type) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (type) {
    case 'thisMonth':
      _msStartDate = new Date(y, m, 1);
      _msEndDate = new Date(y, m + 1, 0);
      break;
    case 'lastMonth':
      _msStartDate = new Date(y, m - 1, 1);
      _msEndDate = new Date(y, m, 0);
      break;
    case 'thisQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      _msStartDate = new Date(y, qStart, 1);
      _msEndDate = new Date(y, qStart + 3, 0);
      break;
    }
    case 'thisYear':
      _msStartDate = new Date(y, 0, 1);
      _msEndDate = new Date(y, 11, 31);
      break;
  }

  // 同步月份选择器
  const monthPicker = document.getElementById('ms-month-picker');
  if (monthPicker && (type === 'thisMonth' || type === 'lastMonth')) {
    monthPicker.value = `${_msStartDate.getFullYear()}-${String(_msStartDate.getMonth() + 1).padStart(2, '0')}`;
  }

  // 同步自定义日期输入框
  const startInput = document.getElementById('ms-date-start');
  const endInput = document.getElementById('ms-date-end');
  if (startInput) startInput.value = _msFormatDate(_msStartDate);
  if (endInput) endInput.value = _msFormatDate(_msEndDate);

  _msHighlightQuickBtn(type);
  loadMonthlySummary();
}

function _msOnCustomRangeChange() {
  const startVal = document.getElementById('ms-date-start')?.value;
  const endVal = document.getElementById('ms-date-end')?.value;
  if (startVal && endVal) {
    _msStartDate = new Date(startVal + 'T00:00:00');
    _msEndDate = new Date(endVal + 'T00:00:00');
    _msHighlightQuickBtn(null);
    loadMonthlySummary();
  }
}

function _msHighlightQuickBtn(type) {
  ['ms-btn-this-month', 'ms-btn-last-month', 'ms-btn-this-quarter', 'ms-btn-this-year'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });
  if (type) {
    const map = { thisMonth: 'ms-btn-this-month', lastMonth: 'ms-btn-last-month', thisQuarter: 'ms-btn-this-quarter', thisYear: 'ms-btn-this-year' };
    const btn = document.getElementById(map[type]);
    if (btn) btn.classList.add('active');
  }
}

function _msFormatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ============== 数据读取 ==============

function _msReadInventory() {
  return (_appCache && _appCache.inventory) ? _appCache.inventory : [];
}

function _msReadStockInRecords() {
  return (_appCache && _appCache.stockInRecords) ? _appCache.stockInRecords : [];
}

function _msReadStockOutRecords() {
  return (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
}

function _msReadRequisitions() {
  return (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];
}

// ============== 主加载函数 ==============

function loadMonthlySummary() {
  if (!_msStartDate || !_msEndDate) return;

  const inventory = _msReadInventory();
  const stockInRecords = _msReadStockInRecords();
  const stockOutRecords = _msReadStockOutRecords();
  const requisitions = _msReadRequisitions();

  // 筛选范围内的入库
  const filteredIn = stockInRecords.filter(r => {
    const d = new Date(r.stockin_date || r.created_at || r.confirmed_at);
    return d >= _msStartDate && d <= _msEndDate;
  });

  // 筛选范围内的出库
  const filteredOut = stockOutRecords.filter(r => {
    const d = new Date(r.stockout_date || r.created_at || r.confirmed_at);
    return d >= _msStartDate && d <= _msEndDate;
  });

  // 本期入库合计
  const totalInQty = filteredIn.reduce((s, r) => s + (r.total_quantity || 0), 0);
  // 本期出库合计
  const totalOutQty = filteredOut.reduce((s, r) => s + (r.total_quantity || 0), 0);

  // 当前库存（期末近似）
  const currentTotalStock = inventory.reduce((s, it) => s + (it.stock || 0), 0);
  // 期初库存 = 期末 + 出库 - 入库
  const beginTotalStock = currentTotalStock + totalOutQty - totalInQty;

  // 低库存物品
  const lowStockCount = inventory.filter(it => it.stock < (it.safety_stock || 10)).length;

  // 周转率 = 出库 / 平均库存（简化计算）
  const avgStock = (beginTotalStock + currentTotalStock) / 2 || 1;
  const turnoverRate = ((totalOutQty / avgStock) * 100).toFixed(1);

  // 更新 KPI 卡片
  _msUpdateKPI({
    beginItems: inventory.length,
    beginStock: Math.max(0, Math.round(beginTotalStock)),
    inCount: filteredIn.length,
    inQty: totalInQty,
    outCount: filteredOut.length,
    outQty: totalOutQty,
    endItems: inventory.length,
    endStock: currentTotalStock,
    turnoverRate: turnoverRate,
    lowStockCount: lowStockCount
  });

  // 更新日期范围显示
  const rangeLabel = document.getElementById('ms-range-label');
  if (rangeLabel) {
    rangeLabel.textContent = `${_msFormatDate(_msStartDate)} ~ ${_msFormatDate(_msEndDate)}`;
  }

  // 渲染图表
  _msRenderInoutChart(filteredIn, filteredOut);
  _msRenderCategoryChart(filteredOut, inventory);
  _msRenderTrendBarChart(stockOutRecords);

  // 渲染明细报表
  _msBuildDetailData(inventory, filteredIn, filteredOut);
  _msRenderDetailTable();
}

// ============== KPI 卡片 ==============

function _msUpdateKPI(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('ms-kpi-begin-items', data.beginItems);
  set('ms-kpi-begin-stock', data.beginStock);
  set('ms-kpi-in-count', data.inCount);
  set('ms-kpi-in-qty', data.inQty);
  set('ms-kpi-out-count', data.outCount);
  set('ms-kpi-out-qty', data.outQty);
  set('ms-kpi-end-items', data.endItems);
  set('ms-kpi-end-stock', data.endStock);
  set('ms-kpi-turnover', data.turnoverRate + '%');
  set('ms-kpi-low-stock', data.lowStockCount);
}

// ============== 出入库趋势折线图 ==============

function _msRenderInoutChart(filteredIn, filteredOut) {
  const ctx = document.getElementById('ms-inout-chart');
  if (!ctx) return;

  if (_msInoutChart) _msInoutChart.destroy();

  // 按天聚合
  const days = _msGetDaysBetween(_msStartDate, _msEndDate);
  const inByDay = {};
  const outByDay = {};
  days.forEach(d => { inByDay[d] = 0; outByDay[d] = 0; });

  filteredIn.forEach(r => {
    const key = (r.stockin_date || (r.confirmed_at ? r.confirmed_at.slice(0, 10) : ''));
    if (key && inByDay[key] !== undefined) inByDay[key] += (r.total_quantity || 0);
  });
  filteredOut.forEach(r => {
    const key = (r.stockout_date || (r.confirmed_at ? r.confirmed_at.slice(0, 10) : ''));
    if (key && outByDay[key] !== undefined) outByDay[key] += (r.total_quantity || 0);
  });

  const labels = days.map(d => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; });

  _msInoutChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '入库',
          data: days.map(d => inByDay[d]),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(90,158,111,0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: days.length > 60 ? 0 : 3
        },
        {
          label: '出库',
          data: days.map(d => outByDay[d]),
          borderColor: '#e7000b',
          backgroundColor: 'rgba(207,92,92,0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: days.length > 60 ? 0 : 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#5c5060' } },
        tooltip: {
          callbacks: {
            title: (items) => days[items[0].dataIndex] || ''
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(168,158,169,0.2)' }, ticks: { color: '#a89ea9', maxTicksLimit: 15 } },
        y: { beginAtZero: true, grid: { color: 'rgba(168,158,169,0.2)' }, ticks: { color: '#a89ea9' } }
      }
    }
  });
}

// ============== 品类出库占比饼图 ==============

function _msRenderCategoryChart(filteredOut, inventory) {
  const ctx = document.getElementById('ms-category-chart');
  if (!ctx) return;

  if (_msCategoryChart) _msCategoryChart.destroy();

  // 统计出库物品按品类汇总
  const catMap = {};
  filteredOut.forEach(r => {
    if (r.items) {
      r.items.forEach(it => {
        const cat = it.category || '未分类';
        catMap[cat] = (catMap[cat] || 0) + it.quantity;
      });
    }
  });

  const catLabels = Object.keys(catMap);
  const catValues = Object.values(catMap);

  if (catLabels.length === 0) {
    // 无数据时显示提示
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    _msCategoryChart = null;
    return;
  }

  const colors = ['#ec003f', '#ff2056', '#c70036', '#ffa1ad', '#16a34a', '#d97706', '#7c3aed', '#0284c7'];

  _msCategoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catValues,
        backgroundColor: colors.slice(0, catLabels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#5c5060', padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return `${ctx.label}: ${ctx.parsed} 件 (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ============== 月度环比柱状图 ==============

function _msRenderTrendBarChart(allStockOutRecords) {
  const ctx = document.getElementById('ms-trend-chart');
  if (!ctx) return;

  if (_msTrendChart) _msTrendChart.destroy();

  // 取近6个月的出库总量
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  const monthLabels = months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`);
  const monthQty = months.map(m => {
    return allStockOutRecords
      .filter(r => {
        const d = new Date(r.stockout_date || r.created_at || r.confirmed_at);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((s, r) => s + (r.total_quantity || 0), 0);
  });

  _msTrendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: '出库总量',
        data: monthQty,
        backgroundColor: monthQty.map((_, i) => i === monthQty.length - 1 ? '#ec003f' : '#ffa1ad'),
        borderRadius: 6,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `出库 ${ctx.parsed.y} 件`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#a89ea9' } },
        y: { beginAtZero: true, grid: { color: 'rgba(168,158,169,0.2)' }, ticks: { color: '#a89ea9' } }
      }
    }
  });
}

// ============== 明细报表数据构建 ==============

let _msDetailData = [];

function _msBuildDetailData(inventory, filteredIn, filteredOut) {
  // 构建每个物品的期初/入库/出库/期末
  const itemMap = {};

  inventory.forEach(it => {
    itemMap[String(it.id)] = {
      id: String(it.id),
      code: it.code || '-',
      name: it.name,
      category: it.category || '未分类',
      brand: it.brand || '-',
      model: it.model || '-',
      unit: it.unit,
      endStock: it.stock || 0,
      inQty: 0,
      outQty: 0
    };
  });

  // 入库
  filteredIn.forEach(r => {
    if (r.items) {
      r.items.forEach(it => {
        const key = String(it.item_id || it.inventory_id);
        if (itemMap[key]) {
          itemMap[key].inQty += it.quantity;
        }
      });
    }
  });

  // 出库
  filteredOut.forEach(r => {
    if (r.items) {
      r.items.forEach(it => {
        const key = String(it.item_id || it.inventory_id);
        if (itemMap[key]) {
          itemMap[key].outQty += it.quantity;
        }
      });
    }
  });

  // 计算期初 = 期末 + 出库 - 入库
  Object.values(itemMap).forEach(it => {
    it.beginStock = Math.max(0, it.endStock + it.outQty - it.inQty);
    it.change = it.beginStock > 0
      ? (((it.endStock - it.beginStock) / it.beginStock) * 100).toFixed(1)
      : (it.endStock > 0 ? '100.0' : '0.0');
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

function _msRenderDetailTable() {
  const tbody = document.getElementById('ms-detail-tbody');
  if (!tbody) return;

  const catFilter = document.getElementById('ms-filter-category')?.value || '';
  let data = _msDetailData.slice();
  if (catFilter) data = data.filter(it => it.category === catFilter);

  // 按分类排序
  data.sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无数据</td></tr>';
    return;
  }

  // 按品类分组渲染
  let html = '';
  let lastCat = '';

  data.forEach(it => {
    if (it.category !== lastCat) {
      lastCat = it.category;
      // 品类小计行
      const catItems = data.filter(d => d.category === it.category);
      const catBegin = catItems.reduce((s, d) => s + d.beginStock, 0);
      const catIn = catItems.reduce((s, d) => s + d.inQty, 0);
      const catOut = catItems.reduce((s, d) => s + d.outQty, 0);
      const catEnd = catItems.reduce((s, d) => s + d.endStock, 0);

      html += `
        <tr class="ms-category-row">
          <td colspan="3" style="font-weight:700;color:var(--accent);">
            <span style="margin-right:6px;">📁</span>${it.category}
            <span style="font-weight:400;font-size:12px;color:var(--text-muted);margin-left:8px;">(${catItems.length} 种物品)</span>
          </td>
          <td style="font-weight:600;">${catBegin}</td>
          <td style="font-weight:600;color:var(--success);">${catIn > 0 ? '+' + catIn : '0'}</td>
          <td style="font-weight:600;color:var(--warning);">${catOut > 0 ? '-' + catOut : '0'}</td>
          <td style="font-weight:600;">${catEnd}</td>
          <td></td>
          <td></td>
        </tr>`;
    }

    const changeNum = parseFloat(it.change);
    const changeColor = changeNum > 0 ? 'var(--success)' : (changeNum < 0 ? 'var(--danger)' : 'var(--text-muted)');
    const changeText = changeNum > 0 ? '+' + it.change + '%' : (changeNum < 0 ? it.change + '%' : '-');

    html += `
      <tr>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${it.code}</td>
        <td style="font-weight:600;">${it.name}</td>
        <td>${it.brand}${it.model !== '-' ? ' / ' + it.model : ''}</td>
        <td>${it.beginStock}</td>
        <td style="color:var(--success);">${it.inQty > 0 ? '+' + it.inQty : '-'}</td>
        <td style="color:var(--warning);">${it.outQty > 0 ? '-' + it.outQty : '-'}</td>
        <td style="font-weight:600;">${it.endStock}</td>
        <td>${it.unit}</td>
        <td style="color:${changeColor};font-weight:600;">${changeText}</td>
      </tr>`;
  });

  // 合计行
  const totalBegin = data.reduce((s, d) => s + d.beginStock, 0);
  const totalIn = data.reduce((s, d) => s + d.inQty, 0);
  const totalOut = data.reduce((s, d) => s + d.outQty, 0);
  const totalEnd = data.reduce((s, d) => s + d.endStock, 0);

  html += `
    <tr class="ms-total-row">
      <td colspan="3" style="font-weight:700;">合计</td>
      <td style="font-weight:700;">${totalBegin}</td>
      <td style="font-weight:700;color:var(--success);">${totalIn > 0 ? '+' + totalIn : '0'}</td>
      <td style="font-weight:700;color:var(--warning);">${totalOut > 0 ? '-' + totalOut : '0'}</td>
      <td style="font-weight:700;">${totalEnd}</td>
      <td></td>
      <td></td>
    </tr>`;

  tbody.innerHTML = html;
}

// ============== 工具函数 ==============

function _msGetDaysBetween(start, end) {
  const days = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(_msFormatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ============== 导出 Excel ==============

function _msExportExcel() {
  if (_msDetailData.length === 0) {
    showToast('当前没有可导出的数据', 'warning');
    return;
  }

  const catFilter = document.getElementById('ms-filter-category')?.value || '';
  let data = _msDetailData.slice();
  if (catFilter) data = data.filter(it => it.category === catFilter);

  // 构建工作表数据
  const header = ['物品编号', '物品名称', '品类', '品牌', '型号', '期初库存', '本期入库', '本期出库', '期末库存', '单位', '变动率'];
  const rows = data.map(it => {
    const changeNum = parseFloat(it.change);
    const changeText = changeNum > 0 ? '+' + it.change + '%' : (changeNum !== 0 ? it.change + '%' : '-');
    return [it.code, it.name, it.category, it.brand, it.model, it.beginStock, it.inQty, it.outQty, it.endStock, it.unit, changeText];
  });

  const wsData = [header, ...rows];

  // 使用 SheetJS (xlsx)
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 设置列宽
    ws['!cols'] = header.map(h => ({ wch: Math.max(h.length * 2, 12) }));

    XLSX.utils.book_append_sheet(wb, ws, '月度汇总');
    const filename = `月度出入库汇总_${_msFormatDate(_msStartDate)}_${_msFormatDate(_msEndDate)}.xlsx`;
    XLSX.writeFile(wb, filename);
  } else {
    showToast('导出组件未加载，请检查网络连接', 'error');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initMonthlySummary, loadMonthlySummary };
}
