/**
 * 入库管理模块 - 混合视图（采购单看板 + 入库收件箱）
 * 支持分批/部分入库，多采购单并行处理
 */

// ============================================================
// 状态管理（使用 var 定义全局变量，供 purchase.js 等模块访问）
// ============================================================
var _siData = {
  purchaseOrders: [],     // 所有关联的采购单（含 items）
  stockInRecords: [],     // 所有入库记录
  receivedMap: {},        // { "poId_itemCode": receivedQty }
  inboxItems: [],         // 收件箱展示数据
  selectedItems: new Set(), // 选中的行 index
  currentPOFilter: '',
  currentStatusFilter: '',
  currentBoardFilter: 'all',
  boardSearchKeyword: '',
  selectedPOId: null,     // 当前选中的 PO（看板点击）
};

// ============================================================
// 初始化
// ============================================================
function initStockInModule() {
  console.log('[StockIn] 初始化混合入库视图...');

  // 绑定月度切换
  const monthInput = document.getElementById('stockin-month');
  if (monthInput) {
    // 设置默认月份
    var now = new Date();
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    monthInput.addEventListener('change', loadHybridStockInData);
  }

  const thisMonthBtn = document.getElementById('stockin-month-this');
  if (thisMonthBtn) thisMonthBtn.addEventListener('click', function() {
    var d = new Date();
    document.getElementById('stockin-month').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadHybridStockInData();
  });

  const lastMonthBtn = document.getElementById('stockin-month-last');
  if (lastMonthBtn) lastMonthBtn.addEventListener('click', function() {
    var d = new Date();
    d.setMonth(d.getMonth() - 1);
    document.getElementById('stockin-month').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadHybridStockInData();
  });

  // 绑定看板 tab
  document.querySelectorAll('.stockin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.stockin-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      _siData.currentBoardFilter = this.getAttribute('data-filter');
      renderStockInBoard();
      renderStockInInbox();
    });
  });

  // 绑定看板搜索
  const searchInput = document.getElementById('stockin-board-search');
  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener('input', function() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        _siData.boardSearchKeyword = searchInput.value.trim().toLowerCase();
        renderStockInBoard();
      }, 200);
    });
  }

  // 绑定收件箱筛选
  const poFilter = document.getElementById('stockin-filter-po');
  if (poFilter) poFilter.addEventListener('change', function() {
    _siData.currentPOFilter = this.value;
    renderStockInInbox();
  });

  const statusFilter = document.getElementById('stockin-filter-status');
  if (statusFilter) statusFilter.addEventListener('change', function() {
    _siData.currentStatusFilter = this.value;
    renderStockInInbox();
  });

  // 绑定全选
  const selectAll = document.getElementById('stockin-select-all');
  if (selectAll) selectAll.addEventListener('change', function() {
    var checked = this.checked;
    var checkboxes = document.querySelectorAll('.stockin-item-check');
    checkboxes.forEach(function(cb) { cb.checked = checked; });
    updateSelection();
  });

  // 绑定底部操作按钮
  const confirmBtn = document.getElementById('stockin-confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', openStockInConfirmModal);

  const resetBtn = document.getElementById('stockin-reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    var inputs = document.querySelectorAll('.stockin-qty-input');
    inputs.forEach(function(inp) {
      inp.value = inp.getAttribute('data-remaining') || '0';
    });
  });

  // 首次加载数据
  loadHybridStockInData();
}

// ============================================================
// 数据加载
// ============================================================
async function loadHybridStockInData() {
  try {
    // 从 _appCache 获取采购单
    var pos = (_appCache && _appCache.purchaseOrders) ? _appCache.purchaseOrders.slice() : [];
    // 只取待入库、部分入库和已入库的
    _siData.purchaseOrders = pos.filter(function(o) {
      return ['pending_stockin', 'partially_stockin', 'stockin_completed'].indexOf(o.status) >= 0;
    });

    // 从 _appCache 获取入库记录
    _siData.stockInRecords = (_appCache && _appCache.stockInRecords) ? _appCache.stockInRecords.slice() : [];

    // 如果数据为空，尝试从 Supabase 加载
    if (_siData.purchaseOrders.length === 0 || _siData.stockInRecords.length === 0) {
      try {
        if (typeof SupaDB !== 'undefined') {
          var [dbPOs, dbSIRecords] = await Promise.all([
            SupaDB.getPurchaseOrders().catch(function() { return []; }),
            SupaDB.getStockInRecords().catch(function() { return []; })
          ]);
          if (dbPOs && dbPOs.length > 0) {
            // 转换成本地格式
            _siData.purchaseOrders = dbPOs.map(function(po) {
              return formatPOFromDB(po);
            });
            if (typeof _appCache !== 'undefined') _appCache.purchaseOrders = _siData.purchaseOrders.slice();
          }
          if (dbSIRecords && dbSIRecords.length > 0) {
            _siData.stockInRecords = dbSIRecords.map(function(si) {
              return formatSIRecordFromDB(si);
            });
            if (typeof _appCache !== 'undefined') _appCache.stockInRecords = _siData.stockInRecords.slice();
          }
        }
      } catch (e) {
        console.warn('[StockIn] Supabase 加载失败:', e.message);
      }
    }

    // 计算已入库数量映射
    computeReceivedMap();

    // 构建收件箱数据
    buildInboxItems();

    // 渲染
    updateStockInKPI();
    renderStockInBoard();
    renderStockInInbox();
    populatePOFilter();

    console.log('[StockIn] 数据加载完成, POs:', _siData.purchaseOrders.length, '入库记录:', _siData.stockInRecords.length);
  } catch (e) {
    console.error('[StockIn] 加载失败:', e);
  }
}

/**
 * 计算每个 PO 每个 item 已入库数量
 */
function computeReceivedMap() {
  _siData.receivedMap = {};
  _siData.stockInRecords.forEach(function(si) {
    (si.items || []).forEach(function(item) {
      var key = si.purchase_order_id + '_' + (item.item_code || item.code || item.name);
      _siData.receivedMap[key] = (_siData.receivedMap[key] || 0) + (item.actual_quantity || 0);
    });
  });
}

/**
 * 构建收件箱数据列表
 */
function buildInboxItems() {
  _siData.inboxItems = [];
  _siData.purchaseOrders.forEach(function(po) {
    (po.items || []).forEach(function(item) {
      var key = po.id + '_' + (item.code || item.name);
      var received = _siData.receivedMap[key] || 0;
      var ordered = item.quantity || 0;
      var remaining = Math.max(0, ordered - received);
      _siData.inboxItems.push({
        poId: po.id,
        poCode: po.code,
        poStatus: po.status || 'pending_stockin',
        poDate: po.purchase_date || '',
        supplier: (po.suppliers && po.suppliers[0]) || (po.supplier) || '',
        itemCode: item.code || '',
        itemName: item.name,
        brand: item.brand || '',
        model: item.model || '',
        orderedQty: ordered,
        receivedQty: received,
        remainingQty: remaining,
        unit: item.unit || '',
        price: item.price || 0,
        amount: (item.amount || item.quantity * item.price || 0),
        category: item.category || '',
        // 用于传递到 confirm 的数据
        _originalItem: item
      });
    });
  });
}

/**
 * 将 Supabase PO 格式转为本地格式
 */
function formatPOFromDB(po) {
  var items = [];
  if (po.purchase_order_items && Array.isArray(po.purchase_order_items)) {
    items = po.purchase_order_items.map(function(poi) {
      return {
        id: poi.id,
        code: poi.item_code || poi.code || '',
        name: poi.name || '',
        brand: poi.brand || '',
        model: poi.model || '',
        quantity: poi.quantity || 0,
        unit: poi.unit || '',
        price: poi.price || 0,
        amount: poi.amount || 0,
        category: poi.category_name || '',
        supplier: poi.supplier || '',
        sort_order: poi.sort_order || 0
      };
    });
  } else if (po.items && Array.isArray(po.items)) {
    items = po.items;
  }
  return {
    id: po.id,
    code: po.code || '',
    purchase_date: po.purchase_date || '',
    purchaser: po.purchaser || '',
    supplier: (typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]')[0] : (po.suppliers ? po.suppliers[0] : '')) || po.supplier || '',
    suppliers: typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]') : (po.suppliers || []),
    status: po.status || 'pending_stockin',
    total_amount: po.total_amount || 0,
    remark: po.remark || '',
    created_at: po.created_at || '',
    items: items
  };
}

/**
 * 将 Supabase 入库记录转为本地格式
 */
function formatSIRecordFromDB(si) {
  var items = [];
  if (si.stock_in_items && Array.isArray(si.stock_in_items)) {
    items = si.stock_in_items.map(function(sii) {
      return {
        id: sii.id,
        code: sii.item_code || sii.code || '',
        name: sii.name || '',
        brand: sii.brand || '',
        model: sii.model || '',
        quantity: sii.quantity || 0,
        actual_quantity: sii.actual_quantity || 0,
        unit: sii.unit || '',
        price: sii.price || 0,
        amount: sii.amount || 0,
        category: sii.category_name || '',
        sort_order: sii.sort_order || 0
      };
    });
  } else if (si.items && Array.isArray(si.items)) {
    items = si.items;
  }
  return {
    id: si.id,
    code: si.code || '',
    purchase_order_id: si.purchase_order_id,
    purchase_order_code: si.purchase_order_code || '',
    stockin_date: si.stockin_date || '',
    batch_code: si.batch_code || '',
    total_quantity: si.total_quantity || 0,
    total_amount: si.total_amount || 0,
    status: si.status || 'completed',
    confirmed_by: si.confirmed_by || '',
    confirmed_at: si.confirmed_at || '',
    remark: si.remark || '',
    created_at: si.created_at || '',
    items: items
  };
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 更新 KPI 指标
 */
function updateStockInKPI() {
  var pending = _siData.purchaseOrders.filter(function(o) { return o.status === 'pending_stockin'; }).length;
  var partial = _siData.purchaseOrders.filter(function(o) { return o.status === 'partially_stockin'; }).length;
  var completed = _siData.purchaseOrders.filter(function(o) { return o.status === 'stockin_completed'; }).length;

  // 本月数据
  var monthVal = document.getElementById('stockin-month')?.value || '';
  var monthRecords = [];
  if (monthVal) {
    monthRecords = _siData.stockInRecords.filter(function(r) {
      return r.stockin_date && r.stockin_date.indexOf(monthVal) === 0;
    });
  } else {
    monthRecords = _siData.stockInRecords;
  }

  var count = monthRecords.length;
  var totalQty = monthRecords.reduce(function(s, r) { return s + (r.total_quantity || 0); }, 0);

  setText('si-kpi-pending', pending);
  setText('si-kpi-partial', partial);
  setText('si-kpi-count', count);
  setText('si-kpi-qty', totalQty);
  setText('si-kpi-completed', completed);
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

/**
 * 渲染采购单看板（左侧）
 */
function renderStockInBoard() {
  var container = document.getElementById('stockin-card-list');
  if (!container) return;

  var filtered = _siData.purchaseOrders.slice();

  // 按 tab 筛选
  if (_siData.currentBoardFilter !== 'all') {
    if (_siData.currentBoardFilter === 'pending_stockin') {
      filtered = filtered.filter(function(o) { return o.status === 'pending_stockin' || o.status === 'partially_stockin'; });
    } else {
      filtered = filtered.filter(function(o) { return o.status === _siData.currentBoardFilter; });
    }
  }

  // 按搜索关键字筛选
  if (_siData.boardSearchKeyword) {
    filtered = filtered.filter(function(o) {
      return o.code.toLowerCase().indexOf(_siData.boardSearchKeyword) >= 0;
    });
  }

  // 按状态排序：待入库 > 部分入库 > 已完成
  var statusOrder = { pending_stockin: 0, partially_stockin: 1, stockin_completed: 2 };
  filtered.sort(function(a, b) {
    var oa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
    var ob = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 99;
    if (oa !== ob) return oa - ob;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="stockin-empty">暂无匹配的采购单</div>';
    return;
  }

  var poStats = {};
  filtered.forEach(function(po) {
    var totalItems = (po.items || []).length;
    var totalOrdered = (po.items || []).reduce(function(s, item) { return s + (item.quantity || 0); }, 0);
    var totalReceived = 0;
    var completedItems = 0;
    (po.items || []).forEach(function(item) {
      var key = po.id + '_' + (item.code || item.name);
      var received = _siData.receivedMap[key] || 0;
      totalReceived += received;
      if (received >= (item.quantity || 0)) completedItems++;
    });
    var progress = totalOrdered > 0 ? Math.round(totalReceived / totalOrdered * 100) : 0;
    var itemsProgress = totalItems > 0 ? Math.round(completedItems / totalItems * 100) : 0;
    poStats[po.id] = { totalItems: totalItems, totalOrdered: totalOrdered, totalReceived: totalReceived, completedItems: completedItems, progress: progress, itemsProgress: itemsProgress };
  });

  var statusText = { pending_stockin: '待入库', partially_stockin: '部分入库', stockin_completed: '已完成' };
  var statusClass = { pending_stockin: 'warning', partially_stockin: 'accent', stockin_completed: 'success' };

  container.innerHTML = filtered.map(function(po) {
    var stats = poStats[po.id] || { totalItems: 0, totalOrdered: 0, totalReceived: 0, completedItems: 0, progress: 0, itemsProgress: 0 };
    // 关键修复：根据实际入库进度重新计算显示状态，而非盲目使用数据库中的 po.status
    // 数据库 status 可能因为 parseFloat/parseInt 截断问题被错误标记为已完成
    var effectiveStatus;
    if (stats.completedItems >= stats.totalItems && stats.totalItems > 0) {
      effectiveStatus = 'stockin_completed';
    } else if (stats.completedItems > 0) {
      effectiveStatus = 'partially_stockin';
    } else {
      effectiveStatus = 'pending_stockin';
    }
    var st = statusText[effectiveStatus] || effectiveStatus;
    var sc = statusClass[effectiveStatus] || '';
    var supplierNames = (po.suppliers && po.suppliers.length > 0) ? po.suppliers.join(', ') : (po.supplier || '-');
    var isActive = _siData.selectedPOId === po.id;
    var remainingCount = stats.totalItems - stats.completedItems;

    return '<div class="stockin-card' + (isActive ? ' active' : '') + '" data-po-id="' + po.id + '" onclick="selectStockInPO(' + po.id + ')">' +
      '<div class="stockin-card-header">' +
        '<span class="stockin-card-code">' + po.code + '</span>' +
        '<span class="status-badge ' + sc + '" style="font-size:10px;padding:1px 6px;">' + st + '</span>' +
      '</div>' +
      '<div class="stockin-card-meta">' +
        '<span>' + supplierNames + '</span>' +
        '<span>' + (po.purchase_date || '') + '</span>' +
      '</div>' +
      '<div class="stockin-card-progress">' +
        '<div class="stockin-progress-bar">' +
          '<div class="stockin-progress-fill' + (stats.progress >= 100 ? ' complete' : '') + '" style="width:' + stats.progress + '%;"></div>' +
        '</div>' +
        '<span class="stockin-progress-text">' + stats.progress + '%</span>' +
      '</div>' +
      '<div class="stockin-card-footer">' +
        '<span class="stockin-card-stat">' + stats.completedItems + '/' + stats.totalItems + ' 项</span>' +
        (effectiveStatus !== 'stockin_completed' ? '<span class="stockin-card-action">' + (stats.completedItems > 0 ? '继续入库 →' : '开始入库 →') + '</span>' : '<span class="stockin-card-done">✓ 已完成</span>') +
      '</div>' +
    '</div>';
  }).join('');
}

/**
 * 点击选择 PO
 */
function selectStockInPO(poId) {
  _siData.selectedPOId = poId;
  // 高亮选中的卡片
  document.querySelectorAll('.stockin-card').forEach(function(card) {
    card.classList.toggle('active', parseFloat(card.getAttribute('data-po-id')) === poId);
  });
  // 刷新收件箱
  renderStockInInbox();
}

/**
 * 渲染入库收件箱（右侧） — 已完成的采购单折叠为可展开汇总栏
 */
function renderStockInInbox() {
  var tbody = document.getElementById('stockin-inbox-tbody');
  if (!tbody) return;

  var items = _siData.inboxItems.slice();

  // 按选中的 PO 筛选
  if (_siData.selectedPOId) {
    items = items.filter(function(item) { return item.poId === _siData.selectedPOId; });
  }

  // 按采购单筛选
  if (_siData.currentPOFilter) {
    items = items.filter(function(item) { return item.poCode === _siData.currentPOFilter; });
  }

  // 按状态筛选
  if (_siData.currentStatusFilter) {
    if (_siData.currentStatusFilter === 'pending') {
      items = items.filter(function(item) { return item.remainingQty > 0 && item.receivedQty === 0; });
    } else if (_siData.currentStatusFilter === 'partial') {
      items = items.filter(function(item) { return item.remainingQty > 0 && item.receivedQty > 0; });
    } else if (_siData.currentStatusFilter === 'completed') {
      items = items.filter(function(item) { return item.remainingQty === 0; });
    }
  }

  // 清空选中
  _siData.selectedItems.clear();

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="empty-state">暂无待入库物品' + (_siData.selectedPOId ? '，请选择其他采购单' : '，请在左侧选择采购单') + '</td></tr>';
    updateActionBar();
    updateInboxInfo();
    return;
  }

  // 按 PO 分组
  var poGroups = {};
  items.forEach(function(item) {
    if (!poGroups[item.poCode]) {
      poGroups[item.poCode] = { poId: item.poId, poCode: item.poCode, poDate: item.poDate, supplier: item.supplier, items: [] };
    }
    poGroups[item.poCode].items.push(item);
  });

  // 按 PO 状态排序：待入库 > 部分入库 > 已完成
  var poOrder = Object.keys(poGroups).sort(function(a, b) {
    var ga = poGroups[a].items, gb = poGroups[b].items;
    var allDoneA = ga.every(function(i) { return i.remainingQty <= 0; });
    var anyReceivedA = ga.some(function(i) { return i.receivedQty > 0; });
    var allDoneB = gb.every(function(i) { return i.remainingQty <= 0; });
    var anyReceivedB = gb.some(function(i) { return i.receivedQty > 0; });
    var sa = allDoneA ? 2 : (anyReceivedA ? 1 : 0);
    var sb = allDoneB ? 2 : (anyReceivedB ? 1 : 0);
    return sa - sb;
  });

  var html = '';
  poOrder.forEach(function(poCode) {
    var group = poGroups[poCode];
    var pendingItems = group.items.filter(function(i) { return i.remainingQty > 0; });
    var doneItems = group.items.filter(function(i) { return i.remainingQty <= 0; });
    var allCompleted = pendingItems.length === 0;
    var totalAmount = group.items.reduce(function(s, i) { return s + (i.amount || 0); }, 0);

    if (allCompleted) {
      // 已完成：渲染为折叠汇总栏
      var summaryId = 'si-summary-' + group.poId;
      html += '<tr class="stockin-summary-row" onclick="toggleStockInSummary(\'' + summaryId + '\')">' +
        '<td colspan="13" style="padding:0;">' +
          '<div class="stockin-summary-bar">' +
            '<div class="stockin-summary-left">' +
              '<span class="stockin-summary-icon">▶</span>' +
              '<span class="stockin-summary-code">' + group.poCode + '</span>' +
              '<span class="status-badge success" style="font-size:10px;padding:1px 8px;">全部入库完成</span>' +
              '<span class="stockin-summary-stat">' + doneItems.length + ' 项 · ¥' + totalAmount.toFixed(2) + '</span>' +
            '</div>' +
            '<div class="stockin-summary-right">' +
              '<span class="stockin-summary-date">' + (group.poDate || '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="stockin-summary-detail" id="' + summaryId + '" style="display:none;">' +
            '<table class="data-table stockin-detail-mini">' +
              '<thead><tr>' +
                '<th>物品名称</th><th>品牌</th><th>型号</th><th>采购数量</th><th>已入库</th><th>单位</th><th>单价</th><th>金额</th>' +
              '</tr></thead>' +
              '<tbody>' +
                doneItems.map(function(item) {
                  return '<tr class="stockin-row-done">' +
                    '<td>' + item.itemName + '</td>' +
                    '<td>' + (item.brand || '-') + '</td>' +
                    '<td>' + (item.model || '-') + '</td>' +
                    '<td class="cell-number">' + item.orderedQty + '</td>' +
                    '<td class="cell-number" style="color:var(--success);">' + item.receivedQty + '</td>' +
                    '<td>' + (item.unit || '-') + '</td>' +
                    '<td class="cell-number">¥' + item.price.toFixed(2) + '</td>' +
                    '<td class="cell-number">¥' + item.amount.toFixed(2) + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</td>' +
      '</tr>';
    } else {
      // 有待入库的行 — 正常渲染待入库 + 已完成的折叠
      pendingItems.forEach(function(item, idx) {
        var statusLabel = item.receivedQty > 0 ? '部分入库' : '待入库';
        var statusCls = item.receivedQty > 0 ? 'warning' : '';
        var remaining = item.remainingQty;
        var itemIdx = _siData.inboxItems.indexOf(item);

        html += '<tr data-index="' + itemIdx + '">' +
          '<td><input type="checkbox" class="stockin-item-check" data-index="' + itemIdx + '" onchange="updateSelection()"></td>' +
          '<td><span style="font-family:monospace;font-size:12px;">' + item.poCode + '</span></td>' +
          '<td><span style="font-weight:600;">' + item.itemName + '</span></td>' +
          '<td>' + (item.brand || '-') + '</td>' +
          '<td>' + (item.model || '-') + '</td>' +
          '<td class="cell-number">' + item.orderedQty + '</td>' +
          '<td class="cell-number">' + item.receivedQty + '</td>' +
          '<td class="cell-number">' + remaining + '</td>' +
          '<td class="cell-number">' +
            '<input type="number" class="stockin-qty-input" data-index="' + itemIdx + '" data-remaining="' + remaining + '" value="' + remaining + '" min="0" max="' + remaining + '" step="0.01" style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:13px;text-align:center;">' +
          '</td>' +
          '<td>' + (item.unit || '-') + '</td>' +
          '<td class="cell-number">¥' + (item.price || 0).toFixed(2) + '</td>' +
          '<td><span class="status-badge ' + statusCls + '" style="font-size:10px;padding:1px 6px;">' + statusLabel + '</span></td>' +
          '<td><button class="btn btn-sm btn-accent stockin-row-confirm-btn" data-item-index="' + itemIdx + '" onclick="confirmStockInSingle(' + itemIdx + ')">确认入库</button></td>' +
        '</tr>';
      });

      // 已完成的行在这个 PO 内折叠显示
      if (doneItems.length > 0) {
        var partialSummaryId = 'si-partial-' + group.poId;
        html += '<tr class="stockin-summary-row stockin-partial-done" onclick="toggleStockInSummary(\'' + partialSummaryId + '\')">' +
          '<td colspan="13" style="padding:0;">' +
            '<div class="stockin-summary-bar stockin-summary-bar-mini">' +
              '<span class="stockin-summary-icon">▶</span>' +
              '<span style="font-size:12px;color:var(--success);">已完成 ' + doneItems.length + ' 项</span>' +
              '<span style="font-size:11px;color:var(--text-muted);margin-left:8px;">点击展开查看</span>' +
            '</div>' +
            '<div class="stockin-summary-detail" id="' + partialSummaryId + '" style="display:none;">' +
              '<table class="data-table stockin-detail-mini">' +
                '<thead><tr>' +
                  '<th>物品名称</th><th>品牌</th><th>型号</th><th>采购数量</th><th>已入库</th><th>单位</th><th>单价</th><th>金额</th>' +
                '</tr></thead>' +
                '<tbody>' +
                  doneItems.map(function(item) {
                    return '<tr class="stockin-row-done">' +
                      '<td>' + item.itemName + '</td>' +
                      '<td>' + (item.brand || '-') + '</td>' +
                      '<td>' + (item.model || '-') + '</td>' +
                      '<td class="cell-number">' + item.orderedQty + '</td>' +
                      '<td class="cell-number" style="color:var(--success);">' + item.receivedQty + '</td>' +
                      '<td>' + (item.unit || '-') + '</td>' +
                      '<td class="cell-number">¥' + item.price.toFixed(2) + '</td>' +
                      '<td class="cell-number">¥' + item.amount.toFixed(2) + '</td>' +
                    '</tr>';
                  }).join('') +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }
    }
  });

  tbody.innerHTML = html;

  updateActionBar();
  updateInboxInfo();

  // 绑定数量输入事件
  tbody.querySelectorAll('.stockin-qty-input').forEach(function(inp) {
    inp.addEventListener('change', function() {
      var max = parseFloat(this.getAttribute('data-remaining')) || 0;
      var val = parseFloat(this.value) || 0;
      if (val < 0) this.value = 0;
      if (val > max) this.value = max;
    });
  });
}

/**
 * 切换完成明细展开/折叠
 */
function toggleStockInSummary(summaryId) {
  var detail = document.getElementById(summaryId);
  if (!detail) return;

  var icon = detail.previousElementSibling.querySelector('.stockin-summary-icon');

  if (detail.style.display === 'none') {
    detail.style.display = 'block';
    detail.classList.add('stockin-summary-open');
    if (icon) icon.textContent = '▼';
  } else {
    detail.style.display = 'none';
    detail.classList.remove('stockin-summary-open');
    if (icon) icon.textContent = '▶';
  }
}

/**
 * 更新选中状态 + 交互反馈
 */
function updateSelection() {
  _siData.selectedItems.clear();
  document.querySelectorAll('.stockin-item-check').forEach(function(cb) {
    var row = cb.closest('tr');
    if (cb.checked) {
      _siData.selectedItems.add(parseFloat(cb.getAttribute('data-index')));
      if (row) row.classList.add('stockin-row-selected');
    } else {
      if (row) row.classList.remove('stockin-row-selected');
    }
  });
  updateActionBar();
  updateInboxInfo();
}

/**
 * 更新底部操作栏 + 动画
 */
function updateActionBar() {
  var bar = document.getElementById('stockin-actionbar');
  var countEl = document.getElementById('stockin-actionbar-count');
  if (!bar || !countEl) return;

  var count = _siData.selectedItems.size;
  if (count > 0) {
    bar.style.display = 'flex';
    bar.classList.add('stockin-actionbar-show');
    countEl.textContent = '已选择 ' + count + ' 项';
    // 数字变化弹跳动画
    countEl.classList.remove('stockin-bounce');
    void countEl.offsetWidth; // 触发 reflow
    countEl.classList.add('stockin-bounce');
  } else {
    bar.classList.remove('stockin-actionbar-show');
    bar.style.display = 'none';
  }
}

/**
 * 更新收件箱信息
 */
function updateInboxInfo() {
  var infoEl = document.getElementById('stockin-inbox-info');
  if (!infoEl) return;

  var totalEl = document.querySelectorAll('#stockin-inbox-tbody tr:not(.empty-state)').length;
  var doneEl = document.querySelectorAll('#stockin-inbox-tbody tr.stockin-row-done').length;
  infoEl.textContent = '共 ' + totalEl + ' 项（' + doneEl + ' 项已完成）';
}

/**
 * 填充采购单筛选下拉
 */
function populatePOFilter() {
  var select = document.getElementById('stockin-filter-po');
  if (!select) return;

  var currentVal = select.value;
  var codes = [];
  _siData.purchaseOrders.forEach(function(po) {
    if (codes.indexOf(po.code) < 0) codes.push(po.code);
  });

  select.innerHTML = '<option value="">全部采购单</option>' +
    codes.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

  if (currentVal) select.value = currentVal;
}

// ============================================================
// 入库确认
// ============================================================

/**
 * 单行确认入库 — 勾选该行 + 打开确认弹窗
 */
function confirmStockInSingle(itemIndex) {
  // 清除之前的选择，只选中当前行
  _siData.selectedItems.clear();
  _siData.selectedItems.add(itemIndex);

  // 更新复选框状态
  document.querySelectorAll('.stockin-item-check').forEach(function(cb) {
    cb.checked = Number(cb.getAttribute('data-index')) === itemIndex;
  });

  // 更新行高亮
  document.querySelectorAll('#stockin-inbox-tbody tr[data-index]').forEach(function(row) {
    row.classList.toggle('stockin-row-selected', Number(row.getAttribute('data-index')) === itemIndex);
  });

  // 直接打开确认弹窗
  openStockInConfirmModal();
}

/**
 * 打开入库确认弹窗
 */
function openStockInConfirmModal() {
  var count = _siData.selectedItems.size;
  if (count === 0) {
    showToast('请先选择要入库的物品', 'warning');
    return;
  }

  // 收集选中的数据
  var selectedRows = [];
  _siData.selectedItems.forEach(function(idx) {
    var item = _siData.inboxItems[idx];
    if (item && item.remainingQty > 0) {
      selectedRows.push(item);
    }
  });

  if (selectedRows.length === 0) {
    showToast('所选物品均已入库完成', 'warning');
    return;
  }

  // 填充弹窗
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('stockin-date').value = today;
  document.getElementById('stockin-batch').value = 'BATCH' + Date.now();
  document.getElementById('stockin-remark').value = '';
  document.getElementById('confirm-stockin-item-count').textContent = selectedRows.length;
  document.getElementById('confirm-stockin-source').textContent = '采购单 ' + selectedRows[0].poCode + (selectedRows.length > 1 ? ' 等' : '');

  var tbody = document.getElementById('stockin-confirm-tbody');
  if (!tbody) return;

  tbody.innerHTML = selectedRows.map(function(item, idx) {
    var remaining = item.remainingQty;
    return '<tr>' +
      '<td><span style="font-family:monospace;font-size:12px;">' + item.poCode + '</span></td>' +
      '<td style="font-weight:600;">' + item.itemName + '</td>' +
      '<td>' + (item.brand || '-') + '</td>' +
      '<td>' + (item.model || '-') + '</td>' +
      '<td>' + item.orderedQty + '</td>' +
      '<td>' + item.receivedQty + '</td>' +
      '<td>' + remaining + '</td>' +
      '<td><input type="number" class="confirm-qty" data-remaining="' + remaining + '" value="' + remaining + '" min="0" max="' + remaining + '" step="0.01" style="width:70px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;text-align:center;"></td>' +
      '<td>' + (item.unit || '-') + '</td>' +
      '<td>¥' + (item.price || 0).toFixed(2) + '</td>' +
      '<td class="cell-number confirm-amount">¥' + (remaining * (item.price || 0)).toFixed(2) + '</td>' +
    '</tr>';
  }).join('');

  // 初始化右侧汇总数据
  updateConfirmSummary(selectedRows);

  // 绑定数量变更事件（更新金额 + 右侧汇总）
  setTimeout(function() {
    tbody.querySelectorAll('.confirm-qty').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var row = this.closest('tr');
        var price = parseFloat(row.querySelectorAll('td')[9].textContent.replace('¥', '')) || 0;
        var qty = parseFloat(this.value) || 0;
        var max = parseFloat(this.getAttribute('data-remaining')) || 0;
        if (qty > max) { this.value = max; qty = max; }
        if (qty < 0) { this.value = 0; qty = 0; }
        var amtEl = row.querySelector('.confirm-amount');
        if (amtEl) amtEl.textContent = '¥' + (qty * price).toFixed(2);
        // 重新计算汇总
        recalcConfirmSummary();
      });
    });
  }, 50);

  // 绑定确认按钮
  var confirmBtn = document.getElementById('confirm-stockin-btn');
  if (confirmBtn) {
    var newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', executePartialStockIn);
  }

  // 绑定取消按钮
  var cancelBtn = document.querySelector('.stockin-confirm-btn-cancel');
  if (cancelBtn) {
    var newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', function() { closeModal(); });
  }

  openModal('modal-stockin-confirm');
}

/**
 * 初始化确认弹窗右侧汇总
 */
function updateConfirmSummary(selectedRows) {
  var totalQty = selectedRows.reduce(function(s, i) { return s + i.remainingQty; }, 0);
  var totalAmt = selectedRows.reduce(function(s, i) { return s + (i.remainingQty * i.price); }, 0);
  var qtyEl = document.getElementById('confirm-stat-qty');
  var amtEl = document.getElementById('confirm-stat-amount');
  if (qtyEl) qtyEl.textContent = totalQty;
  if (amtEl) amtEl.textContent = '¥' + totalAmt.toFixed(2);
}

/**
 * 重新计算确认弹窗右侧汇总（用户修改数量后）
 */
function recalcConfirmSummary() {
  var totalQty = 0;
  var totalAmt = 0;
  document.querySelectorAll('.confirm-qty').forEach(function(inp) {
    var qty = parseFloat(inp.value) || 0;
    var row = inp.closest('tr');
    var price = parseFloat(row.querySelectorAll('td')[9].textContent.replace('¥', '')) || 0;
    totalQty += qty;
    totalAmt += qty * price;
  });
  var qtyEl = document.getElementById('confirm-stat-qty');
  var amtEl = document.getElementById('confirm-stat-amount');
  if (qtyEl) qtyEl.textContent = totalQty;
  if (amtEl) amtEl.textContent = '¥' + totalAmt.toFixed(2);
}

/**
 * 执行分批入库
 */
async function executePartialStockIn() {
  var stockinDate = document.getElementById('stockin-date').value;
  var batchCode = document.getElementById('stockin-batch').value;
  var remark = document.getElementById('stockin-remark').value;

  if (!stockinDate) {
    showToast('请选择入库日期', 'warning');
    return;
  }

  // 收集入库数据
  var rows = document.querySelectorAll('#stockin-confirm-tbody tr');
  var stockInItems = [];
  var poMap = {};

  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    var poCode = cells[0].textContent.trim();
    var itemName = cells[1].textContent.trim();
    var brand = cells[2].textContent.trim();
    var model = cells[3].textContent.trim();
    var orderedQty = parseFloat(cells[4].textContent) || 0;
    var qtyInput = row.querySelector('.confirm-qty');
    var actualQty = qtyInput ? (parseFloat(qtyInput.value) || 0) : 0;
    var unit = cells[8].textContent.trim();
    var priceText = cells[9].textContent.trim().replace('¥', '');
    var price = parseFloat(priceText) || 0;

    if (actualQty <= 0) return;

    // 表格中空的 brand/model 显示为 '-' 或 '/'，需归一化为 '' 再匹配
    var normBrand = (brand === '-' || brand === '/') ? '' : brand;
    var normModel = (model === '-' || model === '/') ? '' : model;

    // 从 _siData 找原始 item（渐进式匹配：精确 → 宽松 → 兜底）
    var inboxItem = null;
    // 第一轮：精确匹配 4 字段
    _siData.inboxItems.forEach(function(ii) {
      if (ii.poCode === poCode && ii.itemName === itemName && ii.brand === normBrand && ii.model === normModel) {
        inboxItem = ii;
      }
    });
    // 第二轮：仅按 poCode + itemName 匹配（忽略 brand/model 差异）
    if (!inboxItem) {
      _siData.inboxItems.forEach(function(ii) {
        if (!inboxItem && ii.poCode === poCode && ii.itemName === itemName) {
          inboxItem = ii;
        }
      });
    }
    // 第三轮：仅按 itemName 匹配（跨 PO 兜底）
    if (!inboxItem) {
      _siData.inboxItems.forEach(function(ii) {
        if (!inboxItem && ii.itemName === itemName) {
          inboxItem = ii;
        }
      });
    }

    // 查找 PO ID（从 inboxItem 或 purchaseOrders 中获取）
    var poId = inboxItem ? inboxItem.poId : null;
    if (!poId) {
      _siData.purchaseOrders.forEach(function(po) {
        if (po.code === poCode) poId = po.id;
      });
    }
    if (!poId) {
      console.warn('[StockIn] 找不到 PO:', poCode, '跳过:', itemName);
      return;
    }

    if (!poMap[poId]) {
      poMap[poId] = { poId: poId, poCode: poCode, items: [] };
    }
    poMap[poId].items.push({
      name: itemName,
      code: inboxItem ? inboxItem.itemCode : '',
      brand: normBrand,
      model: normModel,
      category: inboxItem ? inboxItem.category : '',
      quantity: orderedQty,
      actual_quantity: actualQty,
      unit: unit === '-' ? '' : unit,
      price: price,
      amount: actualQty * price,
      supplier: inboxItem ? (inboxItem.supplier || '') : '',
      sort_order: 0
    });
    stockInItems.push({
      name: itemName,
      code: inboxItem ? inboxItem.itemCode : '',
      brand: normBrand,
      model: normModel,
      category: inboxItem ? inboxItem.category : '',
      quantity: orderedQty,
      actual_quantity: actualQty,
      unit: unit === '-' ? '' : unit,
      price: price,
      amount: actualQty * price,
      supplier: inboxItem ? (inboxItem.supplier || '') : '',
      sort_order: 0
    });
  });

  console.log('[StockIn] 收集结果: rows=' + rows.length + ', stockInItems=' + stockInItems.length + ', poMap keys=' + Object.keys(poMap).length);
  if (stockInItems.length === 0) {
    // 额外诊断：检查每一行的 actualQty
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      var qtyInput = row.querySelector('.confirm-qty');
      console.warn('[StockIn] 行诊断:', cells[1] ? cells[1].textContent.trim() : '?',
        'inputVal=' + (qtyInput ? qtyInput.value : 'null'),
        'parsedQty=' + (qtyInput ? (parseFloat(qtyInput.value) || 0) : 0));
    });
    showToast('没有有效的入库数量', 'warning');
    return;
  }

  var totalQty = stockInItems.reduce(function(s, i) { return s + (i.actual_quantity || 0); }, 0);
  var totalAmt = stockInItems.reduce(function(s, i) { return s + ((i.actual_quantity || 0) * (i.price || 0)); }, 0);

  showButtonLoading('confirm-stockin-btn', '入库中...');
  try {
    // 按 PO 分组分批调用
    var poIds = Object.keys(poMap);
    for (var p = 0; p < poIds.length; p++) {
      var poId = parseFloat(poIds[p]);
      var poData = poMap[poId];
      var payload = {
        stockin_date: stockinDate,
        batch_code: batchCode,
        items: poData.items,
        total_quantity: poData.items.reduce(function(s, i) { return s + (i.actual_quantity || 0); }, 0),
        total_amount: poData.items.reduce(function(s, i) { return s + ((i.actual_quantity || 0) * (i.price || 0)); }, 0),
        remark: remark
      };

      // 优先用 Supabase
      if (typeof SupaDB !== 'undefined' && SupaDB.partialConfirmStockIn) {
        try {
          await SupaDB.partialConfirmStockIn(poId, payload);
        } catch (e) {
          console.warn('[StockIn] Supabase 入库失败，回退本地:', e.message);
          // 本地处理
          saveLocalStockIn(poId, poData.poCode, payload);
        }
      } else {
        // 本地处理
        saveLocalStockIn(poId, poData.poCode, payload);
      }
    }

    // 刷新数据
    await loadHybridStockInData();

    // 先对选中的行做消失动画
    animateStockInSuccess();

    closeModal();
  } catch (e) {
    console.error('[StockIn] 入库失败:', e);
    showToast('入库失败: ' + e.message, 'error');
  } finally {
    hideButtonLoading('confirm-stockin-btn');
  }
}

/**
 * 入库成功动画 — 行消失 + 成功提示浮层
 */
function animateStockInSuccess() {
  // 对已勾选的行做 fade-out 动画
  document.querySelectorAll('.stockin-row-selected').forEach(function(row) {
    row.classList.add('stockin-row-fadeout');
  });

  // 显示成功浮层
  var overlay = document.createElement('div');
  overlay.className = 'stockin-success-overlay';
  overlay.innerHTML = '<div class="stockin-success-content">' +
    '<div class="stockin-success-icon">✓</div>' +
    '<div class="stockin-success-text">入库成功</div>' +
  '</div>';
  document.getElementById('module-stock-in').appendChild(overlay);

  // 3秒后自动消失
  setTimeout(function() {
    overlay.classList.add('stockin-success-fadeout');
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 500);
  }, 2500);
}

/**
 * 本地保存入库记录（Supabase 不可用时的回退）
 */
function saveLocalStockIn(poId, poCode, payload) {
  var record = {
    id: Date.now() + Math.random(),
    code: 'SI' + Date.now(),
    purchase_order_id: poId,
    purchase_order_code: poCode,
    stockin_date: payload.stockin_date,
    batch_code: payload.batch_code,
    items: payload.items.map(function(item) {
      return {
        name: item.name,
        code: item.code || '',
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity || 0,
        actual_quantity: item.actual_quantity || 0,
        unit: item.unit || '',
        price: item.price || 0,
        amount: (item.actual_quantity || 0) * (item.price || 0)
      };
    }),
    total_quantity: payload.total_quantity,
    total_amount: payload.total_amount,
    status: 'completed',
    confirmed_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '',
    confirmed_at: new Date().toISOString(),
    remark: payload.remark || '',
    created_at: new Date().toISOString()
  };

  // 添加到缓存
  if (typeof _appCache !== 'undefined') {
    if (!Array.isArray(_appCache.stockInRecords)) _appCache.stockInRecords = [];
    _appCache.stockInRecords.unshift(record);
  }

  // 更新采购单状态
  if (typeof _appCache !== 'undefined' && Array.isArray(_appCache.purchaseOrders)) {
    _appCache.purchaseOrders = _appCache.purchaseOrders.map(function(po) {
      if (po.id === poId) {
        // 检查是否全部完成
        var allDone = true;
        (po.items || []).forEach(function(item) {
          var key = poId + '_' + (item.code || item.name);
          var totalReceived = (payload.items || []).reduce(function(s, pi) {
            return s + ((pi.code === item.code || pi.name === item.name) ? (pi.actual_quantity || 0) : 0);
          }, 0);
          // 加上之前的
          var prevReceived = _siData.receivedMap[key] || 0;
          if ((prevReceived + totalReceived) < (item.quantity || 0)) allDone = false;
        });
        return Object.assign({}, po, { status: allDone ? 'stockin_completed' : 'partially_stockin' });
      }
      return po;
    });
  }

  // 更新库存
  var inventory = (typeof _appCache !== 'undefined' && _appCache.inventory) ? _appCache.inventory.slice() : [];
  payload.items.forEach(function(item) {
    if (item.actual_quantity <= 0) return;
    var existing = inventory.find(function(inv) {
      return inv.name === item.name && inv.brand === item.brand && inv.model === item.model;
    });
    if (existing) {
      existing.stock = (existing.stock || 0) + item.actual_quantity;
      existing.last_stockin_date = payload.stockin_date;
      existing.last_stockin_batch = payload.batch_code;
    } else {
      inventory.push({
        id: Date.now() + Math.random(),
        code: item.code || 'ITEM' + String(inventory.length + 1).padStart(3, '0'),
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        category: item.category || '未分类',
        stock: item.actual_quantity,
        unit: item.unit,
        safety_stock: 10,
        last_stockin_date: payload.stockin_date,
        last_stockin_batch: payload.batch_code,
        source: 'purchase',
        created_at: new Date().toISOString()
      });
    }
  });
  if (typeof _appCache !== 'undefined') _appCache.inventory = inventory;
}

// ============================================================
// 遗留兼容函数（旧版入库列表查看详情仍可用）
// ============================================================

/**
 * 查看入库详情（兼容旧版）
 */
function viewStockInDetail(recordCode) {
  var records = _siData.stockInRecords || [];

  var record = null;
  for (var i = 0; i < records.length; i++) {
    if (records[i].code === recordCode) { record = records[i]; break; }
  }

  if (!record) {
    showToast('未找到该入库记录', 'error');
    return;
  }

  var body = document.getElementById('stockin-detail-body');
  if (!body) { showToast('弹窗容器未找到', 'error'); return; }

  var html = '\
    <div class="detail-info-grid">\
      <div class="detail-info-item">\
        <span class="detail-info-label">入库单号</span>\
        <span class="detail-info-value" style="font-family:monospace;">' + record.code + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">关联采购单</span>\
        <span class="detail-info-value" style="font-family:monospace;">' + (record.purchase_order_code || '-') + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">入库日期</span>\
        <span class="detail-info-value">' + (record.stockin_date || '-') + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">批次号</span>\
        <span class="detail-info-value" style="font-family:monospace;">' + (record.batch_code || '-') + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">确认人</span>\
        <span class="detail-info-value">' + (record.confirmed_by || '-') + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">确认时间</span>\
        <span class="detail-info-value">' + (record.confirmed_at ? new Date(record.confirmed_at).toLocaleString() : '-') + '</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">总数量</span>\
        <span class="detail-info-value" style="color:var(--success);font-size:18px;">' + (record.total_quantity || 0) + ' 件</span>\
      </div>\
      <div class="detail-info-item">\
        <span class="detail-info-label">总金额</span>\
        <span class="detail-info-value" style="color:var(--accent);font-size:18px;">¥' + (record.total_amount || 0).toFixed(2) + '</span>\
      </div>\
    </div>';

  if (record.remark) {
    html += '<div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary);"><strong>备注：</strong>' + record.remark + '</div>';
  }

  html += '<div class="detail-section-title" style="margin-bottom:8px;">入库明细</div>\
    <div class="table-scroll">\
      <table class="data-table">\
        <thead>\
          <tr>\
            <th>#</th>\
            <th>物品名称</th>\
            <th>品牌</th>\
            <th>型号</th>\
            <th>采购数量</th>\
            <th>实收数量</th>\
            <th>单位</th>\
            <th>单价</th>\
            <th>金额</th>\
          </tr>\
        </thead>\
        <tbody>';

  (record.items || []).forEach(function(item, idx) {
    var amount = (item.actual_quantity || 0) * (item.price || 0);
    var diff = (item.actual_quantity || 0) - (item.quantity || 0);
    var diffClass = diff < 0 ? 'stock-low' : (diff > 0 ? 'stock-ok' : '');
    html += '<tr>\
      <td>' + (idx + 1) + '</td>\
      <td style="font-weight:600;">' + (item.name || '-') + '</td>\
      <td>' + (item.brand || '-') + '</td>\
      <td>' + (item.model || '-') + '</td>\
      <td>' + (item.quantity || 0) + '</td>\
      <td style="font-weight:600;">' + (item.actual_quantity || 0) + (diff !== 0 ? ' <span class="' + diffClass + '" style="font-size:11px;">(' + (diff > 0 ? '+' : '') + diff + ')</span>' : '') + '</td>\
      <td>' + (item.unit || '-') + '</td>\
      <td>¥' + (item.price || 0).toFixed(2) + '</td>\
      <td style="font-weight:600;">¥' + amount.toFixed(2) + '</td>\
    </tr>';
  });

  html += '</tbody></table></div>';

  body.innerHTML = html;
  openModal('modal-stockin-detail');
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initStockInModule,
    loadHybridStockInData,
    viewStockInDetail
  };
}
