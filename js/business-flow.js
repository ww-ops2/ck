/**
 * 业务流程时间筛选模块
 * 为采购/入库/领用/出库四个模块提供月度时间筛选和 KPI 概览
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

  // 初始化所有月份输入框
  ['purchase-month', 'stockin-month', 'requisition-month', 'stockout-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = thisMonth;
  });

  // 采购模块
  _bfBindMonthPicker('purchase-month', 'purchase-month-this', 'purchase-month-last',
    thisMonth, lastMonth, () => { _bfPurchaseMonth = _bfGetMonthRange('purchase-month'); _bfUpdatePurchaseKPI(); });

  // 入库模块
  _bfBindMonthPicker('stockin-month', 'stockin-month-this', 'stockin-month-last',
    thisMonth, lastMonth, () => { _bfStockInMonth = _bfGetMonthRange('stockin-month'); _bfUpdateStockInKPI(); });

  // 领用模块
  _bfBindMonthPicker('requisition-month', 'req-month-this', 'req-month-last',
    thisMonth, lastMonth, () => { _bfReqMonth = _bfGetMonthRange('requisition-month'); _bfUpdateRequisitionKPI(); });

  // 出库模块
  _bfBindMonthPicker('stockout-month', 'stockout-month-this', 'stockout-month-last',
    thisMonth, lastMonth, () => { _bfStockOutMonth = _bfGetMonthRange('stockout-month'); _bfUpdateStockOutKPI(); });

  // 初始加载
  _bfPurchaseMonth = _bfGetMonthRange('purchase-month');
  _bfStockInMonth = _bfGetMonthRange('stockin-month');
  _bfReqMonth = _bfGetMonthRange('requisition-month');
  _bfStockOutMonth = _bfGetMonthRange('stockout-month');
}

function _bfBindMonthPicker(pickerId, thisBtnId, lastBtnId, thisMonth, lastMonth, onChange) {
  const picker = document.getElementById(pickerId);
  if (picker) picker.addEventListener('change', onChange);

  const thisBtn = document.getElementById(thisBtnId);
  if (thisBtn) thisBtn.addEventListener('click', () => {
    if (picker) { picker.value = thisMonth; onChange(); }
  });

  const lastBtn = document.getElementById(lastBtnId);
  if (lastBtn) lastBtn.addEventListener('click', () => {
    if (picker) { picker.value = lastMonth; onChange(); }
  });
}

function _bfGetMonthRange(pickerId) {
  const el = document.getElementById(pickerId);
  if (!el || !el.value) return null;
  const [y, m] = el.value.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
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
  const records = JSON.parse(localStorage.getItem('stockInRecords') || '[]');
  const filtered = _bfStockInMonth
    ? records.filter(r => _bfInMonth(r.stockin_date || r.confirmed_at || r.created_at, _bfStockInMonth))
    : records;

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
