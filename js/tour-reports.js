/**
 * 团期使用报表模块
 * 按团期维度统计消耗情况、成本、超额及报损分析
 * 数据来源：stockOutRecords + requisitions + purchaseOrders + inventory（均为 Supabase 落库数据）
 * 团期名称为主数据（tour_names 表），报表页可维护，领用单下拉引用
 */

let _rptFilteredData = []; // 缓存当前筛选结果
let _rptSelectedTourName = null; // 当前右侧选中的团期名称

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
        const unitPrice = _rptResolvePrice(it.name, priceMap);
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
        const unitPrice = _rptResolvePrice(it.name, priceMap);
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

  // 报损财务分析
  _rptLossData = _rptComputeLoss(startDate, endDate);
  _rptRenderLossBlock(_rptLossData);

  // 渲染团期列表（左栏：主数据 ∪ 使用数据）+ 默认选中第一个
  _rptRenderTourList(detailRows);
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

function _rptRenderLossBlock(data) {
  const qtyEl = document.getElementById('rpt-kpi-loss-qty');
  const amtEl = document.getElementById('rpt-kpi-loss-amount');
  const tourEl = document.getElementById('rpt-kpi-loss-tours');
  const tbody = document.getElementById('report-loss-tbody');
  if (qtyEl) qtyEl.textContent = data.totalQty;
  if (amtEl) amtEl.textContent = '¥' + data.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (tourEl) tourEl.textContent = data.rows.length;
  if (!tbody) return;
  if (data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">本月暂无报损记录</td></tr>';
    return;
  }
  tbody.innerHTML = data.rows.map(function(r) {
    return '<tr><td>' + r.tour_name + '</td>' +
      '<td>' + r.qty + '</td>' +
      '<td>¥' + r.amount.toFixed(2) + '</td>' +
      '<td>报损损失</td></tr>';
  }).join('');
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
function _rptBuildTourDetailRows(tourName, month) {
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
    if (so.items) {
      so.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = _rptResolvePrice(it.name, priceMap);
        rows.push({
          tour_date: so.tour_date || '',
          tour_name: tourName,
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: it.category || '-',
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
    if (req.items) {
      req.items.forEach(it => {
        const qty = it.quantity || 0;
        const unitPrice = _rptResolvePrice(it.name, priceMap);
        rows.push({
          tour_date: req.tour_date || '',
          tour_name: tourName,
          scenario: scenario,
          item_name: it.name,
          item_code: it.code || '',
          category: it.category || '-',
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
  const rows = _rptBuildTourDetailRows(tourName, month);
  _rptRenderTourDetail(rows);
}

function _rptRenderTourList(detailRows) {
  const ul = document.getElementById('report-tour-list');
  const detailBody = document.getElementById('report-tour-detail-tbody');
  const nameEl = document.getElementById('report-detail-tour-name');
  if (!ul) return;

  // 主数据团期名称 ∪ 本月使用过的团期名称
  const masterMap = new Map();
  ((_appCache && _appCache.tourNames) || []).forEach(t => {
    const name = (t.name || '').trim();
    if (name) masterMap.set(name, t);
  });
  const usageNames = (detailRows || []).map(r => (r.tour_name || '').trim()).filter(Boolean);
  const allNames = [...new Set([...masterMap.keys(), ...usageNames])].sort((a, b) => a.localeCompare(b, 'zh'));

  if (allNames.length === 0) {
    ul.innerHTML = '<li class="tour-empty">暂无团期，点击右上角「+ 新增团期」添加</li>';
    if (detailBody) detailBody.innerHTML = '<tr><td colspan="8" class="empty-state">请选择左侧团期查看详情</td></tr>';
    if (nameEl) nameEl.textContent = '';
    _rptSelectedTourName = null;
    return;
  }

  const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

  // 已被领用单 / 出库记录关联的团期名称集合（全量历史，不限于当前月份）
  const associatedNames = new Set();
  const _reqAll = (_appCache && _appCache.requisitions) ? _appCache.requisitions : [];
  const _soAll = (_appCache && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];
  _reqAll.forEach(r => { const n = (r.tour_name || '').trim(); if (n) associatedNames.add(n); });
  _soAll.forEach(r => { const n = (r.tour_name || '').trim(); if (n) associatedNames.add(n); });

  ul.innerHTML = allNames.map(name => {
    const rows = (detailRows || []).filter(r => (r.tour_name || '').trim() === name);
    const qty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const cost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const count = rows.length;
    const hasUsage = rows.length > 0;
    const scenarios = [...new Set(rows.map(r => r.scenario).filter(Boolean))].join('/');
    const statClass = hasUsage ? 'tour-stats' : 'tour-stats tour-stats--empty';
    const master = masterMap.get(name);
    const protectedName = associatedNames.has(name);
    const deleteBtn = (isAdmin && master)
      ? (protectedName
          ? `<button class="tour-delete-btn tour-delete-locked" data-protected="1" data-name="${_rptEscapeHtml(name)}" title="该团期已被领用单/出库记录关联，无法删除" type="button">🔒</button>`
          : `<button class="tour-delete-btn" data-id="${master.id}" data-name="${_rptEscapeHtml(name)}" title="删除团期名称" type="button">×</button>`)
      : '';
    return `
      <li class="tour-list-item${hasUsage ? '' : ' tour-list-item--empty'}" data-name="${_rptEscapeHtml(name)}">
        <div class="tour-list-item-main">
          <div class="tour-name">${_rptEscapeHtml(name)}${deleteBtn}</div>
          <div class="tour-meta"><span>${hasUsage ? _rptEscapeHtml(scenarios) : '本月暂无使用'}</span></div>
          <div class="${statClass}"><span>数量 ${qty}</span><span>¥${Number(cost || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</span><span>${count} 项</span></div>
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
  }, { danger: true, icon: '🗑' });
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
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">该团期本月暂无使用记录</td></tr>';
    return;
  }
  const standards = (_appCache && _appCache.consumptionStandards) ? _appCache.consumptionStandards : [];
  const aggMap = {};
  rows.forEach(row => {
    const key = row.tour_date + '|' + row.scenario + '|' + row.item_name;
    if (!aggMap[key]) {
      aggMap[key] = { tour_date: row.tour_date, scenario: row.scenario, item_name: row.item_name, category: row.category, totalQty: 0, totalCost: 0, unit: row.unit, unit_price: row.unit_price || 0 };
    }
    aggMap[key].totalQty += (row.quantity || 0);
    aggMap[key].totalCost += (row.cost || 0);
  });
  const ar = Object.values(aggMap).sort((a, b) => a.scenario.localeCompare(b.scenario) || a.item_name.localeCompare(b.item_name));
  tbody.innerHTML = ar.map(row => {
    const std = standards.find(s => s.item_name === row.item_name && (s.scenario === row.scenario || s.scenario === '通用'));
    const isOver = std && row.totalQty > std.max_per_tour;
    const stdText = std ? (std.max_per_tour + ' / 团期') : '-';
    const statusBadge = isOver
      ? '<span style="background:#fde8e8;color:#e53935;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">超额领用</span>'
      : (std ? '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;">正常</span>' : '-');
    const costText = row.totalCost > 0 ? ('¥' + row.totalCost.toFixed(2)) : '-';
    return `
      <tr style="${isOver ? 'background:#fff8f0;' : ''}">
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
