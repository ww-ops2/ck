/**
 * 业务流程时间筛选模块
 * 为采购/入库/领用/出库四个模块提供月度时间筛选和 KPI 概览
 * 支持单月筛选和区间筛选（开始月份 ~ 结束月份）
 */

// 各模块当前筛选月份
let _bfPurchaseMonth = null;
let _bfStockInMonth = null;
let _bfReqMonth = null;
let _bfStockOutMonth = null;

/**
 * 初始化业务流程时间筛选
 */
function initBusinessFlow() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // 初始化所有月份输入框，并为每个模块添加结束月份选择 + 筛选按钮
  const modules = [
    { pickerId: 'purchase-month',   endId: 'purchase-month-end',   filterId: 'purchase-month-filter',
      thisBtnId: 'purchase-month-this', lastBtnId: 'purchase-month-last',
      onFilter: () => { _bfPurchaseMonth = _bfGetMonthRange('purchase-month', 'purchase-month-end'); _bfUpdatePurchaseKPI(); } },
    { pickerId: 'stockin-month',    endId: 'stockin-month-end',    filterId: 'stockin-month-filter',
      thisBtnId: 'stockin-month-this', lastBtnId: 'stockin-month-last',
      onFilter: () => { _bfStockInMonth = _bfGetMonthRange('stockin-month', 'stockin-month-end'); _bfUpdateStockInKPI(); if (typeof loadStockInRecords === 'function') loadStockInRecords(); } },
    { pickerId: 'requisition-month', endId: 'requisition-month-end', filterId: 'requisition-month-filter',
      thisBtnId: 'req-month-this', lastBtnId: 'req-month-last',
      onFilter: () => { _bfReqMonth = _bfGetMonthRange('requisition-month', 'requisition-month-end'); _bfUpdateRequisitionKPI(); } },
    { pickerId: 'stockout-month',   endId: 'stockout-month-end',   filterId: 'stockout-month-filter',
      thisBtnId: 'stockout-month-this', lastBtnId: 'stockout-month-last',
      onFilter: () => { _bfStockOutMonth = _bfGetMonthRange('stockout-month', 'stockout-month-end'); _bfUpdateStockOutKPI(); } }
  ];

  modules.forEach(function(mod) {
    var picker = document.getElementById(mod.pickerId);
    if (!picker) return;
    picker.value = thisMonth;

    // 获取 panel-actions 容器
    var container = picker.parentNode;
    if (!container) return;

    // 添加「至」标签
    var sep = document.createElement('span');
    sep.style.cssText = 'color:var(--text-secondary);font-size:13px;';
    sep.textContent = '至';
    container.insertBefore(sep, picker.nextSibling);

    // 添加结束月份输入框
    var endInput = document.createElement('input');
    endInput.type = 'month';
    endInput.id = mod.endId;
    endInput.value = thisMonth;
    endInput.style.cssText = 'width:140px;';
    container.insertBefore(endInput, sep.nextSibling);

    // 添加筛选按钮
    var filterBtn = document.createElement('button');
    filterBtn.className = 'btn btn-sm btn-accent';
    filterBtn.id = mod.filterId;
    filterBtn.textContent = '筛选';
    container.insertBefore(filterBtn, endInput.nextSibling);

    // 绑定事件
    picker.addEventListener('change', mod.onFilter);
    endInput.addEventListener('change', mod.onFilter);
    filterBtn.addEventListener('click', mod.onFilter);

    // 本月按钮
    var thisBtn = document.getElementById(mod.thisBtnId);
    if (thisBtn) {
      thisBtn.addEventListener('click', function() {
        picker.value = thisMonth;
        endInput.value = thisMonth;
        mod.onFilter();
      });
    }

    // 上月按钮
    var lastBtn = document.getElementById(mod.lastBtnId);
    if (lastBtn) {
      lastBtn.addEventListener('click', function() {
        picker.value = lastMonth;
        endInput.value = lastMonth;
        mod.onFilter();
      });
    }
  });

  // 初始加载
  _bfPurchaseMonth = _bfGetMonthRange('purchase-month', 'purchase-month-end');
  _bfStockInMonth = _bfGetMonthRange('stockin-month', 'stockin-month-end');
  _bfReqMonth = _bfGetMonthRange('requisition-month', 'requisition-month-end');
  _bfStockOutMonth = _bfGetMonthRange('stockout-month', 'stockout-month-end');
}

function _bfGetMonthRange(startPickerId, endPickerId) {
  var startEl = document.getElementById(startPickerId);
  var endEl = document.getElementById(endPickerId);
  if (!startEl || !startEl.value) return null;
  var [y1, m1] = startEl.value.split('-').map(Number);
  var rangeStart = new Date(y1, m1 - 1, 1);
  var rangeEnd;
  if (endEl && endEl.value) {
    var [y2, m2] = endEl.value.split('-').map(Number);
    rangeEnd = new Date(y2, m2, 0, 23, 59, 59, 999);
  } else {
    // 仅开始月份时，只查当月
    rangeEnd = new Date(y1, m1, 0, 23, 59, 59, 999);
  }
  return { start: rangeStart, end: rangeEnd };
}

function _bfSetKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _bfInMonth(dateStr, range) {
  if (!range || !dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  return d >= range.start && d <= range.end;
}

// ============== 采购 KPI ==============

function _bfUpdatePurchaseKPI() {
  const orders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
  const filtered = _bfPurchaseMonth
    ? orders.filter(po => _bfInMonth(po.order_date || po.created_at, _bfPurchaseMonth))
    : orders;

  const count = filtered.length;
  const totalAmount = filtered.reduce((s, po) => s + (po.total_amount || 0), 0);
  const stockinDone = filtered.filter(po => po.status === 'completed' || po.status === 'stocked_in').length;
  const pending = filtered.filter(po => po.status === 'pending' || po.status === 'pending_stockin' || po.status === 'approved').length;

  _bfSetKPI('po-kpi-count', count);
  _bfSetKPI('po-kpi-amount', '¥' + totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  _bfSetKPI('po-kpi-stockin', stockinDone);
  _bfSetKPI('po-kpi-pending', pending);
}

// ============== 入库 KPI ==============

function _bfUpdateStockInKPI() {
  // 已完成入库记录
  const records = JSON.parse(localStorage.getItem('stockInRecords') || '[]');
  // 待入库采购单
  let pendingPOs = [];
  try {
    var allPOs = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    pendingPOs = allPOs.filter(function(o) { return o.status === 'pending_stockin'; }).map(function(o) {
      return {
        stockin_date: o.purchase_date || o.created_at || '',
        total_quantity: (o.items || []).reduce(function(s, item) { return s + (item.quantity || 0); }, 0),
        status: 'pending'
      };
    });
  } catch(e) {}

  // 合并后再按月份筛选
  var combined = records.concat(pendingPOs);
  const filtered = _bfStockInMonth
    ? combined.filter(r => _bfInMonth(r.stockin_date || r.confirmed_at || r.created_at, _bfStockInMonth))
    : combined;

  const count = filtered.length;
  const totalQty = filtered.reduce((s, r) => s + (r.total_quantity || 0), 0);
  const completed = filtered.filter(r => r.status === 'completed' || r.status === 'confirmed').length;
  const pending = filtered.filter(r => r.status === 'pending').length;

  _bfSetKPI('si-kpi-count', count);
  _bfSetKPI('si-kpi-qty', totalQty);
  _bfSetKPI('si-kpi-completed', completed);
  _bfSetKPI('si-kpi-pending', pending);
}

// ============== 领用 KPI ==============

function _bfUpdateRequisitionKPI() {
  const reqs = JSON.parse(localStorage.getItem('requisitions') || '[]');
  const filtered = _bfReqMonth
    ? reqs.filter(r => _bfInMonth(r.apply_date || r.created_at, _bfReqMonth))
    : reqs;

  const active = filtered.filter(r => r.status !== 'cancelled' && r.status !== 'withdrawn');
  const count = active.length;
  const totalQty = active.reduce((s, r) => s + (r.total_quantity || 0), 0);
  const outbound = active.filter(r => r.status === 'outbound_completed').length;

  // 统计超额领用次数
  let overLimitCount = 0;
  if (typeof getConsumptionStandard === 'function') {
    const standards = JSON.parse(localStorage.getItem('consumptionStandards') || '[]');
    active.forEach(req => {
      if (req.items) {
        req.items.forEach(it => {
          const std = standards.find(s => s.item_name === it.name && (s.scenario === req.scenario || s.scenario === '通用'));
          if (std && it.quantity > std.max_per_tour) overLimitCount++;
        });
      }
    });
  }

  _bfSetKPI('rq-kpi-count', count);
  _bfSetKPI('rq-kpi-qty', totalQty);
  _bfSetKPI('rq-kpi-outbound', outbound);
  _bfSetKPI('rq-kpi-overlimit', overLimitCount);
}

// ============== 出库 KPI ==============

function _bfUpdateStockOutKPI() {
  const records = JSON.parse(localStorage.getItem('stockOutRecords') || '[]');
  const filtered = _bfStockOutMonth
    ? records.filter(r => _bfInMonth(r.stockout_date || r.confirmed_at || r.created_at, _bfStockOutMonth))
    : records;

  const count = filtered.length;
  const totalQty = filtered.reduce((s, r) => s + (r.total_quantity || 0), 0);
  const sc = (s) => { if (s === '餐车') return '列车餐车'; if (s === '客房') return '列车客房'; return s; };
  const cancheQty = filtered.filter(r => sc(r.scenario) === '列车餐车').reduce((s, r) => s + (r.total_quantity || 0), 0);
  const kefangQty = filtered.filter(r => sc(r.scenario) === '列车客房').reduce((s, r) => s + (r.total_quantity || 0), 0);

  _bfSetKPI('so-kpi-count', count);
  _bfSetKPI('so-kpi-qty', totalQty);
  _bfSetKPI('so-kpi-canch', cancheQty);
  _bfSetKPI('so-kpi-kefang', kefangQty);
}

/**
 * 刷新所有业务流程 KPI（供外部调用）
 */
function refreshAllBusinessKPI() {
  _bfUpdatePurchaseKPI();
  _bfUpdateStockInKPI();
  _bfUpdateRequisitionKPI();
  _bfUpdateStockOutKPI();
}
