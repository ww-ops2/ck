/**
 * 团期使用报表模块
 * 按团期维度统计消耗情况、成本、超额及报损分析
 * 数据来源：stockOutRecords + requisitions + purchaseOrders + inventory（均为 Supabase 落库数据）
 * 团期名称为主数据（tour_names 表），报表页可维护，领用单下拉引用
 */

let _rptFilteredData = []; // 缓存当前筛选结果
let _rptSelectedTourName = null; // 当前右侧选中的团期名称

// D-1 版：团期级聚合与交互状态
let _rptAgg = [];           // 团期级成本聚合（排行 + 分析用）
let _rptRankSelIdx = -1;    // 当前排行选中的索引
let _rptAnaMode = 'scene';  // 分析模式：scene | scenario | item
let _rptAnaSc = '';         // 分析②选中的场景
let _rptAnaItem = '';       // 分析③选中的物品
let _rptAnaSegBound = false;// 分析分段按钮是否已绑定
let _rptCloudLoading = false; // 防止云端拉取重入
let _rptCloudDone = false;    // 本次会话是否已做过一次云端拉取（避免每次切换都拉）

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
 * 批量构建价格映射表（勾稽核心）
 * 单价来源优先级：
 *   1) inventory_items.unit_price（用户在「库存」补充信息中维护的权威成本，优先）
 *   2) 采购单 items.price（历史来源，兜底）
 * 按小写物品名匹配，避免大小写/空格差异导致漏配。
 */
function _rptBuildPriceMap() {
  const priceMap = {}; // 小写物品名 -> { price, source }
  const norm = (s) => String(s || '').trim().toLowerCase();

  // 1) 采购单最新单价（历史来源，作为兜底）
  try {
    const poData = (_appCache && _appCache.purchaseOrders) ? _appCache.purchaseOrders : [];
    poData.forEach(po => {
      if (po.items) {
        po.items.forEach(it => {
          if (it.name && it.price) {
            const k = norm(it.name);
            const poDate = po.order_date || po.created_at || '';
            if (!priceMap[k] || (priceMap[k].source !== 'inventory' && poDate >= (priceMap[k].date || ''))) {
              priceMap[k] = { price: it.price, date: poDate, source: 'purchase' };
            }
          }
        });
      }
    });
  } catch (e) { /* ignore */ }

  // 2) 库存物品单价（用户在「库存」中维护的权威成本，优先覆盖）
  try {
    const invData = (_appCache && _appCache.inventory) ? _appCache.inventory : [];
    invData.forEach(inv => {
      const k = norm(inv.name);
      const p = Number(inv.unit_price) || 0;
      if (k && p > 0) {
        priceMap[k] = { price: p, date: '', source: 'inventory' };
      }
    });
  } catch (e) { /* ignore */ }

  return priceMap;
}

/**
 * 按物品名称解析单价（大小写归一化）
 */
function _rptResolvePrice(name, priceMap) {
  const k = String(name || '').trim().toLowerCase();
  const hit = priceMap[k];
  return hit ? (hit.price || 0) : 0;
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

  // 团期名称主数据维护（新增）
  _initTourNameManage();

  // D-1 维度对比分析分段按钮（静态元素，仅绑定一次）
  _rptBindAnaSeg();

  // 右侧详情月份筛选
  const detailMonthFilter = document.getElementById('detail-month-filter');
  if (detailMonthFilter) {
    detailMonthFilter.addEventListener('change', function () {
      if (!_rptSelectedTourName) return;
      _rptRenderTourDetailForMonth(_rptSelectedTourName, this.value);
    });
  }
}

/**
 * 团期名称新增管理：展开内联表单 → 落库 tour_names → 刷新缓存与列表
 */
function _initTourNameManage() {
  const addBtn = document.getElementById('add-tour-btn');
  const form = document.getElementById('add-tour-form');
  const input = document.getElementById('new-tour-name');
  const confirmBtn = document.getElementById('add-tour-confirm');
  const cancelBtn = document.getElementById('add-tour-cancel');
  if (!addBtn || !form || !input) return;

  addBtn.addEventListener('click', function () {
    const open = form.style.display !== 'none';
    form.style.display = open ? 'none' : 'block';
    if (!open) { input.value = ''; input.focus(); }
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      form.style.display = 'none';
      input.value = '';
    });
  }

  if (confirmBtn) {
    const originalText = confirmBtn.textContent || '保存';
    confirmBtn.addEventListener('click', async function () {
      const name = input.value.trim();
      if (!name) {
        if (typeof showToast === 'function') showToast('请输入团期名称', 'warning');
        return;
      }
      // 先置为 loading，给用户即时反馈
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="btn-spinner"></span>保存中…';
      try {
        // 去重校验：直接读库，避免 _appCache 未加载导致漏判；同时做空白/大小写归一化二次校验
        const currentNames = await SupaDB.getTourNames();
        const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const exists = (currentNames || []).some(t => normalize(t.name) === normalize(name));
        if (exists) {
          if (typeof showToast === 'function') showToast('该团期名称已存在，请勿重复添加', 'warning');
          return;
        }
        await SupaDB.createTourName(name);
        await refreshData('tourNames');
        form.style.display = 'none';
        input.value = '';
        if (typeof showToast === 'function') showToast('团期名称「' + name + '」已新增', 'success');
        if (typeof loadReports === 'function') loadReports();
      } catch (e) {
        const msg = String(e.message || e || '');
        // 409/唯一约束冲突 → 明确提示重复
        if (msg.indexOf('409') !== -1 || /unique|duplicate|已经存在|已存在|重复/i.test(msg)) {
          if (typeof showToast === 'function') showToast('该团期名称已存在，请勿重复添加', 'warning');
        } else {
          if (typeof showToast === 'function') showToast('新增失败：' + msg, 'error');
        }
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
      }
    });
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && confirmBtn) confirmBtn.click();
  });
}

/**
 * 加载团期报表（由 navigation.js 的 loadModuleData 调用）
 */
function _rptRender() {
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
        const unitPrice = _rptResolvePrice(it.name, priceMap);
        const cost = qty * unitPrice;
        totalOutQty += qty;
        totalCost += cost;
        detailRows.push({
          kind: 'use',
          tour_date: so.tour_date || '',
          tour_name: so.tour_name || '未知团期',
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: _rptResolveCategory(it),
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
        const unitPrice = _rptResolvePrice(it.name, priceMap);
        const cost = qty * unitPrice;
        totalOutQty += qty;
        totalCost += cost;
        detailRows.push({
          kind: 'use',
          tour_date: req.tour_date || '',
          tour_name: req.tour_name || '未知团期',
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: _rptResolveCategory(it),
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

  // 更新 KPI（出库量与使用成本仅统计领用/出库，不含报损）
  _rptUpdateKPI(tourSet.size, totalOutQty, totalCost, overLimitRows.length, totalOverLimitLoss, scenarioSet.size);

  // 报损统计（顶部统计条 + 导出「报损汇总」sheet）
  _rptLossData = _rptComputeLoss(startDate, endDate);
  _rptRenderLossBlock(_rptLossData);

  // 本月报损明细行（物品级）：用于团期卡片统计与明细表混排
  const lossRows = _rptBuildLossRows('', monthInput.value);

  // 渲染 D-1：成本排行 + 选中团期明细 + 维度对比分析
  _rptAgg = _rptBuildTourAgg(detailRows, lossRows);
  _rptRankSelIdx = -1;
  _rptRenderTourBar();
  const firstIdx = _rptAgg.findIndex(a => (a.useCost > 0 || a.lossAmt > 0));
  if (firstIdx >= 0) _rptSelectTour(firstIdx);
  else _rptRenderAnalysis();
}

/**
 * 报表入口：先以本地缓存即时渲染（首帧不空白），再做一次「仅本模块所需」的
 * 云端拉取覆盖，解决「打开后先空、要等很久才出数据」的问题。
 * 说明：报表此前只依赖 _appCache，而首屏 syncFromSupabase 有 6 秒竞速超时；
 * 若 Supabase 在国内偏慢，模块会在缓存未就绪时打开 → 空白，直到 30 秒自动同步才补。
 * 这里改为与仪表盘一致的「缓存即时渲染 + 云端覆盖」自愈范式，且只拉 7 张表，
 * 远轻于全量 12 张表同步，首屏更快。_rptCloudDone 保证一次会话只拉一次，
 * 之后由自动同步（MODULE_TABLE_PLAN['reports']）保活。
 */
function loadReports() {
  _rptRender();
  _rptEnsureCloud();
}

function _rptEnsureCloud() {
  if (typeof isSupabaseReady !== 'function' || !isSupabaseReady()) return;
  if (_rptCloudLoading || _rptCloudDone) return;
  _rptCloudLoading = true;
  const bar = document.getElementById('rpt-tour-bar');
  if (bar && !_rptAgg.length) bar.innerHTML = '<div class="rpt-rank-empty">数据同步中…</div>';
  Promise.all([
    refreshData('inventory'),
    refreshData('purchaseOrders'),
    refreshData('stockOutRecords'),
    refreshData('requisitions'),
    refreshData('lossRecords'),
    refreshData('tourNames'),
    refreshData('consumptionStandards')
  ]).then(function () {
    _rptCloudDone = true;
    _rptRender();
  }).catch(function (e) {
    console.warn('[Reports] 云端拉取失败，沿用本地缓存：', e && e.message);
    _rptRender();
  }).finally(function () {
    _rptCloudLoading = false;
  });
}

// ============== 报损财务分析 ==============
var _rptLossData = { rows: [], totalQty: 0, totalAmount: 0 };

function _rptComputeLoss(startDate, endDate) {
  const lossRecords = (_appCache && _appCache.lossRecords) ? _appCache.lossRecords : [];
  const map = {};
  let totalQty = 0, totalAmount = 0;
  lossRecords.forEach(function(lr) {
    const d = new Date(lr.created_at);
    if (isNaN(d.getTime())) return;
    if (d < startDate || d > endDate) return;
    const tour = (lr.tour_name || '').trim() || '未关联团期';
    if (!map[tour]) map[tour] = { tour_name: tour, qty: 0, amount: 0 };
    map[tour].qty += (Number(lr.qty) || 0);
    map[tour].amount += (Number(lr.loss_amount) || 0);
    totalQty += (Number(lr.qty) || 0);
    totalAmount += (Number(lr.loss_amount) || 0);
  });
  return { rows: Object.keys(map).map(function(k) { return map[k]; }), totalQty: totalQty, totalAmount: totalAmount };
}

/**
 * 构建物品级报损明细行（与使用明细同构，便于在同一张表混排）
 * @param {string} tourName 团期名称，空字符串表示全部团期
 * @param {string} month    YYYY-MM，空字符串表示不过滤月份
 */
function _rptBuildLossRows(tourName, month) {
  const lossRecords = (_appCache && _appCache.lossRecords) ? _appCache.lossRecords : [];
  const rows = [];
  lossRecords.forEach(function (lr) {
    const display = (lr.tour_name || '').trim() || '未关联团期';
    if (tourName && display !== tourName) return;
    const d = new Date(lr.created_at);
    const dateStr = isNaN(d.getTime())
      ? ''
      : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (month && dateStr.slice(0, 7) !== month) return;
    rows.push({
      kind: 'loss',
      tour_date: dateStr,
      tour_name: display,
      scenario: lr.reason || '报损',
      item_name: lr.name || '',
      item_code: lr.item_code || lr.code || '',
      category: lr.category || '-',
      unit: lr.unit || '',
      quantity: Number(lr.qty) || 0,
      unit_price: Number(lr.unit_price) || 0,
      cost: Number(lr.loss_amount) || 0,
      applicant_name: lr.applicant_name || '',
      source: '异常报损',
      source_code: lr.code || ''
    });
  });
  return rows;
}

function _rptRenderLossBlock(data) {
  const qtyEl = document.getElementById('rpt-kpi-loss-qty');
  const amtEl = document.getElementById('rpt-kpi-loss-amount');
  const tourEl = document.getElementById('rpt-kpi-loss-tours');
  if (qtyEl) qtyEl.textContent = data.totalQty;
  if (amtEl) amtEl.textContent = '¥' + data.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (tourEl) tourEl.textContent = data.rows.length;
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

// ============== 团期列表（左栏：主数据 ∪ 使用数据）+ 选中详情（右栏） ==============

/**
 * 为指定团期构建明细行（来源：全量出库记录 + 待出库领用单）
 * @param {string} tourName 团期名称
 * @param {string} month 格式 YYYY-MM，空字符串表示不过滤月份
 */
function _rptBuildTourDetailRows(tourName, month, scenarioVal) {
  const stockOutRecords = (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
  const requisitions = (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];
  const priceMap = _rptBuildPriceMap();
  const rows = [];

  const matchesMonth = (dateStr) => {
    if (!month) return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}` === month;
  };

  stockOutRecords.forEach(so => {
    if ((so.tour_name || '').trim() !== tourName) return;
    if (!matchesMonth(so.stockout_date || so.created_at)) return;
    const scenario = _rptNormalizeScenario(so.scenario);
    if (scenarioVal && scenarioVal !== scenario) return;
    if (so.items) {
      so.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = _rptResolvePrice(it.name, priceMap);
rows.push({
        kind: 'use',
        tour_date: so.tour_date || '',
        tour_name: tourName,
        scenario: scenario,
        item_name: it.name,
        item_code: it.code || '',
        category: _rptResolveCategory(it),
        unit: it.unit || '',
        quantity: qty,
        unit_price: unitPrice,
        cost: qty * unitPrice,
        source: '出库记录',
        source_code: so.code || ''
      });
      });
    }
  });

  requisitions.forEach(req => {
    if ((req.tour_name || '').trim() !== tourName) return;
    if (req.status === 'cancelled' || req.status === 'withdrawn' || req.status === 'outbound_completed') return;
    if (!matchesMonth(req.apply_date || req.created_at)) return;
    const scenario = _rptNormalizeScenario(req.scenario);
    if (scenarioVal && scenarioVal !== scenario) return;
    if (req.items) {
      req.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = _rptResolvePrice(it.name, priceMap);
rows.push({
        kind: 'use',
        tour_date: req.tour_date || '',
        tour_name: tourName,
        scenario: scenario,
        item_name: it.name,
        item_code: it.code || '',
        category: _rptResolveCategory(it),
        unit: it.unit || '',
        quantity: qty,
        unit_price: unitPrice,
        cost: qty * unitPrice,
        source: '待出库领用单',
        source_code: req.code || ''
      });
      });
    }
  });

  // 并入该团期的报损明细（与使用明细在同一张表混排）
  _rptBuildLossRows(tourName, month).forEach(function (r) { rows.push(r); });

  return rows;
}

/**
 * 渲染右侧详情区的月份筛选下拉
 */
function _rptRenderDetailMonthFilter(tourName) {
  const select = document.getElementById('detail-month-filter');
  if (!select) return;
  const rows = _rptBuildTourDetailRows(tourName, '');
  const months = [...new Set(rows.map(r => {
    const d = new Date(r.tour_date || '');
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }).filter(Boolean))].sort().reverse();

  const globalMonthInput = document.getElementById('report-month');
  const globalMonth = globalMonthInput ? globalMonthInput.value : '';

  let html = '<option value="">当前所选月份</option>';
  months.forEach(m => {
    const label = m === globalMonth ? `${m}（当前）` : m;
    html += `<option value="${_rptEscapeHtml(m)}">${_rptEscapeHtml(label)}</option>`;
  });
  select.innerHTML = html;
  select.value = '';
}

/**
 * 按月份渲染右侧详情
 */
function _rptRenderTourDetailForMonth(tourName, month) {
  const sf = document.getElementById('report-scenario-filter');
  const sc = sf ? sf.value : '';
  const rows = _rptBuildTourDetailRows(tourName, month, sc);
  _rptRenderTourDetail(rows);
}

function _rptRenderTourList(detailRows, lossRows) {
  lossRows = lossRows || [];
  const ul = document.getElementById('report-tour-list');
  const detailBody = document.getElementById('report-tour-detail-tbody');
  const nameEl = document.getElementById('report-detail-tour-name');
  if (!ul) return;

  // 主数据团期名称 ∪ 本月使用过的团期 ∪ 本月有报损的团期
  const masterMap = new Map();
  ((_appCache && _appCache.tourNames) || []).forEach(t => {
    const name = (t.name || '').trim();
    if (name) masterMap.set(name, t);
  });
  const usageNames = (detailRows || []).map(r => (r.tour_name || '').trim()).filter(Boolean);
  const lossNames = lossRows.map(r => (r.tour_name || '').trim()).filter(Boolean);
  const allNames = [...new Set([...masterMap.keys(), ...usageNames, ...lossNames])].sort((a, b) => a.localeCompare(b, 'zh'));

  if (allNames.length === 0) {
    ul.innerHTML = '<li class="tour-empty">暂无团期，点击右上角「+ 新增团期」添加</li>';
    if (detailBody) detailBody.innerHTML = '<tr><td colspan="9" class="empty-state">请选择上方团期查看明细</td></tr>';
    if (nameEl) nameEl.textContent = '';
    _rptSelectedTourName = null;
    return;
  }

  const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

  // 已被领用单 / 出库记录 / 报损记录关联的团期名称集合（全量历史，不限于当前月份）
  const associatedNames = new Set();
  const _reqAll = (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];
  const _soAll = (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
  const _lossAll = (_appCache && _appCache.lossRecords) ? _appCache.lossRecords : [];
  _reqAll.forEach(r => { const n = (r.tour_name || '').trim(); if (n) associatedNames.add(n); });
  _soAll.forEach(r => { const n = (r.tour_name || '').trim(); if (n) associatedNames.add(n); });
  _lossAll.forEach(r => { const n = (r.tour_name || '').trim(); if (n) associatedNames.add(n); });

  const fmtMoney = (v) => Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  ul.innerHTML = allNames.map(name => {
    const rows = (detailRows || []).filter(r => (r.tour_name || '').trim() === name);
    const lrs = lossRows.filter(r => (r.tour_name || '').trim() === name);
    const qty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const useCost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const lossQty = lrs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const lossAmount = lrs.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const totalCost = useCost + lossAmount;
    const count = rows.length + lrs.length;
    const hasUsage = count > 0;
    const scenarios = [...new Set(rows.map(r => r.scenario).filter(Boolean))].join('/');
    const statClass = hasUsage ? 'tour-stats' : 'tour-stats tour-stats--empty';
    const master = masterMap.get(name);
    const protectedName = associatedNames.has(name);
    const deleteBtn = (isAdmin && master)
      ? (protectedName
          ? `<button class="tour-delete-btn tour-delete-locked" data-protected="1" data-name="${_rptEscapeHtml(name)}" title="该团期已被领用单/出库/报损记录关联，无法删除" type="button" disabled>已关联</button>`
          : `<button class="tour-delete-btn" data-id="${master.id}" data-name="${_rptEscapeHtml(name)}" title="删除团期名称" type="button">×</button>`)
      : '';
    let metaText;
    if (!hasUsage) metaText = '本月暂无使用';
    else if (scenarios) metaText = scenarios;
    else metaText = '仅报损记录';
    const lossTag = lossQty > 0
      ? `<span style="color:var(--danger);">报损 ${lossQty} · ¥${fmtMoney(lossAmount)}</span>`
      : '';
    return `
      <li class="tour-list-item${hasUsage ? '' : ' tour-list-item--empty'}" data-name="${_rptEscapeHtml(name)}">
        <div class="tour-list-item-main">
          <div class="tour-name">${_rptEscapeHtml(name)}${deleteBtn}</div>
          <div class="tour-meta"><span>${_rptEscapeHtml(metaText)}</span></div>
          <div class="${statClass}"><span>数量 ${qty}</span><span>¥${fmtMoney(totalCost)}</span><span>${count} 项</span>${lossTag}</div>
        </div>
      </li>`;
  }).join('');

  // 绑定点击：按名称选择（仅点击主体，不点删除按钮）
  ul.querySelectorAll('.tour-list-item').forEach(li => {
    li.addEventListener('click', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('tour-delete-btn')) return;
      selectTourByName(li.dataset.name);
    });
  });

  // 绑定删除按钮
  ul.querySelectorAll('.tour-delete-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (this.dataset.protected === '1') {
        if (typeof showToast === 'function') showToast('该团期已被领用单/出库记录关联，无法删除', 'error');
        return;
      }
      _rptDeleteTourName(Number(this.dataset.id), this.dataset.name, this);
    });
  });

  // 默认选中（优先有使用记录的，否则第一个）
  const firstWithUsage = allNames.find(n => (detailRows || []).some(r => (r.tour_name || '').trim() === n));
  selectTourByName(firstWithUsage || allNames[0]);
}

/**
 * 删除团期名称主数据（仅 admin，且需二次确认）
 */
async function _rptDeleteTourName(id, name, btnEl) {
  if (!id) return;
  // 二次校验：已被领用单 / 出库记录关联的团期不允许删除（防并发绕过前端按钮）
  const _reqAll = (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];
  const _soAll = (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
  const inUse = _reqAll.some(r => (r.tour_name || '').trim() === name) ||
                _soAll.some(r => (r.tour_name || '').trim() === name);
  if (inUse) {
    if (typeof showToast === 'function') showToast('该团期已被领用单/出库记录关联，无法删除', 'error');
    return;
  }
  showConfirm(`确定删除团期名称「${name}」？\n删除后新建领用单时不再可选，但历史使用记录不受影响。`, async function() {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="btn-spinner-inline"></span>';
    }
    try {
      await SupaDB.deleteTourName(id);
      await refreshData('tourNames');
      if (typeof showToast === 'function') showToast('团期名称「' + name + '」已删除', 'success');
      if (typeof loadReports === 'function') loadReports();
    } catch (e) {
      if (typeof showToast === 'function') showToast('删除失败：' + (e.message || e), 'error');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = '×';
      }
    }
  }, { danger: true });
}

function selectTourByName(name) {
  if (!name) return;
  _rptSelectedTourName = name;
  const items = document.querySelectorAll('.tour-list-item');
  items.forEach(el => el.classList.toggle('active', el.dataset.name === name));
  const nameEl = document.getElementById('report-detail-tour-name');
  if (nameEl) nameEl.textContent = name;

  // 渲染月份筛选下拉
  _rptRenderDetailMonthFilter(name);

  // 默认显示当前全局月份的数据
  const globalMonthInput = document.getElementById('report-month');
  const globalMonth = globalMonthInput ? globalMonthInput.value : '';
  const rows = _rptBuildTourDetailRows(name, globalMonth);
  _rptRenderTourDetail(rows);
}

function _rptRenderTourDetail(rows) {
  const tbody = document.getElementById('report-tour-detail-tbody');
  const tfoot = document.getElementById('report-detail-tfoot');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">该团期本月暂无使用与报损记录</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  const standards = (_appCache && _appCache.consumptionStandards) ? _appCache.consumptionStandards : [];
  const useSrc = rows.filter(r => r.kind !== 'loss');
  const lossSrc = rows.filter(r => r.kind === 'loss');

  // ---- 使用行：按 日期|场景|物品 聚合 ----
  const aggMap = {};
  useSrc.forEach(row => {
    const key = row.tour_date + '|' + row.scenario + '|' + row.item_name;
    if (!aggMap[key]) {
      aggMap[key] = { tour_date: row.tour_date, scenario: row.scenario, item_name: row.item_name, category: row.category, totalQty: 0, totalCost: 0, unit: row.unit, unit_price: row.unit_price || 0 };
    }
    aggMap[key].totalQty += (row.quantity || 0);
    aggMap[key].totalCost += (row.cost || 0);
  });
  const ar = Object.values(aggMap).sort((a, b) => a.scenario.localeCompare(b.scenario) || a.item_name.localeCompare(b.item_name));

  let html = ar.map(row => {
    const std = standards.find(s => s.item_name === row.item_name && (s.scenario === row.scenario || s.scenario === '通用'));
    const isOver = std && row.totalQty > std.max_per_tour;
    const stdText = std ? (std.max_per_tour + ' / 团期') : '-';
    const statusBadge = isOver
      ? '<span style="background:#fde8e8;color:#e53935;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">超额领用</span>'
      : (std ? '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;">正常</span>' : '-');
    const costText = row.totalCost > 0 ? ('¥' + row.totalCost.toFixed(2)) : '-';
    return `
      <tr style="${isOver ? 'background:#fff8f0;' : ''}">
        <td><span class="rpt-type-badge rpt-type-use">使用</span></td>
        <td>${_rptEscapeHtml(row.tour_date)}</td>
        <td><span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;">${_rptEscapeHtml(row.scenario)}</span></td>
        <td style="font-weight:600;">${_rptEscapeHtml(row.item_name)}</td>
        <td>${_rptEscapeHtml(row.category)}</td>
        <td style="font-weight:700;${isOver ? 'color:var(--danger);' : ''}">${row.totalQty} ${_rptEscapeHtml(row.unit)}</td>
        <td>${costText}</td>
        <td>${stdText}</td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join('');

  // ---- 报损行：逐条列出（每条有独立原因） ----
  const lossSorted = lossSrc.slice().sort((a, b) =>
    String(a.tour_date || '').localeCompare(String(b.tour_date || '')) ||
    String(a.item_name || '').localeCompare(String(b.item_name || ''))
  );
  html += lossSorted.map(row => `
      <tr class="rpt-row-loss">
        <td><span class="rpt-type-badge rpt-type-loss">报损</span></td>
        <td>${_rptEscapeHtml(row.tour_date)}</td>
        <td style="color:var(--danger);">${_rptEscapeHtml(row.scenario)}</td>
        <td style="font-weight:600;">${_rptEscapeHtml(row.item_name)}</td>
        <td>${_rptEscapeHtml(row.category)}</td>
        <td style="font-weight:700;color:var(--danger);">-${row.quantity} ${_rptEscapeHtml(row.unit)}</td>
        <td style="color:var(--danger);">¥${Number(row.cost || 0).toFixed(2)}</td>
        <td>-</td>
        <td>${row.applicant_name ? _rptEscapeHtml(row.applicant_name) : '-'}</td>
      </tr>`).join('');

  tbody.innerHTML = html;

  // ---- 合计行：使用成本 / 报损金额 / 总计 ----
  if (tfoot) {
    const useQty = ar.reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
    const useCost = ar.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    const lossQty = lossSorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const lossCost = lossSorted.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const money = (v) => '¥' + Number(v || 0).toFixed(2);
    tfoot.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:right;">合计</td>
        <td>使用 ${useQty}${lossQty ? ` · 报损 ${lossQty}` : ''}</td>
        <td>${money(useCost)}${lossCost ? ` · <span style="color:var(--danger);">${money(lossCost)}</span>` : ''}</td>
        <td colspan="2">总计 ${money(useCost + lossCost)}</td>
      </tr>`;
  }
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

  // 报损汇总 sheet
  const lossData = [['团期', '报损数量', '损失金额']];
  (_rptLossData ? _rptLossData.rows : []).forEach(function(r) {
    lossData.push([r.tour_name, r.qty, r.amount.toFixed(2)]);
  });
  if (_rptLossData && _rptLossData.rows.length > 0) {
    lossData.push([]);
    lossData.push(['合计', _rptLossData.totalQty, _rptLossData.totalAmount.toFixed(2)]);
    const wsLoss = XLSX.utils.aoa_to_sheet(lossData);
    XLSX.utils.book_append_sheet(wb, wsLoss, '报损汇总');
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

/**
 * 解析明细行物品的类别（容错）：
 * 1) 优先取明细行自身的 category_name / category（入库快照字段，可能为空）
 * 2) 兜底按 item_id / inventory_item_id 查 inventory_items 取 category_name
 * 3) 还不行按 name 查 inventory_items
 * 解决：早期出库/领用明细的 category 字段可能为空，导致报表"类别"列全是 "-"。
 */
function _rptResolveCategory(it) {
  let cat = (it && (it.category_name || it.category)) || '';
  if (cat) return cat;
  const inv = (_appCache && _appCache.inventory) ? _appCache.inventory : [];
  const id = String((it && (it.item_id || it.inventory_item_id)) || '');
  if (id && id !== 'undefined') {
    const hit = inv.find(x => String(x.id) === id);
    if (hit) return hit.category_name || hit.category || '-';
  }
  if (it && it.name) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const hit = inv.find(x => norm(x.name) === norm(it.name));
    if (hit) return hit.category_name || hit.category || '-';
  }
  return '-';
}

// ============== D-1 版：成本排行 + 维度对比分析 ==============

/**
 * 构建团期级成本聚合（供排行与分析区使用）
 * 数据来源：detailRows(使用，已含实时单价成本) + lossRows(报损，金额已冻结)
 * 价格口径：与报表全局一致，来自 _rptBuildPriceMap（库存价优先 / 采购价兜底）
 */
function _rptBuildTourAgg(detailRows, lossRows) {
  const masterMap = new Map();
  ((_appCache && _appCache.tourNames) || []).forEach(t => {
    const n = (t.name || '').trim();
    if (n) masterMap.set(n, t);
  });
  const asoc = new Set();
  ((_appCache && _appCache.requisitions) || []).forEach(r => { const n = (r.tour_name || '').trim(); if (n) asoc.add(n); });
  ((_appCache && _appCache.stockOutRecords) || []).forEach(r => { const n = (r.tour_name || '').trim(); if (n) asoc.add(n); });
  ((_appCache && _appCache.lossRecords) || []).forEach(r => { const n = (r.tour_name || '').trim(); if (n) asoc.add(n); });

  const map = {};
  (detailRows || []).forEach(r => {
    const n = (r.tour_name || '').trim();
    if (!n) return;
    if (!map[n]) map[n] = { name: n, useCost: 0, lossAmt: 0, useQty: 0, items: [] };
    map[n].useCost += (Number(r.cost) || 0);
    map[n].useQty += (Number(r.quantity) || 0);
    map[n].items.push({ scenario: r.scenario, item: r.item_name, qty: r.quantity, cost: r.cost, kind: 'use' });
  });
  (lossRows || []).forEach(r => {
    const n = (r.tour_name || '').trim();
    if (!n) return;
    if (!map[n]) map[n] = { name: n, useCost: 0, lossAmt: 0, useQty: 0, items: [] };
    map[n].lossAmt += (Number(r.cost) || 0);
  });
  return Object.values(map).map(a => {
    const master = masterMap.get(a.name) || null;
    return {
      name: a.name,
      useCost: a.useCost,
      lossAmt: a.lossAmt,
      net: a.useCost + a.lossAmt,
      useQty: a.useQty,
      items: a.items,
      masterId: master ? master.id : null,
      associated: asoc.has(a.name)
    };
  });
}

function _rptRenderTourBar() {
  const el = document.getElementById('rpt-tour-bar');
  if (!el) return;
  if (!_rptAgg.length) {
    el.innerHTML = '<div class="rpt-rank-empty">本月暂无团期使用 / 报损数据</div>';
    return;
  }
  const sorted = [..._rptAgg].sort((a, b) => b.net - a.net);
  const maxNet = Math.max(...sorted.map(a => a.net), 1);
  const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
  el.innerHTML = sorted.map(a => {
    const idx = _rptAgg.indexOf(a);
    const totPct = maxNet ? Math.round(a.net / maxNet * 100) : 0;
    const uPct = a.net ? Math.round(a.useCost / a.net * 100) : 0;
    const active = idx === _rptRankSelIdx ? 'rpt-tour-active' : '';
    const delBtn = (isAdmin && a.masterId && !a.associated)
      ? '<button class="rpt-tour-del" data-id="' + a.masterId + '" data-name="' + _rptEscapeHtml(a.name) + '" title="删除团期名称">删除</button>'
      : '';
    return '<div class="rpt-tour-card ' + active + '" data-idx="' + idx + '">'
      + '<div class="rpt-tour-name">' + _rptEscapeHtml(a.name) + '</div>'
      + '<div class="rpt-tour-cost money">¥' + Math.round(a.net).toLocaleString('zh-CN') + '</div>'
      + (delBtn ? delBtn : '')
      + '<div class="rpt-tour-mini"><i style="width:' + (totPct * uPct / 100) + '%;background:var(--accent)"></i><i style="width:' + (totPct * (100 - uPct) / 100) + '%;background:var(--danger)"></i></div>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.rpt-tour-card').forEach(d => {
    d.addEventListener('click', e => {
      if (e.target.closest('.rpt-tour-del')) return;
      _rptSelectTour(+d.dataset.idx);
    });
  });
  el.querySelectorAll('.rpt-tour-del').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      _rptDeleteTourName(Number(b.dataset.id), b.dataset.name, b);
    });
  });
}

function _rptSelectTour(idx) {
  if (idx < 0 || idx >= _rptAgg.length) return;
  _rptRankSelIdx = idx;
  const a = _rptAgg[idx];
  _rptSelectedTourName = a.name;
  document.querySelectorAll('#rpt-tour-bar .rpt-tour-card').forEach(d => d.classList.toggle('rpt-tour-active', (+d.dataset.idx) === idx));
  const nameEl = document.getElementById('report-detail-tour-name');
  if (nameEl) nameEl.textContent = a.name;
  _rptRenderDetailMonthFilter(a.name);
  const g = document.getElementById('report-month');
  const gm = g ? g.value : '';
  const sf = document.getElementById('report-scenario-filter');
  const sc = sf ? sf.value : '';
  const rows = _rptBuildTourDetailRows(a.name, gm, sc);
  _rptRenderTourDetail(rows);
  _rptRenderAnalysis();
}

function _rptBindAnaSeg() {
  const seg = document.getElementById('rpt-ana-seg');
  if (!seg || _rptAnaSegBound) return;
  _rptAnaSegBound = true;
  seg.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _rptAnaMode = b.dataset.mode;
      _rptRenderAnalysis();
    };
  });
}

function _rptRenderAnalysis() {
  const ctrl = document.getElementById('rpt-ana-ctrl');
  const chart = document.getElementById('rpt-ana-chart');
  const hint = document.getElementById('rpt-ana-hint');
  if (!chart) return;
  const yuan = (v) => '¥' + Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  if (_rptAnaMode === 'scene') {
    if (_rptRankSelIdx < 0 || !_rptAgg[_rptRankSelIdx]) {
      if (ctrl) ctrl.innerHTML = '';
      chart.innerHTML = '<div class="rpt-ana-empty">请先在上方排行选择团期</div>';
      if (hint) hint.innerHTML = '';
      return;
    }
    const a = _rptAgg[_rptRankSelIdx];
    if (ctrl) ctrl.innerHTML = '<span class="rpt-ana-ctx">当前团期：</span><b>' + _rptEscapeHtml(a.name) + '</b>'
      + '<span class="rpt-badge rpt-b-use">使用 ' + yuan(a.useCost) + '</span>'
      + '<span class="rpt-badge rpt-b-loss">报损 ' + yuan(a.lossAmt) + '</span>';
    const map = {};
    a.items.forEach(it => {
      if (!map[it.scenario]) map[it.scenario] = { scenario: it.scenario, cost: 0, qty: 0 };
      map[it.scenario].cost += (Number(it.cost) || 0);
      map[it.scenario].qty += (Number(it.qty) || 0);
    });
    const dist = Object.values(map).sort((x, y) => y.cost - x.cost);
    const total = dist.reduce((s, d) => s + d.cost, 0);
    const mx = Math.max(...dist.map(d => d.cost), 1);
    chart.innerHTML = dist.map(d => {
      const pct = Math.round(d.cost / mx * 100);
      const share = total ? Math.round(d.cost / total * 100) : 0;
      return '<div class="rpt-cmp-row"><div class="rpt-cmp-label">' + _rptEscapeHtml(d.scenario) + '</div>'
        + '<div class="rpt-cmp-bar"><i style="width:' + pct + '%;background:var(--accent)"></i></div>'
        + '<div class="rpt-cmp-val">' + yuan(d.cost) + ' <span class="rpt-cmp-share">(' + share + '%)</span></div></div>';
    }).join('') || '<div class="rpt-ana-empty">该团期暂无使用数据</div>';
    const tail = dist[1] ? ('其次 ' + dist[1].scenario + '（' + yuan(dist[1].cost) + '）') : '其余场景占比较小';
    if (hint) hint.innerHTML = '<span class="rpt-hint-label">分析</span> ' + _rptEscapeHtml(a.name) + ' 使用成本 <b class="money">' + yuan(total) + '</b>，最大头是 <b>' + _rptEscapeHtml(dist[0] ? dist[0].scenario : '-') + '</b>（' + yuan(dist[0] ? dist[0].cost : 0) + '，' + (total ? Math.round((dist[0] ? dist[0].cost : 0) / total * 100) : 0) + '%）；' + tail + '。报损金额不计入场景分布。';

  } else if (_rptAnaMode === 'scenario') {
    const scenes = [...new Set(_rptAgg.flatMap(a => a.items.map(i => i.scenario)))].filter(Boolean).sort();
    if (!_rptAnaSc || !scenes.includes(_rptAnaSc)) _rptAnaSc = scenes[0] || '';
    if (ctrl) ctrl.innerHTML = '<label class="rpt-ana-label">选择场景</label><select id="rpt-ana-sc-sel">' + scenes.map(s => '<option ' + (s === _rptAnaSc ? 'selected' : '') + '>' + _rptEscapeHtml(s) + '</option>').join('') + '</select>';
    const rows = _rptAgg.map(a => {
      const its = a.items.filter(i => i.scenario === _rptAnaSc);
      return { name: a.name, cost: its.reduce((s, i) => s + (Number(i.cost) || 0), 0) };
    }).filter(r => r.cost > 0).sort((x, y) => y.cost - x.cost);
    const avg = rows.length ? rows.reduce((s, r) => s + r.cost, 0) / rows.length : 0;
    const mx = Math.max(...rows.map(r => r.cost), avg) || 1;
    chart.innerHTML = rows.map(r => {
      const pct = Math.round(r.cost / mx * 100);
      const over = r.cost > avg * 1.3;
      return '<div class="rpt-cmp-row"><div class="rpt-cmp-label">' + _rptEscapeHtml(r.name) + '</div>'
        + '<div class="rpt-cmp-bar"><i style="width:' + pct + '%;background:' + (over ? 'var(--danger)' : 'var(--accent)') + '"></i>'
        + '<span class="rpt-avgline" style="left:' + Math.round(avg / mx * 100) + '%"></span></div>'
        + '<div class="rpt-cmp-val ' + (over ? 'money' : '') + '">' + yuan(r.cost) + (over ? ' 超均值' : '') + '</div></div>';
    }).join('') || '<div class="rpt-ana-empty">该场景暂无领用数据</div>';
    if (rows.length) {
      const hi = rows[0], lo = rows[rows.length - 1];
      if (hint) hint.innerHTML = '<span class="rpt-hint-label">分析</span> 「' + _rptEscapeHtml(_rptAnaSc) + '」场景平均使用成本 <b>' + yuan(avg) + '</b>（' + rows.length + ' 个团期有领用）。<b style="' + (hi.cost > avg * 1.3 ? 'color:var(--danger)' : '') + '">' + _rptEscapeHtml(hi.name) + '</b> 最高 ' + yuan(hi.cost) + '，较均值高 ' + (avg ? Math.round((hi.cost / avg - 1) * 100) : 0) + '%；' + _rptEscapeHtml(lo.name) + ' 最低 ' + yuan(lo.cost) + '。虚线为均值，超均值 30% 标红。';
    } else if (hint) hint.innerHTML = '';
    const scSel = document.getElementById('rpt-ana-sc-sel');
    if (scSel) scSel.onchange = e => { _rptAnaSc = e.target.value; _rptRenderAnalysis(); };

  } else {
    const items = [...new Set(_rptAgg.flatMap(a => a.items.map(i => i.item)))].filter(Boolean).sort();
    if (!_rptAnaItem || !items.includes(_rptAnaItem)) _rptAnaItem = items[0] || '';
    if (ctrl) ctrl.innerHTML = '<label class="rpt-ana-label">选择物品</label><select id="rpt-ana-item-sel">' + items.map(s => '<option ' + (s === _rptAnaItem ? 'selected' : '') + '>' + _rptEscapeHtml(s) + '</option>').join('') + '</select>';
    const rows = _rptAgg.map(a => {
      const its = a.items.filter(i => i.item === _rptAnaItem);
      return { name: a.name, qty: its.reduce((s, i) => s + (Number(i.qty) || 0), 0), cost: its.reduce((s, i) => s + (Number(i.cost) || 0), 0) };
    }).filter(r => r.qty > 0).sort((x, y) => y.qty - x.qty);
    const avgQty = rows.length ? rows.reduce((s, r) => s + r.qty, 0) / rows.length : 0;
    const avgCost = rows.length ? rows.reduce((s, r) => s + r.cost, 0) / rows.length : 0;
    const mx = Math.max(...rows.map(r => r.qty), avgQty) || 1;
    chart.innerHTML = rows.map(r => {
      const pct = Math.round(r.qty / mx * 100);
      const over = r.qty > avgQty * 1.3;
      return '<div class="rpt-cmp-row"><div class="rpt-cmp-label">' + _rptEscapeHtml(r.name) + '</div>'
        + '<div class="rpt-cmp-bar"><i style="width:' + pct + '%;background:' + (over ? 'var(--danger)' : 'var(--accent)') + '"></i>'
        + '<span class="rpt-avgline" style="left:' + Math.round(avgQty / mx * 100) + '%"></span></div>'
        + '<div class="rpt-cmp-val ' + (over ? 'money' : '') + '">' + r.qty + ' 件 / ' + yuan(r.cost) + (over ? ' 超均值' : '') + '</div></div>';
    }).join('') || '<div class="rpt-ana-empty">该物品暂无领用数据</div>';
    if (rows.length) {
      const hi = rows[0], lo = rows[rows.length - 1];
      if (hint) hint.innerHTML = '<span class="rpt-hint-label">分析</span> 「' + _rptEscapeHtml(_rptAnaItem) + '」平均领用 <b>' + Math.round(avgQty) + '</b> 件/团期（约 ' + yuan(avgCost) + '）。<b style="' + (hi.qty > avgQty * 1.3 ? 'color:var(--danger)' : '') + '">' + _rptEscapeHtml(hi.name) + '</b> 领用 ' + hi.qty + ' 件，超均值 ' + (avgQty ? Math.round((hi.qty / avgQty - 1) * 100) : 0) + '%，建议核查该团领用量；' + _rptEscapeHtml(lo.name) + ' 最低 ' + lo.qty + ' 件。';
    } else if (hint) hint.innerHTML = '';
    const itSel = document.getElementById('rpt-ana-item-sel');
    if (itSel) itSel.onchange = e => { _rptAnaItem = e.target.value; _rptRenderAnalysis(); };
  }
}
