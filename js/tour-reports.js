/**
 * 团期使用报表模块
 * 按团期维度统计消耗情况、成本、超额及报损分析
 * 数据来源：localStorage stockOutRecords + requisitions + purchaseOrders + inventory
 */

let _tourPeriodChart = null;
let _scenarioChart = null;
let _categoryCompareChart = null;
let _rptFilteredData = []; // 缓存当前筛选结果

/**
 * 根据物品名称查找最近采购单价
 */
function _rptLookupPrice(itemName) {
  try {
    const poData = (_appCache && _appCache.purchaseOrders) ? _appCache.purchaseOrders : [];
    let latestPrice = 0;
    let latestDate = '';
    poData.forEach(po => {
      if (po.items) {
        po.items.forEach(it => {
          if (it.name === itemName && it.price) {
            const poDate = po.order_date || po.created_at || '';
            if (!latestDate || poDate >= latestDate) {
              latestPrice = it.price;
              latestDate = poDate;
            }
          }
        });
      }
    });
    return latestPrice;
  } catch (e) {
    return 0;
  }
}

/**
 * 批量构建价格映射表
 */
function _rptBuildPriceMap() {
  const priceMap = {};
  try {
    const poData = (_appCache && _appCache.purchaseOrders) ? _appCache.purchaseOrders : [];
    poData.forEach(po => {
      if (po.items) {
        po.items.forEach(it => {
          if (it.name && it.price) {
            const poDate = po.order_date || po.created_at || '';
            if (!priceMap[it.name] || poDate >= (priceMap[it.name].date || '')) {
              priceMap[it.name] = { price: it.price, date: poDate };
            }
          }
        });
      }
    });
  } catch (e) { /* ignore */ }
  return priceMap;
}

/**
 * 初始化报表模块（在 loadModuleData 中由 navigation.js 调用 loadReports）
 */
function initTourReports() {
  const monthInput = document.getElementById('report-month');
  if (monthInput) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthInput.addEventListener('change', loadReports);
  }

  const scenarioFilter = document.getElementById('report-scenario-filter');
  if (scenarioFilter) {
    scenarioFilter.addEventListener('change', loadReports);
  }

  const exportBtn = document.getElementById('export-report-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportTourReport);
  }
}

/**
 * 加载团期报表（由 navigation.js 的 loadModuleData 调用）
 */
function loadReports() {
  const monthInput = document.getElementById('report-month');
  const scenarioFilter = document.getElementById('report-scenario-filter');
  if (!monthInput || !monthInput.value) return;

  const [year, month] = monthInput.value.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const filterScenario = scenarioFilter ? scenarioFilter.value : '';

  // 读取出库记录
  const stockOutRecords = (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
  // 读取领用单（含待出库）
  const requisitions = (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];

  // 筛选指定月份的出库记录
  const filteredSO = stockOutRecords.filter(r => {
    const d = new Date(r.stockout_date || r.created_at);
    return d >= startDate && d <= endDate;
  });

  // 筛选指定月份的领用单（待出库状态）
  const filteredReq = requisitions.filter(r => {
    const d = new Date(r.apply_date || r.created_at);
    return d >= startDate && d <= endDate &&
      r.status !== 'cancelled' && r.status !== 'withdrawn' &&
      r.status !== 'outbound_completed'; // 已出库的不重复计算
  });

  // 场景过滤
  const applyScenarioFilter = (arr) => {
    if (!filterScenario) return arr;
    return arr.filter(r => r.scenario === filterScenario);
  };

  const soFiltered = applyScenarioFilter(filteredSO);
  const reqFiltered = applyScenarioFilter(filteredReq);

  // 构建明细数据：每条记录展开为逐行物品
  const detailRows = [];
  const tourSet = new Set();
  const scenarioSet = new Set();
  let totalOutQty = 0;
  let totalCost = 0;
  const priceMap = _rptBuildPriceMap();

  // 从出库记录取数据
  soFiltered.forEach(so => {
    const scenario = _rptNormalizeScenario(so.scenario);
    tourSet.add(so.tour_name || '未知团期');
    scenarioSet.add(scenario);
    if (so.items) {
      so.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = (priceMap[it.name] ? priceMap[it.name].price : 0);
        const cost = qty * unitPrice;
        totalOutQty += qty;
        totalCost += cost;
        detailRows.push({
          tour_date: so.tour_date || '',
          tour_name: so.tour_name || '未知团期',
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: it.category || '-',
          unit: it.unit || '',
          quantity: qty,
          unit_price: unitPrice,
          cost: cost,
          source: '出库记录',
          source_code: so.code || ''
        });
      });
    }
  });

  // 从待出库领用单取数据
  reqFiltered.forEach(req => {
    const scenario = _rptNormalizeScenario(req.scenario);
    tourSet.add(req.tour_name || '未知团期');
    scenarioSet.add(scenario);
    if (req.items) {
      req.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = (priceMap[it.name] ? priceMap[it.name].price : 0);
        const cost = qty * unitPrice;
        totalOutQty += qty;
        totalCost += cost;
        detailRows.push({
          tour_date: req.tour_date || '',
          tour_name: req.tour_name || '未知团期',
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: it.category || '-',
          unit: it.unit || '',
          quantity: qty,
          unit_price: unitPrice,
          cost: cost,
          source: '待出库领用单',
          source_code: req.code || ''
        });
      });
    }
  });

  // 检查超额领用 + 计算损失
  const overLimitRows = [];
  let totalOverLimitLoss = 0;
  if (typeof getConsumptionStandard === 'function') {
    // 按团期+场景+物品聚合
    const aggMap = {};
    detailRows.forEach(row => {
      const key = `${row.tour_name}|${row.scenario}|${row.item_name}`;
      if (!aggMap[key]) {
        aggMap[key] = { ...row, totalQty: 0 };
      }
      aggMap[key].totalQty += row.quantity;
    });

    Object.values(aggMap).forEach(agg => {
      const std = getConsumptionStandard(agg.item_name, agg.scenario);
      if (std && agg.totalQty > std.max_per_tour) {
        const excess = agg.totalQty - std.max_per_tour;
        const excessCost = excess * (agg.unit_price || 0);
        totalOverLimitLoss += excessCost;
        overLimitRows.push({
          tour_name: agg.tour_name,
          scenario: agg.scenario,
          item_name: agg.item_name,
          actual: agg.totalQty,
          standard: std.max_per_tour,
          excess: excess,
          unit_price: agg.unit_price || 0,
          loss: excessCost
        });
      }
    });
  }

  // 缓存数据
  _rptFilteredData = { detailRows, overLimitRows, tourSet, scenarioSet, totalOutQty, totalCost, totalOverLimitLoss };

  // 更新 KPI
  _rptUpdateKPI(tourSet.size, totalOutQty, totalCost, overLimitRows.length, totalOverLimitLoss, scenarioSet.size);

  // 渲染图表
  _rptRenderTourPeriodChart(detailRows, tourSet);
  _rptRenderScenarioChart(detailRows, scenarioSet);
  _rptRenderCategoryCompareChart(detailRows);

  // 渲染明细表
  _rptRenderDetailTable(detailRows);

  // 渲染超额汇总
  _rptRenderOverLimitTable(overLimitRows);
}

// ============== KPI 更新 ==============

function _rptUpdateKPI(tourCount, totalOut, totalCost, overLimitCount, overLimitLoss, scenarioCount) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('rpt-kpi-tour-count', tourCount);
  set('rpt-kpi-total-out', totalOut);
  set('rpt-kpi-total-cost', '¥' + totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  set('rpt-kpi-overlimit-count', overLimitCount);
  set('rpt-kpi-overlimit-loss', '¥' + overLimitLoss.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  set('rpt-kpi-scenario-count', scenarioCount);
}

// ============== 团期出库趋势图 ==============

function _rptRenderTourPeriodChart(detailRows, tourSet) {
  const ctx = document.getElementById('tour-period-chart');
  if (!ctx) return;

  if (_tourPeriodChart) _tourPeriodChart.destroy();

  // 按团期聚合出库量
  const tourMap = {};
  detailRows.forEach(row => {
    const key = `${row.tour_date} ${row.tour_name}`;
    if (!tourMap[key]) tourMap[key] = 0;
    tourMap[key] += row.quantity;
  });

  const labels = Object.keys(tourMap).sort();
  const data = labels.map(l => tourMap[l]);

  _tourPeriodChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => l.length > 15 ? l.slice(0, 15) + '...' : l),
      datasets: [{
        label: '出库量',
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => labels[items[0].dataIndex]
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: '数量' } }
      }
    }
  });
}

// ============== 场景消耗占比图 ==============

function _rptRenderScenarioChart(detailRows, scenarioSet) {
  const ctx = document.getElementById('scenario-chart');
  if (!ctx) return;

  if (_scenarioChart) _scenarioChart.destroy();

  const scenarioMap = {};
  detailRows.forEach(row => {
    const s = row.scenario || '未知';
    if (!scenarioMap[s]) scenarioMap[s] = 0;
    scenarioMap[s] += row.quantity;
  });

  const labels = Object.keys(scenarioMap);
  const data = labels.map(l => scenarioMap[l]);

  const colors = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)'
  ];

  _scenarioChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

// ============== 品类对比图表 ==============

function _rptRenderCategoryCompareChart(detailRows) {
  const ctx = document.getElementById('category-compare-chart');
  if (!ctx) return;

  if (_categoryCompareChart) _categoryCompareChart.destroy();

  // 按团期 × 品类聚合成本
  const tourCatMap = {};
  const allCategories = new Set();
  detailRows.forEach(row => {
    const tourKey = `${row.tour_date} ${row.tour_name}`;
    if (!tourCatMap[tourKey]) tourCatMap[tourKey] = {};
    const cat = row.category || '未分类';
    allCategories.add(cat);
    tourCatMap[tourKey][cat] = (tourCatMap[tourKey][cat] || 0) + (row.cost || row.quantity || 0);
  });

  const tours = Object.keys(tourCatMap).sort();
  const cats = [...allCategories].sort();
  const catColors = [
    'rgba(99, 102, 241, 0.7)', 'rgba(239, 68, 68, 0.7)',
    'rgba(16, 185, 129, 0.7)', 'rgba(245, 158, 11, 0.7)',
    'rgba(168, 85, 247, 0.7)', 'rgba(59, 130, 246, 0.7)'
  ];

  const datasets = cats.map((cat, i) => ({
    label: cat,
    data: tours.map(t => tourCatMap[t][cat] || 0),
    backgroundColor: catColors[i % catColors.length],
    borderRadius: 3
  }));

  _categoryCompareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tours.map(l => l.length > 12 ? l.slice(0, 12) + '..' : l),
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: '数量/成本' } }
      }
    }
  });
}

// ============== 明细表格 ==============

function _rptRenderDetailTable(detailRows) {
  const tbody = document.getElementById('report-tbody');
  if (!tbody) return;

  if (detailRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">该月份暂无出库数据</td></tr>';
    return;
  }

  // 加载领用标准用于比对
  const standards = (_appCache && _appCache.consumptionStandards) ? _appCache.consumptionStandards : [];

  // 按团期+场景+物品聚合
  const aggMap = {};
  detailRows.forEach(row => {
    const key = `${row.tour_date}|${row.tour_name}|${row.scenario}|${row.item_name}`;
    if (!aggMap[key]) {
      aggMap[key] = {
        tour_date: row.tour_date,
        tour_name: row.tour_name,
        scenario: row.scenario,
        item_name: row.item_name,
        category: row.category,
        totalQty: 0,
        totalCost: 0,
        unit: row.unit,
        unit_price: row.unit_price || 0
      };
    }
    aggMap[key].totalQty += row.quantity;
    aggMap[key].totalCost += (row.cost || 0);
  });

  const rows = Object.values(aggMap).sort((a, b) => {
    if (a.tour_date !== b.tour_date) return a.tour_date.localeCompare(b.tour_date);
    if (a.tour_name !== b.tour_name) return a.tour_name.localeCompare(b.tour_name);
    return a.scenario.localeCompare(b.scenario);
  });

  tbody.innerHTML = rows.map(row => {
    // 查找领用标准
    const std = standards.find(s => s.item_name === row.item_name && (s.scenario === row.scenario || s.scenario === '通用'));
    const stdText = std ? `${std.max_per_tour} / 团期` : '-';
    const isOverLimit = std && row.totalQty > std.max_per_tour;
    const statusBadge = isOverLimit
      ? `<span style="background:#fde8e8;color:#e53935;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">超额领用</span>`
      : (std ? `<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;">正常</span>` : '-');
    const rowStyle = isOverLimit ? ' style="background:#fff8f0;"' : '';
    const costText = row.totalCost > 0 ? ('¥' + row.totalCost.toFixed(2)) : '-';

    return `
      <tr${rowStyle}>
        <td>${row.tour_date}</td>
        <td style="font-weight:600;">${_rptEscapeHtml(row.tour_name)}</td>
        <td><span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;">${_rptEscapeHtml(row.scenario)}</span></td>
        <td style="font-weight:600;">${_rptEscapeHtml(row.item_name)}</td>
        <td>${_rptEscapeHtml(row.category)}</td>
        <td style="font-weight:700;${isOverLimit ? 'color:var(--danger);' : ''}">${row.totalQty} ${_rptEscapeHtml(row.unit)}</td>
        <td>${costText}</td>
        <td>${stdText}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// ============== 超额汇总表 ==============

function _rptRenderOverLimitTable(overLimitRows) {
  const container = document.getElementById('report-overlimit-summary');
  const tbody = document.getElementById('report-overlimit-tbody');
  if (!container || !tbody) return;

  if (overLimitRows.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  tbody.innerHTML = overLimitRows.map(row => `
    <tr style="background:#fff8f0;">
      <td style="font-weight:600;">${_rptEscapeHtml(row.tour_name)}</td>
      <td><span style="background:#fce4ec;color:#c62828;padding:2px 8px;border-radius:10px;font-size:11px;">${_rptEscapeHtml(row.scenario)}</span></td>
      <td style="font-weight:600;">${_rptEscapeHtml(row.item_name)}</td>
      <td style="font-weight:700;color:var(--danger);">${row.actual}</td>
      <td>${row.standard}</td>
      <td style="font-weight:700;color:var(--danger);">+${row.excess}</td>
      <td style="font-weight:600;">¥${(row.unit_price || 0).toFixed(2)}</td>
      <td style="font-weight:700;color:var(--danger);">¥${(row.loss || 0).toFixed(2)}</td>
    </tr>
  `).join('');
}

// ============== 导出 Excel ==============

function exportTourReport() {
  if (!_rptFilteredData || !_rptFilteredData.detailRows || _rptFilteredData.detailRows.length === 0) {
    if (typeof showToast === 'function') showToast('暂无数据可导出', 'warning');
    return;
  }

  const { detailRows, overLimitRows, totalCost, totalOverLimitLoss } = _rptFilteredData;

  // 按团期+场景+物品聚合
  const aggMap = {};
  detailRows.forEach(row => {
    const key = `${row.tour_date}|${row.tour_name}|${row.scenario}|${row.item_name}`;
    if (!aggMap[key]) {
      aggMap[key] = { ...row, totalQty: 0, totalCost: 0 };
    }
    aggMap[key].totalQty += row.quantity;
    aggMap[key].totalCost += (row.cost || 0);
  });

  const standards = (_appCache && _appCache.consumptionStandards) ? _appCache.consumptionStandards : [];
  const rows = Object.values(aggMap).sort((a, b) => a.tour_date.localeCompare(b.tour_date));

  const header = ['团期日期', '团期名称', '使用场景', '物品名称', '类别', '出库数量', '单位', '单价', '成本', '领用标准', '状态'];
  const data = [header];

  rows.forEach(row => {
    const std = standards.find(s => s.item_name === row.item_name && (s.scenario === row.scenario || s.scenario === '通用'));
    const isOver = std && row.totalQty > std.max_per_tour;
    data.push([
      row.tour_date,
      row.tour_name,
      row.scenario,
      row.item_name,
      row.category,
      row.totalQty,
      row.unit,
      row.unit_price || '',
      row.totalCost ? row.totalCost.toFixed(2) : '',
      std ? std.max_per_tour : '',
      isOver ? `超额（超${row.totalQty - std.max_per_tour}）` : (std ? '正常' : '')
    ]);
  });

  // 汇总行
  data.push([]);
  data.push(['', '', '', '', '合计', '', '', '', (totalCost || 0).toFixed(2), '', '']);

  // 超额汇总 sheet
  const overHeader = ['团期', '场景', '物品名称', '实际领用', '标准上限', '超出数量', '单价', '损失金额'];
  const overData = [overHeader];
  overLimitRows.forEach(row => {
    overData.push([row.tour_name, row.scenario, row.item_name, row.actual, row.standard, row.excess,
      (row.unit_price || 0).toFixed(2), (row.loss || 0).toFixed(2)]);
  });
  if (overLimitRows.length > 0) {
    overData.push([]);
    overData.push(['', '', '', '', '', '', '损失合计', (totalOverLimitLoss || 0).toFixed(2)]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws1, '团期出库明细');

  if (overLimitRows.length > 0) {
    const ws2 = XLSX.utils.aoa_to_sheet(overData);
    XLSX.utils.book_append_sheet(wb, ws2, '超额领用汇总');
  }

  const monthInput = document.getElementById('report-month');
  const monthVal = monthInput ? monthInput.value : 'report';
  XLSX.writeFile(wb, `团期使用报表_${monthVal}.xlsx`);

  if (typeof showToast === 'function') showToast('报表已导出', 'success');
}

// ============== 工具函数 ==============

function _rptEscapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 场景名称标准化（兼容旧数据）
 */
function _rptNormalizeScenario(s) {
  if (!s) return '其他';
  if (s === '餐车') return '列车餐车';
  if (s === '客房') return '列车客房';
  return s;
}
