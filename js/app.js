/**
 * 主应用逻辑 - 初始化应用、加载数据、处理交互
 */

// 模拟数据（实际项目中应从Supabase获取）
const mockData = {
  items: [
    { id: 1, code: 'XH000001', name: '不锈钢托盘', category: '循环使用类', stock: 50, unit: '个', safety_stock: 10 },
    { id: 2, code: 'HM000001', name: '一次性拖鞋', category: '消耗类', stock: 200, unit: '双', safety_stock: 50 },
    { id: 3, code: 'HM000002', name: '矿泉水', category: '消耗类', stock: 500, unit: '瓶', safety_stock: 100 }
  ],
  purchaseOrders: [],
  stockInRecords: [],
  requisitions: [],
  stockOutRecords: []
};

// Chart实例
let trendChart = null;
let categoryChart = null;

/**
 * 应用初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('库存管理系统启动...');

  // 动态注入月度汇总模块（解决 HTML 缓存问题）
  _injectMonthlySummaryModule();

  // 初始化认证模块
  initAuth();
  
  // 绑定模态框关闭事件
  bindModalEvents();
  
  // 设置默认月份
  setDefaultMonth();
  
  // 绑定库存筛选事件（由 inventory-hybrid.js 处理，此处仅兼容旧模式）
  const filterCategory = document.getElementById('inv-filter-category') || document.getElementById('filter-category');
  if (filterCategory) filterCategory.addEventListener('change', loadInventory);
  const filterStatus = document.getElementById('inv-filter-status') || document.getElementById('filter-status');
  if (filterStatus) filterStatus.addEventListener('change', loadInventory);
  
  // 绑定搜索输入事件（带防抖）— 由 inventory-hybrid.js 接管，此处仅作备用
  const searchInput = document.getElementById('inv-search-input');
  if (searchInput && !searchInput._hybridBound) {
    var searchTimer = null;
    searchInput.addEventListener('input', function() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(loadInventory, 150);
    });
  }
  
  // 初始化各模块
  if (typeof initPurchaseModule === 'function') {
    initPurchaseModule();
  }
  if (typeof initStockInModule === 'function') {
    initStockInModule();
  }
  if (typeof initRequisitionModule === 'function') {
    initRequisitionModule();
  }
  if (typeof initMonthlySummary === 'function') {
    initMonthlySummary();
  }
  if (typeof initTourReports === 'function') {
    initTourReports();
  }
  if (typeof initBusinessFlow === 'function') {
    initBusinessFlow();
  }

  // 初始化管理员/调试绑定（新增物品、账号创建等快速入口）
  if (typeof initAdminBindings !== 'function') {
    // 延迟声明，实际实现在文件下方
  }
  initAdminBindings();
});

/**
 * 加载仪表盘数据
 */
function loadDashboard() {
  console.log('加载仪表盘数据...');
  
  // 更新KPI卡片
  updateKPICards();
  
  // 加载图表
  loadTrendChart();
  loadCategoryChart();
  
  // 加载最近动态
  loadRecentActivities();

  // 初始化 KPI 卡片点击展开
  _initKPIExpandHandlers();
}

/**
 * 更新KPI卡片 - 从localStorage读取真实数据
 */
function updateKPICards() {
  // 总库存物品数
  let inventory = _appCache.inventory ? _appCache.inventory : [];
  const totalItems = inventory.length > 0 ? inventory.length : mockData.items.length;
  document.getElementById('kpi-total-items').textContent = totalItems;

  // 本月入库数
  let stockInRecords = _appCache.stockInRecords ? _appCache.stockInRecords : [];
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const monthInQty = stockInRecords
    .filter(r => {
      const d = new Date(r.stockin_date || r.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((sum, r) => sum + (r.total_quantity || 0), 0);
  document.getElementById('kpi-month-in').textContent = monthInQty;

  // 本月出库数
  let stockOutRecords = _appCache.stockOutRecords ? _appCache.stockOutRecords : [];
  const monthOutQty = stockOutRecords
    .filter(r => {
      const d = new Date(r.stockout_date || r.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((sum, r) => sum + (r.total_quantity || 0), 0);
  document.getElementById('kpi-month-out').textContent = monthOutQty;

  // 待处理采购单数
  let purchaseOrders = _appCache.purchaseOrders ? _appCache.purchaseOrders : [];
  const pendingPurchase = purchaseOrders.filter(o => o.status === 'pending_stockin').length;
  document.getElementById('kpi-pending-purchase').textContent = pendingPurchase;

  // 待确认入库数（同待处理采购单，入库前都是待确认）
  document.getElementById('kpi-pending-stockin').textContent = pendingPurchase;

  // 低库存预警
  const items = inventory.length > 0 ? inventory : mockData.items;
  document.getElementById('kpi-low-stock').textContent = items.filter(item => item.stock < (item.safety_stock || 10)).length;

  // 待确认出库
  let reqList = _appCache.requisitions ? _appCache.requisitions : [];
  const pendingOutbound = reqList.filter(r => r.status === 'pending_outbound').length;
  const pendingOutboundEl = document.getElementById('kpi-pending-outbound');
  if (pendingOutboundEl) pendingOutboundEl.textContent = pendingOutbound;
}

/**
 * 统计低库存物品数量
 */
function countLowStock() {
  return mockData.items.filter(item => item.stock < item.safety_stock).length;
}

/**
 * 加载趋势图表
 */
function loadTrendChart() {
  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;
  
  // 销毁旧图表
  if (trendChart) {
    trendChart.destroy();
  }
  
  // 生成模拟数据
  const labels = generateDateLabels(30);
  const inData = generateRandomData(30, 10, 100);
  const outData = generateRandomData(30, 5, 80);
  
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '入库',
          data: inData,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(90,158,111,0.08)',
          tension: 0.4,
          fill: true
        },
        {
          label: '出库',
          data: outData,
          borderColor: '#e7000b',
          backgroundColor: 'rgba(207,92,92,0.08)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#5c5060' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(168,158,169,0.3)' },
          ticks: { color: '#a89ea9' }
        },
        y: {
          grid: { color: 'rgba(168,158,169,0.3)' },
          ticks: { color: '#a89ea9' }
        }
      }
    }
  });
}

/**
 * 加载分类占比图表
 */
function loadCategoryChart() {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;
  
  // 销毁旧图表
  if (categoryChart) {
    categoryChart.destroy();
  }
  
  // 统计各分类物品数量
  const categories = {};
  mockData.items.forEach(item => {
    categories[item.category] = (categories[item.category] || 0) + 1;
  });
  
  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(categories),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: [
          '#ec003f',
          '#ff2056',
          '#c70036',
          '#ffa1ad',
          '#7c3aed',
          '#0284c7'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#5c5060' }
        }
      }
    }
  });
}

/**
 * 加载最近动态
 */
function loadRecentActivities() {
  const container = document.getElementById('recent-activities');
  if (!container) return;
  
  // 这里应该从数据库加载真实数据
  // 目前显示静态内容
}

/**
 * 加载库存列表 - 按分类分块展示
 */
let _invBatchMode = false;
let _invSupplementMode = false;

async function loadInventory(skipSupabaseFetch) {
  const container = document.getElementById('inventory-container');
  if (!container) return;

  // 尝试从 Supabase 拉取实时库存（云端优先），失败则回退到缓存
  // 参数 skipSupabaseFetch=true 时跳过云端拉取，直接使用 _appCache 缓存
  let items = [];
  if (!skipSupabaseFetch) {
    try {
      if (typeof SupaDB !== 'undefined' && SupaDB.getInventory) {
        const filterCat = document.getElementById('filter-category')?.value || '';
        const filterStatus = document.getElementById('filter-status')?.value || '';
        const filters = {};
        if (filterCat) filters.category = filterCat;
        items = await SupaDB.getInventory(filters);
        console.log('从 Supabase 获取库存项:', items.length);
        // 同步更新 _appCache.inventory，确保缓存与界面数据一致
        if (items && items.length > 0) {
          _appCache.inventory = JSON.parse(JSON.stringify(items));
        }
      }
    } catch (e) {
      console.warn('从 Supabase 获取库存失败，回退到本地缓存：', e.message);
      items = [];
    }
  }

  // 若云端没数据则读取 _appCache
  if (!items || items.length === 0) {
    items = _appCache.inventory ? _appCache.inventory.slice() : [];
  } else {
    // 合并本地缓存物品（入库生成的本地物品可能云端还没有）
    try {
      const localItems = _appCache.inventory ? _appCache.inventory : [];
      localItems.forEach(function(localItem) {
          // 如果 Supabase 结果中不存在该物品（按 name+code 匹配），则追加
          var exists = items.some(function(si) {
            return si.code && localItem.code && si.code === localItem.code;
          }) || items.some(function(si) {
            return si.name === localItem.name && si.brand === (localItem.brand || '') && si.model === (localItem.model || '');
          });
          if (!exists) items.push(localItem);
        });
    } catch(e) { console.warn('合并本地库存失败', e.message); }
  }

  // 如果仍无数据，使用模拟数据
  if (!items || items.length === 0) items = mockData.items;

  // 归一化字段名：兼容 Supabase category_name 和前端 category
  items.forEach(function(it) {
    if (!it.category && it.category_name) it.category = it.category_name;
    if (!it.category_name && it.category) it.category_name = it.category;
  });

  // 先从全量数据构建分类下拉（不受筛选影响）
  const allCategories = {};
  items.forEach(item => {
    const cat = item.category || '未分类';
    allCategories[cat] = true;
  });
  const filterCatSelect = document.getElementById('filter-category');
  if (filterCatSelect) {
    const currentVal = filterCatSelect.value;
    const catNames = Object.keys(allCategories).sort();
    filterCatSelect.innerHTML = '<option value="">全部分类</option>' +
      catNames.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
  }

  // 读取筛选条件
  const filterCat = document.getElementById('filter-category')?.value || '';
  const filterStatus = document.getElementById('filter-status')?.value || '';

  // 应用分类筛选
  if (filterCat) {
    items = items.filter(item => (item.category || '未分类') === filterCat);
  }

  // 应用状态筛选
  if (filterStatus) {
    items = items.filter(item => {
      const s = getStockStatus(item);
      if (filterStatus === 'normal') return s.text === '正常';
      if (filterStatus === 'low') return s.text === '低库存';
      if (filterStatus === 'out') return s.text === '缺货';
      return true;
    });
  }

  // 应用模糊搜索
  var searchText = (document.getElementById('inv-search-input')?.value || '').trim().toLowerCase();
  if (searchText) {
    items = items.filter(function(item) {
      return (item.name || '').toLowerCase().includes(searchText) ||
             (item.code || '').toLowerCase().includes(searchText) ||
             (item.brand || '').toLowerCase().includes(searchText) ||
             (item.model || '').toLowerCase().includes(searchText);
    });
  }

  // 更新一键购买按钮状态（只有采购权限的角色可见）
  const batchBtn = document.getElementById('inv-batch-purchase-btn');
  if (batchBtn) {
    if (!hasPermission('create_purchase')) {
      batchBtn.style.display = 'none';
    } else {
      batchBtn.style.display = '';
      batchBtn.textContent = _invBatchMode ? '取消购买' : '一键购买';
      batchBtn.className = _invBatchMode ? 'btn btn-danger' : 'btn';
    }
  }

  // 更新补充信息按钮状态
  const suppBtn = document.getElementById('inv-supplement-btn');
  if (suppBtn) {
    if (!hasPermission('supplement_info')) {
      suppBtn.style.display = 'none';
    } else {
      suppBtn.style.display = '';
      suppBtn.textContent = _invSupplementMode ? '完成补充' : '补充信息';
      suppBtn.className = _invSupplementMode ? 'btn btn-accent' : 'btn';
    }
  }

  // 在补充信息模式下隐藏新增物品按钮
  const addItemBtn = document.getElementById('add-item-btn');
  if (addItemBtn) {
    addItemBtn.style.display = _invSupplementMode ? 'none' : '';
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted);">暂无数据</div>';
    return;
  }

  // 补充信息模式：显示扁平可编辑表格
  if (_invSupplementMode) {
    _renderSupplementTable(container, items);
    return;
  }

  // 按分类分组
  const grouped = {};
  items.forEach(item => {
    const cat = item.category || '未分类';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  // 分类图标映射
  const catIcons = {
    '循环使用类': '🔄', '消耗类': '📦', '其他': '📁',
    '饮品': '🥤', '食品': '🍜', '日用品': '🧴', '电子': '🔌',
    '文具': '✏️', '清洁': '🧹', '工具': '🔧', '未分类': '📦'
  };

  const categoryNames = Object.keys(grouped).sort();
  // 构建采购中数量映射：按物品名称汇总所有待入库采购单的数量
  const _pendingMap = {};
  try {
    const _poData = _appCache.purchaseOrders ? _appCache.purchaseOrders : [];
    _poData.filter(po => po.status === 'pending_stockin').forEach(po => {
      (po.items || []).forEach(it => {
        const key = it.name || '';
        if (!key) return;
        if (!_pendingMap[key]) _pendingMap[key] = [];
        _pendingMap[key].push({
          poCode: po.code,
          poId: po.id,
          poDate: po.purchase_date,
          purchaser: po.purchaser || '-',
          supplier: it.supplier || '-',
          quantity: it.quantity || 0,
          unit: it.unit || '',
          price: it.price || 0,
          amount: it.amount || 0
        });
      });
    });
  } catch(e) { /* ignore parse error */ }

  const checkboxTh = _invBatchMode ? '<th style="width:30px;"><input type="checkbox" id="inv-selectall" onchange="_invToggleAll(this.checked)" checked></th>' : '';
  // 定义统一的表头列（标题全部居中）
  var unifiedHeaders = '<tr>' + checkboxTh +
    '<th>物品编号</th>' +
    '<th>物品名称</th>' +
    '<th>品牌</th>' +
    '<th>型号</th>' +
    '<th>单位</th>' +
    '<th>单价</th>' +
    '<th>库存</th>' +
    '<th>金额</th>' +
    '<th>状态</th>' +
    '<th>采购中</th>' +
    '<th>操作</th>' +
  '</tr>';

  // 构建单表 HTML：用分类分隔行替代多个独立表格
  var singleTableHtml = '<div class="inventory-unified-table"><table class="data-table">' +
    '<colgroup>' +
      (_invBatchMode ? '<col style="width:36px;">' : '') +
      '<col style="width:11%;">' +
      '<col style="width:17%;">' +
      '<col style="width:8%;">' +
      '<col style="width:9%;">' +
      '<col style="width:6%;">' +
      '<col style="width:9%;">' +
      '<col style="width:7%;">' +
      '<col style="width:9%;">' +
      '<col style="width:8%;">' +
      '<col style="width:8%;">' +
      '<col style="width:8%;">' +
    '</colgroup>' +
    '<thead>' + unifiedHeaders + '</thead>' +
    '<tbody>';

  categoryNames.forEach(function(catName) {
    const catItems = grouped[catName];
    const totalStock = catItems.reduce((sum, it) => sum + (it.stock || 0), 0);
    const lowStockCount = catItems.filter(it => it.stock < (it.safety_stock || 10)).length;
    const icon = catIcons[catName] || '📁';

    // 分类分隔行
    singleTableHtml += '<tr class="category-separator-row"><td colspan="' + (_invBatchMode ? 12 : 11) + '">' +
      '<div class="category-separator-inner">' +
        '<span class="category-separator-icon">' + icon + '</span>' +
        '<span class="category-separator-name">' + catName + '</span>' +
        '<span class="category-separator-stats">' + catItems.length + ' 种物品 · 库存 ' + totalStock + ' 件</span>' +
        (lowStockCount > 0 ? '<span class="status-badge warning" style="margin-left:8px;font-size:11px;">' + lowStockCount + ' 项低库存</span>' : '') +
      '</div>' +
    '</td></tr>';

    catItems.forEach(function(item) {
      const status = getStockStatus(item);
      const canEdit = hasPermission('edit_inventory') || hasPermission('inventory.adjust') || hasPermission('inventory.edit');
      const unitPrice = item.unit_price || 0;
      const amount = (item.stock || 0) * unitPrice;
      const checkboxTd = _invBatchMode
        ? '<td><input type="checkbox" class="inv-batch-cb" data-item-id="' + item.id + '" data-item-name="' + (item.name || '').replace(/"/g, '&quot;') + '" data-item-cat="' + (item.category || '').replace(/"/g, '&quot;') + '" data-item-brand="' + (item.brand || '').replace(/"/g, '&quot;') + '" data-item-model="' + (item.model || '').replace(/"/g, '&quot;') + '" data-item-unit="' + (item.unit || '') + '" data-item-code="' + (item.code || '') + '" data-item-safety="' + (item.safety_stock || 10) + '" data-item-stock="' + (item.stock || 0) + '" checked></td>'
        : '';
      singleTableHtml += '<tr>' +
        checkboxTd +
        '<td class="cell-code">' + item.code + '</td>' +
        '<td class="cell-name">' + item.name + '</td>' +
        '<td>' + (item.brand || '-') + '</td>' +
        '<td>' + (item.model || '-') + '</td>' +
        '<td>' + item.unit + '</td>' +
        '<td class="cell-number">¥' + Number(unitPrice).toFixed(2) + '</td>' +
        '<td class="cell-number"><span style="font-weight:600;color:' + (item.stock < (item.safety_stock || 10) ? 'var(--danger)' : 'var(--text-primary)') + '">' + item.stock + '</span></td>' +
        '<td class="cell-number" style="font-weight:600;color:var(--accent);">¥' + amount.toFixed(2) + '</td>' +
        '<td><span class="status-badge ' + status.class + '">' + status.text + '</span></td>' +
        '<td class="cell-center">' + (function() {
          const pending = _pendingMap[item.name];
          if (!pending || pending.length === 0) return '<span style="color:var(--text-muted);font-size:12px;">-</span>';
          const totalQty = pending.reduce(function(s, p) { return s + p.quantity; }, 0);
          return '<span class="pending-qty-badge" onclick="event.stopPropagation();_showPendingPopover(this,\'' + (item.name || '').replace(/'/g, "\\'") + '\')" title="点击查看采购明细">' + totalQty + '</span>';
        })() + '</td>' +
        '<td>' + (canEdit ? '<button class="btn btn-sm" onclick="editItem(' + item.id + ')">编辑</button>' : '<span style="color:var(--text-muted);font-size:12px;">-</span>') + '</td>' +
      '</tr>';
    });
  });

  singleTableHtml += '</tbody></table></div>';
  container.innerHTML = singleTableHtml;

  // 批量模式底部操作栏
  if (_invBatchMode) {
    container.innerHTML += `
      <div id="inv-batch-bar" style="
        position:sticky;bottom:0;left:0;right:0;z-index:10;
        background:#ffffff;border:2px solid var(--accent);border-top:3px solid var(--accent);
        border-radius:var(--sketch-r1);box-shadow:var(--shadow-elevated);
        padding:14px 20px;margin-top:16px;
        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;
      ">
        <div style="display:flex;align-items:center;gap:10px;">
          <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
            <input type="checkbox" id="inv-selectall-bottom" onchange="_invToggleAll(this.checked)" checked> 全选
          </label>
          <span id="inv-batch-count" style="font-size:13px;color:var(--text-muted);">已选中 ${items.length} 项</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn" onclick="_invToggleBatchMode()">取消</button>
          <button class="btn btn-accent" onclick="_invBatchPurchase()">一键采购选中项</button>
        </div>
      </div>`;

    // 绑定复选框计数
    setTimeout(() => {
      document.querySelectorAll('.inv-batch-cb').forEach(cb => {
        cb.addEventListener('change', _invUpdateBatchCount);
      });
    }, 50);
  }

  // 更新仪表盘的库存物品数
  const kpiTotal = document.getElementById('kpi-total-items');
  if (kpiTotal) kpiTotal.textContent = items.length;
}

/* --- 库存概览批量采购相关 --- */

function _invToggleBatchMode() {
  _invBatchMode = !_invBatchMode;
  loadInventory();
}

function _invToggleAll(checked) {
  document.querySelectorAll('.inv-batch-cb').forEach(cb => cb.checked = checked);
  const sa1 = document.getElementById('inv-selectall');
  const sa2 = document.getElementById('inv-selectall-bottom');
  if (sa1) sa1.checked = checked;
  if (sa2) sa2.checked = checked;
  _invUpdateBatchCount();
}

function _invUpdateBatchCount() {
  const count = document.querySelectorAll('.inv-batch-cb:checked').length;
  const el = document.getElementById('inv-batch-count');
  if (el) el.textContent = `已选中 ${count} 项`;
}

function _invBatchPurchase() {
  const checkboxes = document.querySelectorAll('.inv-batch-cb:checked');
  if (checkboxes.length === 0) {
    showToast('请至少勾选一项物品', 'warning');
    return;
  }

  const selectedItems = [];
  checkboxes.forEach(cb => {
    const stock = parseInt(cb.dataset.itemStock) || 0;
    const safety = parseInt(cb.dataset.itemSafety) || 10;
    const gap = safety - stock;
    const suggestQty = Math.max(gap > 0 ? gap * 2 : safety, 10);

    selectedItems.push({
      name: cb.dataset.itemName,
      category: cb.dataset.itemCat || '未分类',
      code: cb.dataset.itemCode || '',
      brand: cb.dataset.itemBrand || '',
      model: cb.dataset.itemModel || '',
      quantity: suggestQty,
      unit: cb.dataset.itemUnit || '',
      price: 0,
      amount: 0
    });
  });

  // 退出批量模式
  _invBatchMode = false;

  // 切换到采购模块
  if (typeof switchModule === 'function') switchModule('purchase');

  setTimeout(() => {
    if (typeof openNewPurchaseModal !== 'function') return;
    openNewPurchaseModal();
    setTimeout(() => {
      _kpiFillPurchaseForm(selectedItems);
    }, 200);
  }, 150);
}

/* --- 库存概览补充信息模式相关 --- */

function toggleInvSupplementMode() {
  if (_invSupplementMode) {
    _saveInvSupplement();
    return;
  }
  _invSupplementMode = true;
  loadInventory();
}

function _renderSupplementTable(container, items) {
  var catOptions = '';
  if (typeof categories !== 'undefined' && categories.length > 0) {
    catOptions = categories.map(function(c) { return '<option value="' + c.name + '">' + c.name + '</option>'; }).join('');
  } else {
    catOptions = '<option value="未分类">未分类</option><option value="循环使用类">循环使用类</option><option value="消耗类">消耗类</option>';
  }

  var html = '<div style="margin-bottom:12px;padding:10px 16px;background:var(--accent-glow);border-radius:8px;font-size:13px;color:var(--text-secondary);">✏️ 补充信息模式 — 可编辑分类、品牌、型号、单位、单价，库存数量不可修改</div>';
  html += '<div class="table-scroll"><table class="data-table" id="supplement-table"><thead><tr>';
  html += '<th style="width:30px;">#</th><th>物品编号</th><th>物品名称</th>';
  html += '<th style="min-width:120px;">分类</th><th style="min-width:100px;">品牌</th><th style="min-width:100px;">型号</th><th style="min-width:70px;">单位</th><th style="min-width:80px;">单价</th>';
  html += '<th>库存</th><th>状态</th>';
  html += '</tr></thead><tbody>';

  items.forEach(function(item, idx) {
    var status = getStockStatus(item);
    html += '<tr>';
    html += '<td style="text-align:center;color:var(--text-muted);font-size:12px;">' + (idx + 1) + '</td>';
    html += '<td style="font-family:monospace;font-size:12px;color:var(--text-muted);">' + (item.code || '-') + '</td>';
    html += '<td style="font-weight:600;">' + item.name + '</td>';
    html += '<td><select class="supp-edit-cat" data-item-id="' + item.id + '" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"><option value="">未分类</option>' + catOptions + '</select></td>';
    html += '<td><input type="text" class="supp-edit-brand" data-item-id="' + item.id + '" value="' + (item.brand || '').replace(/"/g, '&quot;') + '" placeholder="品牌" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="text" class="supp-edit-model" data-item-id="' + item.id + '" value="' + (item.model || '').replace(/"/g, '&quot;') + '" placeholder="型号" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="text" class="supp-edit-unit" data-item-id="' + item.id + '" value="' + (item.unit || '').replace(/"/g, '&quot;') + '" placeholder="单位" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="number" class="supp-edit-price" data-item-id="' + item.id + '" value="' + (item.unit_price || 0) + '" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;text-align:right;"></td>';
    html += '<td><span style="font-weight:600;color:' + (item.stock < (item.safety_stock || 10) ? 'var(--danger)' : 'var(--text-primary)') + '">' + item.stock + '</span></td>';
    html += '<td><span class="status-badge ' + status.class + '">' + status.text + '</span></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  html += '<div id="inv-supplement-bar" style="position:sticky;bottom:0;left:0;right:0;z-index:10;background:#ffffff;border:2px solid var(--accent);border-top:3px solid var(--accent);border-radius:var(--sketch-r1);box-shadow:var(--shadow-elevated);padding:14px 20px;margin-top:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">';
  html += '<div style="font-size:13px;color:var(--text-muted);"><span id="supp-changed-count">0</span> 项已修改</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<button class="btn" onclick="_cancelInvSupplement()">取消</button>';
  html += '<button class="btn btn-accent" onclick="_saveInvSupplement()">保存补充信息</button>';
  html += '</div></div>';

  container.innerHTML = html;

  setTimeout(function() {
    items.forEach(function(item) {
      var catSelect = container.querySelector('.supp-edit-cat[data-item-id="' + item.id + '"]');
      if (catSelect && item.category) {
        catSelect.value = item.category;
      }
      [].forEach.call(container.querySelectorAll('[data-item-id="' + item.id + '"]'), function(inp) {
        inp.addEventListener('change', _suppUpdateChangeCount);
        inp.addEventListener('input', _suppUpdateChangeCount);
      });
    });
  }, 50);

  container._suppOriginalItems = JSON.parse(JSON.stringify(items));
}

function _suppUpdateChangeCount() {
  var container = document.getElementById('inventory-container');
  if (!container) return;
  var countEl = document.getElementById('supp-changed-count');
  if (!countEl) return;

  var changed = 0;
  var originalItems = container._suppOriginalItems || [];

  originalItems.forEach(function(item) {
    var catEl = container.querySelector('.supp-edit-cat[data-item-id="' + item.id + '"]');
    var brandEl = container.querySelector('.supp-edit-brand[data-item-id="' + item.id + '"]');
    var modelEl = container.querySelector('.supp-edit-model[data-item-id="' + item.id + '"]');
    var unitEl = container.querySelector('.supp-edit-unit[data-item-id="' + item.id + '"]');
    var priceEl = container.querySelector('.supp-edit-price[data-item-id="' + item.id + '"]');
    if (!catEl && !brandEl && !modelEl && !unitEl && !priceEl) return;

    var newCat = catEl ? catEl.value : (item.category || '');
    var newBrand = brandEl ? brandEl.value : (item.brand || '');
    var newModel = modelEl ? modelEl.value : (item.model || '');
    var newUnit = unitEl ? unitEl.value : (item.unit || '');
    var newPrice = priceEl ? Number(priceEl.value || 0) : (item.unit_price || 0);

    if (newCat !== (item.category || '') ||
        newBrand !== (item.brand || '') ||
        newModel !== (item.model || '') ||
        newUnit !== (item.unit || '') ||
        newPrice !== (item.unit_price || 0)) {
      changed++;
    }
  });

  countEl.textContent = changed;
}

async function _saveInvSupplement() {
  var container = document.getElementById('inventory-container');
  if (!container) return;

  var changedItems = []; // 收集所有改动 { id, data }
  var errors = [];

  // 第一步：遍历 DOM，收集所有改动
  [].forEach.call(container.querySelectorAll('.supp-edit-cat'), function(catEl) {
    var itemId = parseFloat(catEl.dataset.itemId);
    var brandEl = container.querySelector('.supp-edit-brand[data-item-id="' + itemId + '"]');
    var modelEl = container.querySelector('.supp-edit-model[data-item-id="' + itemId + '"]');
    var unitEl = container.querySelector('.supp-edit-unit[data-item-id="' + itemId + '"]');
    var priceEl = container.querySelector('.supp-edit-price[data-item-id="' + itemId + '"]');

    // 从缓存中获取原始值
    var origItem = null;
    if (container._suppOriginalItems) {
      origItem = container._suppOriginalItems.find(function(i) { return Number(i.id) === Number(itemId); });
    }
    if (!origItem && _appCache.inventory) {
      origItem = _appCache.inventory.find(function(i) { return Number(i.id) === Number(itemId); });
    }

    var newCat = catEl.value.trim() || '未分类';
    var newBrand = brandEl ? brandEl.value.trim() : '';
    var newModel = modelEl ? modelEl.value.trim() : '';
    var newUnit = unitEl ? unitEl.value.trim() : '';
    var newPrice = priceEl ? Number(priceEl.value || 0) : 0;

    // 判断是否有实质性修改
    if (origItem) {
      if (origItem.category === newCat &&
          (origItem.brand || '') === newBrand &&
          (origItem.model || '') === newModel &&
          (origItem.unit || '') === newUnit &&
          (origItem.unit_price || 0) === newPrice) {
        return; // 无变化，跳过
      }
    }

    changedItems.push({
      id: itemId,
      data: {
        category_name: newCat,
        brand: newBrand,
        model: newModel,
        unit: newUnit,
        unit_price: newPrice
      }
    });
  });

  if (changedItems.length === 0) {
    showToast('未检测到修改', 'info');
    _invSupplementMode = false;
    loadInventory(true);
    return;
  }

  // 第二步：逐个写入 Supabase 数据库（直接持久化）
  var successCount = 0;
  for (var i = 0; i < changedItems.length; i++) {
    var ci = changedItems[i];
    try {
      if (typeof SupaDB !== 'undefined' && SupaDB.updateInventoryItem) {
        console.log('写入数据库: itemId=' + ci.id, ci.data);
        await SupaDB.updateInventoryItem(ci.id, ci.data);
        successCount++;
      } else {
        // SupaDB 不可用，记录错误
        errors.push('SupaDB 不可用');
        break;
      }
    } catch (e) {
      console.warn('写入数据库失败 itemId=' + ci.id + ': ' + e.message);
      errors.push('物品#' + ci.id + ': ' + e.message);
    }
  }

  // 第三步：更新本地缓存（仅对成功写入的数据）
  if (successCount > 0 && _appCache.inventory) {
    var inv = JSON.parse(JSON.stringify(_appCache.inventory));
    changedItems.forEach(function(ci) {
      var idx = inv.findIndex(function(i) { return Number(i.id) === Number(ci.id); });
      if (idx >= 0) {
        inv[idx].category_name = ci.data.category_name;
        inv[idx].category = ci.data.category_name;  // 前端本地属性
        inv[idx].brand = ci.data.brand;
        inv[idx].model = ci.data.model;
        inv[idx].unit = ci.data.unit;
        inv[idx].unit_price = ci.data.unit_price;
      }
    });
    _appCache.inventory = inv;
  }

  // 第四步：全部成功则从云端刷新，部分失败则保留本地缓存
  var allSuccess = errors.length === 0;
  if (allSuccess && successCount > 0) {
    try {
      if (typeof refreshData === 'function') {
        await refreshData('inventory');
        console.log('云端刷新完成');
      }
    } catch (e) {
      console.warn('云端刷新失败: ' + e.message);
    }
  }

  // 第五步：反馈 + 重新渲染
  var msg;
  if (allSuccess) {
    msg = '已保存 ' + successCount + ' 项到数据库';
    showToast(msg, 'success');
  } else if (successCount > 0) {
    msg = '部分保存成功: ' + successCount + ' 项写入数据库，' + errors.length + ' 项失败';
    showToast(msg, 'warning');
  } else {
    msg = '保存失败，无法连接到数据库';
    showToast(msg, 'error');
  }
  console.log(msg, errors.length > 0 ? errors : '');

  _invSupplementMode = false;
  // 全部成功 → 从云端渲染；部分失败 → 从本地缓存渲染（保留修改）
  loadInventory(!allSuccess);
}

function _cancelInvSupplement() {
  _invSupplementMode = false;
  loadInventory();
}

/**
 * 显示采购中物品的气泡弹窗
 */
function _showPendingPopover(el, itemName) {
  // 关闭已有气泡
  _closePendingPopover();

  const poData = _appCache.purchaseOrders ? _appCache.purchaseOrders : [];
  const pending = [];
  poData.filter(po => po.status === 'pending_stockin').forEach(po => {
    (po.items || []).forEach(it => {
      if (it.name === itemName) {
        pending.push({
          poCode: po.code,
          poDate: po.purchase_date,
          purchaser: po.purchaser || '-',
          supplier: it.supplier || '-',
          quantity: it.quantity || 0,
          unit: it.unit || '',
          price: it.price || 0,
          amount: it.amount || 0
        });
      }
    });
  });

  if (pending.length === 0) return;

  const totalQty = pending.reduce((s, p) => s + p.quantity, 0);

  let html = `<div class="pending-popover-arrow"></div>
    <div class="pending-popover-header">
      <span class="pending-popover-title">${itemName}</span>
      <span class="pending-popover-total">采购中 ${totalQty} ${pending[0].unit || '件'}</span>
      <button class="pending-popover-close" onclick="_closePendingPopover()">&times;</button>
    </div>
    <div class="pending-popover-body">
      <table class="pending-popover-table">
        <thead><tr><th>采购单号</th><th>供应商</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
        <tbody>`;
  pending.forEach(p => {
    html += `<tr>
      <td style="font-family:monospace;font-size:11px;">${p.poCode}</td>
      <td>${p.supplier}</td>
      <td style="font-weight:600;">${p.quantity} ${p.unit}</td>
      <td>¥${p.price.toFixed(2)}</td>
      <td style="font-weight:600;">¥${p.amount.toFixed(2)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  const popover = document.createElement('div');
  popover.id = 'pending-popover';
  popover.className = 'pending-popover';
  popover.innerHTML = html;
  document.body.appendChild(popover);

  // 定位：在元素正下方
  const rect = el.getBoundingClientRect();
  const popW = 420;
  let left = rect.left + rect.width / 2 - popW / 2;
  if (left < 10) left = 10;
  if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
  popover.style.left = left + 'px';
  popover.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  popover.style.width = popW + 'px';

  // 动画入场
  requestAnimationFrame(() => popover.classList.add('show'));

  // 点击其他区域关闭
  setTimeout(() => {
    document.addEventListener('click', _pendingPopoverOutsideClick);
  }, 10);
}

function _closePendingPopover() {
  const el = document.getElementById('pending-popover');
  if (el) el.remove();
  document.removeEventListener('click', _pendingPopoverOutsideClick);
}

function _pendingPopoverOutsideClick(e) {
  const popover = document.getElementById('pending-popover');
  if (popover && !popover.contains(e.target)) {
    _closePendingPopover();
  }
}

/**
 * 获取库存状态
 */
function getStockStatus(item) {
  if (item.stock === 0) {
    return { text: '缺货', class: 'danger' };
  } else if (item.stock < item.safety_stock) {
    return { text: '低库存', class: 'warning' };
  } else {
    return { text: '正常', class: 'success' };
  }
}

/**
 * 加载采购单列表
 * 注意：实际实现在 purchase.js 中，此处不再重复定义以免覆盖
 */

/**
 * 加载入库记录
 * 注意：实际实现在 stock-in.js 和 purchase.js 中，此处不再重复定义以免覆盖
 */

/**
 * 加载领用单列表 - 实际实现在 requisition.js 中
 */

/**
 * 加载出库记录 - 实际实现在 requisition.js 中
 */

/**
 * 加载报表数据
 */
// loadReports 已迁移到 tour-reports.js，此处不再定义

/**
 * 绑定模态框事件
 */
function bindModalEvents() {
  // 关闭按钮
  const closeButtons = document.querySelectorAll('.modal-close, .modal-cancel');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      
      // 找到当前按钮所属的模态框
      const modalContent = btn.closest('.modal-content');
      if (modalContent) {
        const modal = modalContent.parentElement;
        modal.classList.remove('show');
      }
    });
  });
  
  // 点击模态框外部关闭
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  });

  // ESC 键关闭所有弹窗（模态框 + confirm/prompt 遮罩层）
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // 优先关闭自定义 confirm/prompt 遮罩层（它们层级更高）
      const confirmOverlay = document.getElementById('custom-confirm-overlay');
      if (confirmOverlay && confirmOverlay.classList.contains('show')) {
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        if (cancelBtn) cancelBtn.click();
        e.preventDefault();
        return;
      }
      const promptOverlay = document.getElementById('custom-prompt-overlay');
      if (promptOverlay && promptOverlay.classList.contains('show')) {
        const cancelBtn = document.getElementById('prompt-cancel-btn');
        if (cancelBtn) cancelBtn.click();
        e.preventDefault();
        return;
      }
      // 关闭普通模态框
      const openModals = document.querySelectorAll('.modal.show');
      if (openModals.length > 0) {
        closeModal();
        e.preventDefault();
      }
    }
  });
}

/**
 * 关闭模态框
 */
function closeModal() {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modal.classList.remove('show');
  });
}

/**
 * 打开模态框
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
  }
}

/**
 * 设置默认月份为当前月
 */
function setDefaultMonth() {
  const monthInput = document.getElementById('report-month');
  if (monthInput) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${year}-${month}`;
  }
}

/**
 * 生成日期标签数组
 */
function generateDateLabels(days) {
  const labels = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
  }
  return labels;
}

/**
 * 生成随机数据数组
 */
function generateRandomData(count, min, max) {
  return Array.from({ length: count }, () => 
    Math.floor(Math.random() * (max - min + 1)) + min
  );
}

/**
 * 填充品类下拉选项（从全局 categories 数组同步）
 */
function _populateCategorySelect(selectEl) {
  if (!selectEl) return;
  const cats = (typeof categories !== 'undefined' && Array.isArray(categories)) ? categories : [];
  const currentVal = selectEl.value;
  selectEl.innerHTML = '<option value="">请选择</option>' +
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (currentVal) selectEl.value = currentVal;
}

/**
 * 编辑物品（支持手工调整并生成调整记录）
 */
function editItem(itemId) {
  // 从 _appCache 中查找（兼容 mockData 查找作为兜底）
  const inventory = _appCache.inventory ? _appCache.inventory : [];
  let item = inventory.find(i => String(i.id) === String(itemId));
  if (!item && typeof mockData !== 'undefined') {
    item = mockData.items.find(i => String(i.id) === String(itemId));
  }
  if (!item) {
    if (typeof showToast === 'function') {
      showToast('未找到该物品，可能已被删除', 'warning');
    } else {
      alert('未找到物品');
    }
    return;
  }

  // 权限检查（保持与按钮显示逻辑一致）
  if (!hasPermission('inventory.adjust') && !hasPermission('inventory.edit') && !hasPermission('edit_inventory') && !hasPermission('all')) {
    if (typeof showToast === 'function') {
      showToast('您没有权限修改库存信息', 'warning');
    } else {
      alert('您没有权限修改库存信息');
    }
    return;
  }

  document.getElementById('modal-item-title').textContent = '编辑物品';
  const form = document.getElementById('item-form');
  form.elements['name'].value = item.name || '';
  form.elements['code'].value = item.code || '';
  // 填充品类下拉选项
  _populateCategorySelect(form.elements['category']);
  form.elements['category'].value = item.category || '';
  form.elements['unit'].value = item.unit || '';
  form.elements['stock'].value = item.stock || 0;
  form.elements['safety_stock'].value = item.safety_stock || 0;
  if (form.elements['unit_price']) form.elements['unit_price'].value = item.unit_price || 0;

  openModal('modal-item');

  // 添加删除按钮（仅在编辑模式下显示）
  var deleteBtn = document.getElementById('modal-item-delete-btn');
  if (!deleteBtn) {
    var footer = document.querySelector('#modal-item .modal-footer');
    if (footer) {
      deleteBtn = document.createElement('button');
      deleteBtn.id = 'modal-item-delete-btn';
      deleteBtn.textContent = '🗑 删除物品';
      deleteBtn.style.cssText = 'background:var(--danger);color:#fff;border:none;border-radius:var(--sketch-r1);padding:8px 16px;cursor:pointer;font-size:13px;margin-right:auto;';
      footer.insertBefore(deleteBtn, footer.firstChild);
    }
  }
  if (deleteBtn) deleteBtn.style.display = '';
  var newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  newDeleteBtn.addEventListener('click', function() {
    if (confirm('确认要删除 "' + (item.name || '') + '" 吗？此操作不可恢复！')) {
      // 从 _appCache 删除
      var inv = _appCache.inventory ? _appCache.inventory.slice() : [];
      var idx = inv.findIndex(function(i) { return String(i.id) === String(item.id); });
      if (idx >= 0) {
        inv.splice(idx, 1);
        _appCache.inventory = inv;
      }
      // 从 mockData 删除
      if (typeof mockData !== 'undefined') {
        var mi = mockData.items.findIndex(function(i) { return String(i.id) === String(item.id); });
        if (mi >= 0) mockData.items.splice(mi, 1);
      }
      loadInventory();
      closeModal();
      if (typeof showToast === 'function') showToast('已删除：' + item.name, 'info');
    }
  });

  // 绑定保存（替换按钮以清除旧事件）
  const saveBtn = document.querySelector('#modal-item .modal-save');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener('click', function onSave() {
    try {
      const newStock = Number(form.elements['stock'].value || 0);
      const newSafety = Number(form.elements['safety_stock'].value || 0);
      const delta = newStock - (item.stock || 0);

      // 更新物品数据
      item.name = form.elements['name'].value.trim();
      item.code = form.elements['code'].value.trim();
      item.category = form.elements['category'].value;
      item.category_name = form.elements['category'].value;  // 兼容 Supabase
      item.unit = form.elements['unit'].value.trim();
      item.stock = newStock;
      item.safety_stock = newSafety;
      item.unit_price = Number(form.elements['unit_price']?.value || 0);

      // 写回 _appCache
      const inv = _appCache.inventory ? _appCache.inventory.slice() : [];
      const idx = inv.findIndex(i => String(i.id) === String(item.id));
      if (idx >= 0) {
        inv[idx] = item;
      } else {
        inv.push(item);
      }
      _appCache.inventory = inv;
      // 同步更新 mockData（兼容旧代码）
      if (typeof mockData !== 'undefined') {
        const mi = mockData.items.findIndex(i => String(i.id) === String(item.id));
        if (mi >= 0) mockData.items[mi] = item;
      }

      // 记录调整
      const adj = {
        id: item.id,
        inventory_item_id: item.id,
        item_code: item.code,
        delta: delta,
        new_stock: newStock,
        reason: '手工调整',
        created_by: (getCurrentUser() ? getCurrentUser().username : 'system'),
        created_at: new Date().toISOString()
      };
      const arr = _appCache.inventoryAdjustments ? _appCache.inventoryAdjustments.slice() : [];
      arr.push(adj);
      _appCache.inventoryAdjustments = arr;

      loadInventory();
      closeModal();
      if (typeof showToast === 'function') showToast('保存成功（已记录调整）','success');
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('保存失败：' + e.message, 'error');
      else alert('保存失败：' + e.message);
    }
  });
}

/**
 * 动态注入月度汇总模块（导航项 + 页面面板）
 * 解决 file:// 协议下 HTML 页面被浏览器缓存的问题
 */
function _injectMonthlySummaryModule() {
  // 1. 注入导航项（如果不存在）
  if (!document.querySelector('[data-module="monthly-summary"]')) {
    const reportsNav = document.querySelector('[data-module="reports"]');
    if (reportsNav) {
      const navItem = document.createElement('div');
      navItem.className = 'nav-item';
      navItem.dataset.module = 'monthly-summary';
      navItem.innerHTML = '<span class="icon">📊</span><span class="text">月度汇总</span>';
      reportsNav.parentElement.insertBefore(navItem, reportsNav);
      // 绑定点击事件
      navItem.addEventListener('click', () => {
        if (typeof switchModule === 'function') switchModule('monthly-summary');
      });
    }
  }

  // 2. 注入页面面板（如果不存在）
  if (!document.getElementById('module-monthly-summary')) {
    const reportsPane = document.getElementById('module-reports');
    const contentWrapper = reportsPane ? reportsPane.parentElement : document.querySelector('.content-wrapper');
    if (contentWrapper) {
      const pane = document.createElement('div');
      pane.id = 'module-monthly-summary';
      pane.className = 'module-pane';
      pane.innerHTML = `
        <div class="panel" style="margin-bottom:16px;">
          <div class="ms-filter-bar">
            <div class="ms-quick-btns">
              <button class="btn btn-sm" id="ms-btn-this-month">本月</button>
              <button class="btn btn-sm" id="ms-btn-last-month">上月</button>
              <button class="btn btn-sm" id="ms-btn-this-quarter">本季度</button>
              <button class="btn btn-sm" id="ms-btn-this-year">本年度</button>
            </div>
            <div class="ms-date-range">
              <input type="date" id="ms-date-start" class="ms-date-input">
              <span style="color:var(--text-muted);">~</span>
              <input type="date" id="ms-date-end" class="ms-date-input">
            </div>
            <div class="ms-month-select">
              <label style="font-size:13px;color:var(--text-secondary);">月份</label>
              <input type="month" id="ms-month-picker" class="ms-date-input">
            </div>
            <span id="ms-range-label" style="font-size:13px;color:var(--text-muted);margin-left:auto;"></span>
          </div>
        </div>
        <div class="ms-kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">期初库存</div>
            <div class="kpi-value" id="ms-kpi-begin-items">0</div>
            <div class="kpi-change">种 / <span id="ms-kpi-begin-stock">0</span> 件</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--success);">
            <div class="kpi-label">本期入库</div>
            <div class="kpi-value income" id="ms-kpi-in-qty">0</div>
            <div class="kpi-change"><span id="ms-kpi-in-count">0</span> 笔</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--warning);">
            <div class="kpi-label">本期出库</div>
            <div class="kpi-value cost" id="ms-kpi-out-qty">0</div>
            <div class="kpi-change"><span id="ms-kpi-out-count">0</span> 笔</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">期末库存</div>
            <div class="kpi-value" id="ms-kpi-end-items">0</div>
            <div class="kpi-change">种 / <span id="ms-kpi-end-stock">0</span> 件</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--accent);">
            <div class="kpi-label">库存周转率</div>
            <div class="kpi-value" id="ms-kpi-turnover" style="color:var(--accent);">0%</div>
            <div class="kpi-change">出库/平均库存</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--danger);">
            <div class="kpi-label">低库存预警</div>
            <div class="kpi-value danger" id="ms-kpi-low-stock">0</div>
            <div class="kpi-change">项</div>
          </div>
        </div>
        <div class="grid-2" style="margin-top:16px;">
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title"><span class="dot" style="background:var(--accent)"></span>出入库趋势</div>
            </div>
            <div class="chart-wrap" style="min-height:260px;">
              <canvas id="ms-inout-chart"></canvas>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title"><span class="dot" style="background:var(--success)"></span>品类出库占比</div>
            </div>
            <div class="chart-wrap" style="min-height:260px;">
              <canvas id="ms-category-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="panel" style="margin-top:16px;">
          <div class="panel-header">
            <div class="panel-title"><span class="dot" style="background:var(--warning)"></span>近6月出库环比</div>
          </div>
          <div class="chart-wrap" style="min-height:220px;max-height:280px;">
            <canvas id="ms-trend-chart"></canvas>
          </div>
        </div>
        <div class="panel" style="margin-top:16px;">
          <div class="panel-header">
            <div class="panel-title">出入库明细</div>
            <div class="panel-actions">
              <select id="ms-filter-category"><option value="">全部分类</option></select>
              <button class="btn btn-sm" id="ms-export-btn">📥 导出Excel</button>
            </div>
          </div>
          <div class="table-scroll">
            <table class="data-table" id="ms-detail-table">
              <thead>
                <tr>
                  <th>物品编号</th>
                  <th>物品名称</th>
                  <th>品牌/型号</th>
                  <th>期初库存</th>
                  <th>本期入库</th>
                  <th>本期出库</th>
                  <th>期末库存</th>
                  <th>单位</th>
                  <th>变动率</th>
                </tr>
              </thead>
              <tbody id="ms-detail-tbody">
                <tr><td colspan="9" class="empty-state">请选择时间范围</td></tr>
              </tbody>
            </table>
          </div>
        </div>`;
      contentWrapper.insertBefore(pane, reportsPane);
    }
  }
}

/* ================================================================
 *  KPI 卡片点击展开详情面板
 * ================================================================ */
let _kpiActiveType = null;

function _initKPIExpandHandlers() {
  const cards = document.querySelectorAll('.kpi-card[data-kpi-type]');
  cards.forEach(card => {
    if (card._kpiBound) return;
    card._kpiBound = true;
    card.addEventListener('click', function () {
      const type = this.dataset.kpiType;
      if (_kpiActiveType === type) {
        _kpiCloseExpand();
      } else {
        _kpiOpenExpand(type, cards);
      }
    });
  });
  // 关闭按钮
  const closeBtn = document.getElementById('kpi-expand-close');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', _kpiCloseExpand);
  }
}

function _kpiCloseExpand() {
  const panel = document.getElementById('kpi-expand-panel');
  if (panel) panel.classList.remove('open');
  document.querySelectorAll('.kpi-card.active').forEach(c => c.classList.remove('active'));
  _kpiActiveType = null;
}

function _kpiOpenExpand(type, cards) {
  const panel = document.getElementById('kpi-expand-panel');
  const titleEl = document.getElementById('kpi-expand-title');
  const bodyEl = document.getElementById('kpi-expand-body');
  if (!panel || !titleEl || !bodyEl) return;

  // 高亮当前卡片
  document.querySelectorAll('.kpi-card.active').forEach(c => c.classList.remove('active'));
  const activeCard = document.querySelector(`.kpi-card[data-kpi-type="${type}"]`);
  if (activeCard) activeCard.classList.add('active');

  // 设置标题
  const titles = {
    'total-items': '📦 总库存物品明细',
    'month-in': '📥 本月入库记录',
    'month-out': '📤 本月出库记录',
    'pending-purchase': '🛒 待处理采购单',
    'pending-stockin': '📥 待确认入库',
    'low-stock': '⚠️ 低库存预警列表',
    'pending-outbound': '📋 待确认出库申请'
  };
  titleEl.textContent = titles[type] || '详情';

  // 渲染内容
  bodyEl.innerHTML = '<div class="expand-empty">加载中...</div>';
  _kpiActiveType = type;

  // 先关闭再打开（实现切换动画）
  panel.classList.remove('open');
  setTimeout(() => {
    _kpiRenderContent(type, bodyEl);
    panel.classList.add('open');
  }, 80);
}

/* ---------- 各类型渲染函数 ---------- */

function _kpiRenderContent(type, body) {
  switch (type) {
    case 'total-items':    return _kpiRenderTotalItems(body);
    case 'month-in':       return _kpiRenderMonthIn(body);
    case 'month-out':      return _kpiRenderMonthOut(body);
    case 'pending-purchase':
    case 'pending-stockin': return _kpiRenderPendingPurchase(body);
    case 'low-stock':      return _kpiRenderLowStock(body);
    case 'pending-outbound': return _kpiRenderPendingOutbound(body);
    default: body.innerHTML = '<div class="expand-empty">暂无数据</div>';
  }
}

/* 总库存物品 */
function _kpiRenderTotalItems(body) {
  let inventory = _appCache.inventory ? _appCache.inventory : [];
  if (inventory.length === 0 && typeof mockData !== 'undefined') inventory = mockData.items;
  if (inventory.length === 0) { body.innerHTML = '<div class="expand-empty">暂无库存数据</div>'; return; }

  let html = '<table class="expand-table"><thead><tr><th>编号</th><th>名称</th><th>分类</th><th>当前库存</th><th>安全库存</th><th>单位</th><th>操作</th></tr></thead><tbody>';
  inventory.forEach(item => {
    const low = item.stock < (item.safety_stock || 10);
    html += `<tr>
      <td>${item.code || '-'}</td>
      <td>${item.name || '-'}</td>
      <td>${item.category || '-'}</td>
      <td class="${low ? 'stock-low' : 'stock-ok'}">${item.stock}</td>
      <td>${item.safety_stock || 10}</td>
      <td>${item.unit || '-'}</td>
      <td class="expand-actions"><button class="btn-action" onclick="switchModule('inventory')">查看库存</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

/* 本月入库 */
function _kpiRenderMonthIn(body) {
  const records = _appCache.stockInRecords ? _appCache.stockInRecords : [];
  const now = new Date();
  const monthRecords = records.filter(r => {
    const d = new Date(r.stockin_date || r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).sort((a, b) => new Date(b.stockin_date || b.created_at) - new Date(a.stockin_date || a.created_at));

  if (monthRecords.length === 0) { body.innerHTML = '<div class="expand-empty">本月暂无入库记录</div>'; return; }

  let html = '<table class="expand-table"><thead><tr><th>入库单号</th><th>入库日期</th><th>关联采购单</th><th>数量</th><th>金额</th><th>确认人</th><th>操作</th></tr></thead><tbody>';
  monthRecords.forEach(r => {
    html += `<tr>
      <td>${r.code || '-'}</td>
      <td>${r.stockin_date || '-'}</td>
      <td>${r.purchase_order_code || '-'}</td>
      <td>${r.total_quantity || 0}</td>
      <td>¥${(r.total_amount || 0).toFixed(2)}</td>
      <td>${r.confirmed_by || '-'}</td>
      <td class="expand-actions"><button class="btn-action" onclick="viewStockInDetail('${r.code}')">查看详情</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

/* 本月出库 */
function _kpiRenderMonthOut(body) {
  const records = _appCache.stockOutRecords ? _appCache.stockOutRecords : [];
  const now = new Date();
  const monthRecords = records.filter(r => {
    const d = new Date(r.stockout_date || r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).sort((a, b) => new Date(b.stockout_date || b.created_at) - new Date(a.stockout_date || a.created_at));

  if (monthRecords.length === 0) { body.innerHTML = '<div class="expand-empty">本月暂无出库记录</div>'; return; }

  let html = '<table class="expand-table"><thead><tr><th>出库单号</th><th>出库日期</th><th>关联申请单</th><th>团期</th><th>数量</th><th>确认人</th><th>操作</th></tr></thead><tbody>';
  monthRecords.forEach(r => {
    html += `<tr>
      <td>${r.code || '-'}</td>
      <td>${r.stockout_date || '-'}</td>
      <td>${r.requisition_code || '-'}</td>
      <td>${r.tour_name || r.tour_date || '-'}</td>
      <td>${r.total_quantity || 0}</td>
      <td>${r.confirmed_by || '-'}</td>
      <td class="expand-actions"><button class="btn-action" onclick="viewStockOutDetail('${r.code}')">查看详情</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

/* 待处理采购单 */
function _kpiRenderPendingPurchase(body) {
  const orders = _appCache.purchaseOrders ? _appCache.purchaseOrders : [];
  const pending = orders.filter(o => o.status === 'pending_stockin')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (pending.length === 0) { body.innerHTML = '<div class="expand-empty">暂无待处理采购单 🎉</div>'; return; }

  const canStockIn = hasPermission('confirm_stockin');

  let html = '<table class="expand-table"><thead><tr><th>采购单号</th><th>采购日期</th><th>采购人</th><th>物品数</th><th>金额</th><th>操作</th></tr></thead><tbody>';
  pending.forEach(o => {
    const itemCount = (o.items || []).length;
    html += `<tr>
      <td>${o.code || '-'}</td>
      <td>${o.purchase_date || '-'}</td>
      <td>${o.purchaser || '-'}</td>
      <td>${itemCount} 种</td>
      <td>¥${(o.total_amount || 0).toFixed(2)}</td>
      <td class="expand-actions">
        <button class="btn-action" onclick="viewPurchaseDetail(${o.id})">查看</button>
        ${canStockIn ? `<button class="btn-action primary" onclick="switchModule('stock-in')">去入库</button>` : ''}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

/* 低库存预警 */
function _kpiRenderLowStock(body) {
  let inventory = _appCache.inventory ? _appCache.inventory : [];
  if (inventory.length === 0 && typeof mockData !== 'undefined') inventory = mockData.items;
  const lowItems = inventory.filter(item => item.stock < (item.safety_stock || 10))
    .sort((a, b) => a.stock - b.stock);

  if (lowItems.length === 0) { body.innerHTML = '<div class="expand-empty">库存充足，无预警项 🎉</div>'; return; }

  const canPurchase = hasPermission('create_purchase');
  const canEditSafety = hasPermission('manage_inventory') || hasPermission('adjust_stock');

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${(canPurchase || canEditSafety) ? `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" id="kpi-lowstock-selectall" onchange="_kpiLowStockToggleAll(this.checked)" checked> 全选
        </label>` : ''}
        <span style="font-size:12px;color:var(--text-muted);">共 ${lowItems.length} 项低于安全库存</span>
      </div>
      <div style="display:flex;gap:8px;">
        ${canEditSafety ? `<button class="btn-action" onclick="_kpiSaveSafetyStock()">保存安全库存</button>` : ''}
        ${canPurchase ? `<button class="btn-action primary" onclick="_kpiBatchPurchase()">一键采购选中项</button>` : ''}
      </div>
    </div>
    <table class="expand-table"><thead><tr>
      ${(canPurchase || canEditSafety) ? '<th style="width:30px;"><input type="checkbox" id="kpi-lowstock-selectall-th" onchange="_kpiLowStockToggleAll(this.checked)" checked></th>' : ''}
      <th>编号</th><th>名称</th><th>分类</th><th>当前库存</th><th>安全库存</th><th>建议采购量</th><th>单位</th>
    </tr></thead><tbody>`;

  lowItems.forEach((item, idx) => {
    const gap = (item.safety_stock || 10) - item.stock;
    const suggestQty = Math.max(gap * 2, 10); // 建议采购量 = 缺口 x 2（至少10）
    html += `<tr>
      ${(canPurchase || canEditSafety) ? `<td><input type="checkbox" class="kpi-lowstock-cb" data-idx="${idx}" checked></td>` : ''}
      <td>${item.code || '-'}</td>
      <td>${item.name || '-'}</td>
      <td>${item.category || '-'}</td>
      <td class="stock-low">${item.stock}</td>
      <td><input type="number" class="kpi-safety-input" data-item-id="${item.id}" value="${item.safety_stock || 10}" min="1" max="99999"
        style="width:64px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--sketch-sm);font-size:12px;text-align:center;background:var(--bg-input);color:var(--text-primary);"></td>
      <td style="color:var(--accent);font-weight:600;">${suggestQty}</td>
      <td>${item.unit || '-'}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  body.innerHTML = html;

  // 存储 lowItems 引用供后续使用
  body._lowItems = lowItems;
}

/* 全选/取消全选 */
function _kpiLowStockToggleAll(checked) {
  document.querySelectorAll('.kpi-lowstock-cb').forEach(cb => cb.checked = checked);
  const sa1 = document.getElementById('kpi-lowstock-selectall');
  const sa2 = document.getElementById('kpi-lowstock-selectall-th');
  if (sa1) sa1.checked = checked;
  if (sa2) sa2.checked = checked;
}

/* 保存安全库存修改 */
function _kpiSaveSafetyStock() {
  const inputs = document.querySelectorAll('.kpi-safety-input');
  if (inputs.length === 0) return;

  let inventory = _appCache.inventory ? _appCache.inventory.slice() : [];
  if (inventory.length === 0 && typeof mockData !== 'undefined') inventory = JSON.parse(JSON.stringify(mockData.items));
  let changed = 0;

  inputs.forEach(inp => {
    const itemId = parseFloat(inp.dataset.itemId);
    const newSafety = parseInt(inp.value) || 10;
    const item = inventory.find(i => i.id === itemId);
    if (item && item.safety_stock !== newSafety) {
      item.safety_stock = newSafety;
      changed++;
    }
  });

  if (changed > 0) {
    _appCache.inventory = inventory;
    // 刷新 KPI 和当前面板
    updateKPICards();
    _kpiRenderLowStock(document.getElementById('kpi-expand-body'));
    showToast(`已更新 ${changed} 项安全库存`, 'success');
  } else {
    showToast('安全库存无变化', 'info');
  }
}

/* 一键采购 */
function _kpiBatchPurchase() {
  const checkboxes = document.querySelectorAll('.kpi-lowstock-cb:checked');
  if (checkboxes.length === 0) {
    showToast('请至少勾选一项物品', 'warning');
    return;
  }

  const bodyEl = document.getElementById('kpi-expand-body');
  const lowItems = bodyEl._lowItems || [];

  // 收集选中项，计算采购量
  const selectedItems = [];
  checkboxes.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const item = lowItems[idx];
    if (!item) return;

    // 读取可能被修改过的安全库存
    const safetyInput = document.querySelector(`.kpi-safety-input[data-item-id="${item.id}"]`);
    const safety = safetyInput ? (parseInt(safetyInput.value) || item.safety_stock || 10) : (item.safety_stock || 10);
    const gap = safety - item.stock;
    const suggestQty = Math.max(gap * 2, 10);

    selectedItems.push({
      name: item.name,
      category: item.category || '未分类',
      code: item.code || '',
      brand: item.brand || '',
      model: item.model || '',
      quantity: suggestQty,
      unit: item.unit || '',
      price: 0,
      amount: 0
    });
  });

  if (selectedItems.length === 0) return;

  // 切换到采购模块并打开新建弹窗
  if (typeof switchModule === 'function') switchModule('purchase');

  // 等一下确保模块已切换
  setTimeout(() => {
    if (typeof openNewPurchaseModal !== 'function') return;
    openNewPurchaseModal();

    // 等弹窗打开后填充数据
    setTimeout(() => {
      _kpiFillPurchaseForm(selectedItems);
    }, 200);
  }, 150);

  // 关闭展开面板
  _kpiCloseExpand();
}

/* 填充采购单表单 */
function _kpiFillPurchaseForm(items) {
  // 找到第一个供应商分组
  const firstGroup = document.querySelector('.supplier-group');
  if (!firstGroup) return;

  // 设置供应商名称
  const supplierInput = firstGroup.querySelector('.supplier-name-input');
  if (supplierInput) supplierInput.value = '系统默认供应商';

  // 清除默认空行
  const tbody = firstGroup.querySelector('.items-tbody');
  if (tbody) tbody.innerHTML = '';

  // 获取 groupId
  const groupId = firstGroup.id;

  // 逐个添加物品
  items.forEach((item, idx) => {
    if (typeof addItemToGroup === 'function') {
      addItemToGroup(groupId);

      // 找到刚添加的行并填充数据
      const rows = tbody.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      if (!lastRow) return;

      const nameInput = lastRow.querySelector('.item-name');
      const categoryInput = lastRow.querySelector('.item-category');
      const brandInput = lastRow.querySelector('.item-brand');
      const modelInput = lastRow.querySelector('.item-model');
      const qtyInput = lastRow.querySelector('.item-quantity');
      const unitInput = lastRow.querySelector('.item-unit');

      if (nameInput) nameInput.value = item.name;
      if (categoryInput) categoryInput.value = item.category;
      if (brandInput) brandInput.value = item.brand;
      if (modelInput) modelInput.value = item.model;
      if (qtyInput) qtyInput.value = item.quantity;
      if (unitInput) unitInput.value = item.unit;

      // 触发金额计算
      if (qtyInput && typeof calculateRowAmount === 'function') {
        calculateRowAmount(qtyInput);
      }
    }
  });

  // 更新合计
  if (typeof updatePurchaseTotal === 'function') updatePurchaseTotal();
}

/* 待确认出库 */
function _kpiRenderPendingOutbound(body) {
  const reqs = _appCache.requisitions ? _appCache.requisitions : [];
  const pending = reqs.filter(r => r.status === 'pending_outbound')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (pending.length === 0) { body.innerHTML = '<div class="expand-empty">暂无待确认出库申请 🎉</div>'; return; }

  const canConfirmOut = hasPermission('confirm_stockout');

  let html = '<table class="expand-table"><thead><tr><th>申请单号</th><th>申请日期</th><th>团期日期</th><th>申请人</th><th>团期名称</th><th>物品数</th><th>操作</th></tr></thead><tbody>';
  pending.forEach(r => {
    const itemCount = (r.items || []).length;
    html += `<tr>
      <td>${r.code || '-'}</td>
      <td>${r.apply_date || '-'}</td>
      <td>${r.tour_date || '-'}</td>
      <td>${r.applicant || '-'}</td>
      <td>${r.tour_name || '-'}</td>
      <td>${itemCount} 种 / ${r.total_quantity || 0} 件</td>
      <td class="expand-actions">
        <button class="btn-action" onclick="viewRequisitionDetail(${r.id})">查看</button>
        ${canConfirmOut ? `<button class="btn-action primary" onclick="confirmStockOut(${r.id})">确认出库</button>` : ''}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}
