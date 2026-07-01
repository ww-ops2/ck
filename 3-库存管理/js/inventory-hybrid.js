/**
 * 库存概览模块 - 单栏明细视图
 * 风格与入库管理模块保持一致，支持分类分隔行、补充信息编辑、批量采购
 */

// ============================================================
// 状态管理（使用 var 定义全局变量，供其他模块访问）
// ============================================================
var _invHybrid = {
  allItems: [],            // 全量库存数据（含归一化字段）
  grouped: {},             // 按分类分组 { catName: [items] }
  categoryNames: [],       // 排序后的分类名称列表
  selectedCat: '',         // 当前选中分类（筛选下拉）
  currentStatusFilter: '', // 状态筛选
  searchText: '',          // 搜索文本
  supplementMode: false,   // 补充信息模式
  batchMode: false,        // 批量采购模式
  pendingMap: {},          // 采购中数量映射
  suppOriginalItems: [],   // 补充信息原始数据（用于比对改动）
};

// 分类图标映射
var _invCatIcons = {
  '循环使用类': '🔄', '消耗类': '📦', '其他': '📁',
  '饮品': '🥤', '食品': '🍜', '日用品': '🧴', '电子': '🔌',
  '文具': '✏️', '清洁': '🧹', '工具': '🔧', '未分类': '📦'
};

// ============================================================
// 初始化
// ============================================================
function initInventoryHybrid() {
  console.log('[InventoryHybrid] 初始化库存明细视图...');

  try {
    // 绑定搜索
    var invSearch = document.getElementById('inv-search-input');
    if (invSearch) {
      var invSearchTimer = null;
      invSearch.removeEventListener('input', invSearch._debounceHandler);
      invSearch._debounceHandler = function() {
        if (invSearchTimer) clearTimeout(invSearchTimer);
        invSearchTimer = setTimeout(function() {
          _invHybrid.searchText = invSearch.value.trim().toLowerCase();
          renderInvInbox();
        }, 150);
      };
      invSearch.addEventListener('input', invSearch._debounceHandler);
    }

    // 绑定状态筛选
    var statusFilter = document.getElementById('inv-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        _invHybrid.currentStatusFilter = this.value;
        renderInvInbox();
      });
    }

    // 绑定分类筛选下拉
    var catFilter = document.getElementById('inv-filter-category');
    if (catFilter) {
      catFilter.addEventListener('change', function() {
        _invHybrid.selectedCat = this.value;
        renderInvInbox();
      });
    }

    // 绑定补充信息按钮
    var suppBtn = document.getElementById('inv-supplement-btn');
    if (suppBtn) {
      suppBtn.removeEventListener('click', suppBtn._hybridHandler);
      suppBtn._hybridHandler = function() { toggleInvSupplementMode(); };
      suppBtn.addEventListener('click', suppBtn._hybridHandler);
    }

    // 绑定批量采购按钮
    var batchBtn = document.getElementById('inv-batch-purchase-btn');
    if (batchBtn) {
      batchBtn.removeEventListener('click', batchBtn._hybridHandler);
      batchBtn._hybridHandler = function() { toggleInvBatchMode(); };
      batchBtn.addEventListener('click', batchBtn._hybridHandler);
    }

    // 绑定新增物品按钮
    var addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
      addItemBtn.addEventListener('click', function() {
        if (typeof editItem === 'function') editItem(null);
      });
    }

    // 绑定底部操作栏按钮
    var batchPurchaseBtn = document.getElementById('inv-batch-purchase-confirm');
    if (batchPurchaseBtn) batchPurchaseBtn.addEventListener('click', invBatchPurchase);
    var batchCancelBtn = document.getElementById('inv-batch-cancel');
    if (batchCancelBtn) batchCancelBtn.addEventListener('click', function() { toggleInvBatchMode(); });
    var suppSaveBtn = document.getElementById('inv-supp-save');
    if (suppSaveBtn) {
      suppSaveBtn.removeEventListener('click', suppSaveBtn._hybridHandler);
      suppSaveBtn._hybridHandler = function() { _saveInvSupplement(); };
      suppSaveBtn.addEventListener('click', suppSaveBtn._hybridHandler);
    }
    var suppCancelBtn = document.getElementById('inv-supp-cancel');
    if (suppCancelBtn) {
      suppCancelBtn.removeEventListener('click', suppCancelBtn._hybridHandler);
      suppCancelBtn._hybridHandler = function() { _cancelInvSupplement(); };
      suppCancelBtn.addEventListener('click', suppCancelBtn._hybridHandler);
    }

    // ESC 退出补充信息模式
    if (!document._invEscHandler) {
      document._invEscHandler = function(e) {
        if (e.key === 'Escape' && _invHybrid.supplementMode) {
          _cancelInvSupplement();
        }
      };
      document.addEventListener('keydown', document._invEscHandler);
    }
  } catch(bindErr) {
    console.warn('[InventoryHybrid] 事件绑定异常:', bindErr.message);
  }

  // 加载初始数据（带安全网：无论成功或失败都确保渲染内容）
  loadInventoryHybridData().catch(function(err) {
    console.error('[InventoryHybrid] 数据加载异常:', err.message, err.stack);
    // 强制用 mockData 兜底渲染
    try {
      _invHybrid.allItems = (typeof mockData !== 'undefined' && mockData.items) ? mockData.items.slice() : [];
      _invHybrid.grouped = {};
      _invHybrid.allItems.forEach(function(it) {
        var cat = it.category || '未分类';
        if (!_invHybrid.grouped[cat]) _invHybrid.grouped[cat] = [];
        _invHybrid.grouped[cat].push(it);
      });
      _invHybrid.categoryNames = Object.keys(_invHybrid.grouped).sort();
      renderInvInbox();
    } catch(renderErr) {
      console.error('[InventoryHybrid] 兜底渲染也失败:', renderErr.message);
      var container = document.getElementById('inv-board-new');
      if (container) container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--danger);">加载失败，请刷新页面重试</div>';
    }
  });
}

// ============================================================
// 数据加载
// ============================================================
async function loadInventoryHybridData(skipSupabaseFetch) {
  var items = [];

  // ========== 第一步：加载数据（带完整容错链） ==========
  if (!skipSupabaseFetch) {
    try {
      if (typeof SupaDB !== 'undefined' && SupaDB.getInventory) {
        items = await Promise.race([
          SupaDB.getInventory({}),
          new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error('Supabase请求超时(8s)')); }, 8000);
          })
        ]);
        console.log('[InventoryHybrid] 从 Supabase 获取库存:', items.length);
        if (items && items.length > 0) {
          _appCache.inventory = JSON.parse(JSON.stringify(items));
        }
      }
    } catch (e) {
      console.warn('[InventoryHybrid] Supabase 获取失败，回退本地缓存:', e.message);
      items = [];
    }
  }

  if (!items || items.length === 0) {
    items = (_appCache.inventory && _appCache.inventory.length > 0) ? _appCache.inventory.slice() : [];
  } else {
    try {
      var localItems = _appCache.inventory || [];
      localItems.forEach(function(localItem) {
        var exists = items.some(function(si) {
          return si.code && localItem.code && si.code === localItem.code;
        }) || items.some(function(si) {
          return si.name === localItem.name && si.brand === (localItem.brand || '') && si.model === (localItem.model || '');
        });
        if (!exists) items.push(localItem);
      });
    } catch(e) { console.warn('合并本地库存失败', e.message); }
  }

  // 最终兜底：mockData
  if (!items || items.length === 0) {
    items = (typeof mockData !== 'undefined' && mockData.items) ? mockData.items.slice() : [];
    console.log('[InventoryHybrid] 使用 mockData 兜底:', items.length, '项');
  }

  // ========== 第二步：归一化 + 渲染（try-catch 保障） ==========
  try {
    // 归一化字段名
    items.forEach(function(it) {
      if (!it.category && it.category_name) it.category = it.category_name;
      if (!it.category_name && it.category) it.category_name = it.category;
      // 确保数值字段存在
      if (it.stock === undefined || it.stock === null) it.stock = 0;
      if (it.safety_stock === undefined || it.safety_stock === null) it.safety_stock = 10;
    });

    _invHybrid.allItems = items;

    // 按分类分组
    var grouped = {};
    items.forEach(function(item) {
      var cat = item.category || '未分类';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    _invHybrid.grouped = grouped;
    _invHybrid.categoryNames = Object.keys(grouped).sort();

    // 构建采购中数量映射
    buildInvPendingMap();

    // 更新分类下拉
    updateInvCategorySelect();

    // 渲染 KPI
    renderInvKPI();

    // 渲染明细表格
    renderInvInbox();

    // 更新按钮状态
    updateInvButtonStates();

    // 更新仪表盘
    var kpiTotal = document.getElementById('kpi-total-items');
    if (kpiTotal) kpiTotal.textContent = items.length;

    console.log('[InventoryHybrid] 渲染完成:', items.length, '项,', _invHybrid.categoryNames.length, '个分类');
  } catch(renderErr) {
    console.error('[InventoryHybrid] 渲染异常:', renderErr.message, renderErr.stack);
    var container = document.getElementById('inv-board-new');
    if (container) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--danger);">数据渲染失败：' + renderErr.message + '<br><button class="btn btn-sm" onclick="loadInventoryHybridData()" style="margin-top:12px;">重试</button></div>';
    }
  }
}

// 构建采购中数量映射
function buildInvPendingMap() {
  var pendingMap = {};
  try {
    var poData = _appCache.purchaseOrders || [];
    poData.filter(function(po) { return po.status === 'pending_stockin'; }).forEach(function(po) {
      (po.items || []).forEach(function(it) {
        var key = it.name || '';
        if (!key) return;
        if (!pendingMap[key]) pendingMap[key] = [];
        pendingMap[key].push({
          poCode: po.code, poId: po.id, poDate: po.purchase_date,
          purchaser: po.purchaser || '-', supplier: it.supplier || '-',
          quantity: it.quantity || 0, unit: it.unit || '',
          price: it.price || 0, amount: it.amount || 0
        });
      });
    });
  } catch(e) { /* ignore */ }
  _invHybrid.pendingMap = pendingMap;
}

// 更新分类筛选下拉
function updateInvCategorySelect() {
  var selectId = 'inv-filter-category';
  var catNames = _invHybrid.categoryNames;
  var select = document.getElementById(selectId);
  if (!select) return;
  var currentVal = select.value;
  select.innerHTML = '<option value="">全部分类</option>' +
    catNames.map(function(c) { return '<option value="' + c + '"' + (c === currentVal ? ' selected' : '') + '>' + c + '</option>'; }).join('');
}

// ============================================================
// KPI 概览
// ============================================================
function renderInvKPI() {
  var items = _invHybrid.allItems;
  var totalItems = items.length;
  var totalStock = items.reduce(function(s, it) { return s + (it.stock || 0); }, 0);
  var lowCount = items.filter(function(it) { return it.stock < (it.safety_stock || 10) && it.stock > 0; }).length;
  var outCount = items.filter(function(it) { return it.stock === 0; }).length;
  var totalValue = items.reduce(function(s, it) { return s + (it.stock || 0) * (it.unit_price || 0); }, 0);
  var categoryCount = _invHybrid.categoryNames ? _invHybrid.categoryNames.length : 0;

  var el1 = document.getElementById('inv-kpi-total');
  if (el1) el1.textContent = totalItems;
  var el2 = document.getElementById('inv-kpi-stock');
  if (el2) el2.textContent = totalStock;
  var el3 = document.getElementById('inv-kpi-low');
  if (el3) el3.textContent = lowCount;
  var el4 = document.getElementById('inv-kpi-out');
  if (el4) el4.textContent = outCount;
  var el5 = document.getElementById('inv-kpi-value');
  if (el5) el5.textContent = '¥' + totalValue.toFixed(0);
  var el6 = document.getElementById('inv-kpi-categories');
  if (el6) el6.textContent = categoryCount;
}

// ============================================================
// 物品明细渲染（卡片分类布局）— v5.42 新设计
// ============================================================
function renderInvInbox() {
  var container = document.getElementById('inv-board-new');
  if (!container) return;

  // 补充信息模式：调用专用渲染
  if (_invHybrid.supplementMode) {
    renderInvSupplementTable();
    return;
  }

  var items = getInvFilteredItems();
  var pendingMap = _invHybrid.pendingMap;
  var batchMode = _invHybrid.batchMode;

  if (items.length === 0) {
    container.innerHTML = '<div class="anim-enter" style="text-align:center;padding:60px 0;color:var(--text-muted);font-size:0.85rem;">' +
      '<div style="font-size:2rem;margin-bottom:8px;">📭</div>' +
      '<div style="font-weight:500;">暂无匹配数据</div>' +
      '<div style="font-size:0.75rem;margin-top:4px;">尝试调整筛选条件或新增物品</div>' +
    '</div>';
    hideInvActionBar();
    return;
  }

  // 按分类分组
  var grouped = {};
  items.forEach(function(item) {
    var cat = item.category || '未分类';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  var catNames = Object.keys(grouped).sort();

  var html = '';
  catNames.forEach(function(catName, ci) {
    var catItems = grouped[catName];
    var icon = _invCatIcons[catName] || '📁';
    var totalStock = catItems.reduce(function(s, it) { return s + (it.stock || 0); }, 0);
    var lowCount = catItems.filter(function(it) { return (it.stock||0) > 0 && (it.stock||0) < (it.safety_stock||10); }).length;
    var outCount = catItems.filter(function(it) { return (it.stock||0) === 0; }).length;

    html += '<div class="cat-card-new anim-enter" style="animation-delay:' + (0.35 + ci * 0.06) + 's">';
    html += '  <div class="cat-header is-open" id="inv-cat-hdr-' + ci + '" onclick="toggleInvCard(' + ci + ')">';
    html += '    <div class="cat-icon">' + icon + '</div>';
    html += '    <div class="cat-info">';
    html += '      <div class="cat-name">' + catName;
    if (lowCount > 0) html += ' <span class="status-tag-new t-low"><span class="sd"></span>' + lowCount + ' 项低库存</span>';
    if (outCount > 0) html += ' <span class="status-tag-new t-out"><span class="sd"></span>' + outCount + ' 项缺货</span>';
    html += '      </div>';
    html += '      <div class="cat-stats">' + catItems.length + ' 种物品 · 共 ' + totalStock + ' 件</div>';
    html += '    </div>';
    html += '    <span class="cat-toggle is-open" id="inv-cat-tog-' + ci + '">▼</span>';
    html += '  </div>';
    html += '  <div class="items-wrap is-open" id="inv-cat-wrp-' + ci + '">';
    html += '    <table class="items-table"><thead><tr>';
    if (batchMode) html += '      <th style="width:32px"><input type="checkbox" class="inv-batch-th-cb" checked onchange="(function(cb){document.querySelectorAll(\'.inv-batch-cb\').forEach(function(c){c.checked=cb.checked;});updateInvBatchCount();})(this)"></th>';
    html += '      <th style="width:14%">物品名称</th><th style="width:8%">品牌</th><th style="width:7%">型号</th>';
    html += '      <th style="width:5%;text-align:center">单位</th><th style="width:10%;text-align:right">单价</th>';
    html += '      <th style="width:18%;text-align:right">库存</th><th style="width:14%;text-align:right">金额</th>';
    html += '      <th style="width:10%;text-align:right">状态</th><th style="width:14%;text-align:right">操作</th>';
    html += '    </tr></thead><tbody>';

    catItems.forEach(function(item) {
      var status = getStockStatus(item);
      var canEdit = hasPermission('edit_inventory') || hasPermission('inventory.adjust') || hasPermission('inventory.edit');
      var unitPrice = item.unit_price || 0;
      var amount = (item.stock || 0) * unitPrice;
      var pct = Math.min(100, ((item.stock||0) / ((item.safety_stock||10) || 1)) * 100);
      var ss = item.stock === 0 ? 'out' : (item.stock < (item.safety_stock||10) ? 'low' : 'safe');

      var safeDisp = item.safety_stock || 10;

      html += '<tr class="item-row" data-item-id="' + item.id + '" data-item-name="' + (item.name || '').replace(/"/g, '&quot;') + '" data-item-code="' + (item.code || '').replace(/"/g, '&quot;') + '">';
      if (batchMode) {
        html += '  <td style="text-align:center"><input type="checkbox" class="inv-batch-cb" checked data-item-id="' + item.id + '" data-item-name="' + (item.name || '').replace(/"/g, '&quot;') + '" data-item-cat="' + (item.category || '').replace(/"/g, '&quot;') + '" data-item-brand="' + (item.brand || '').replace(/"/g, '&quot;') + '" data-item-model="' + (item.model || '').replace(/"/g, '&quot;') + '" data-item-unit="' + (item.unit || '') + '" data-item-code="' + (item.code || '') + '" data-item-safety="' + (item.safety_stock || 10) + '" data-item-stock="' + (item.stock || 0) + '" onchange="updateInvBatchCount()"></td>';
      }
      html += '  <td><div class="item-cell-main"><span class="item-name"><span class="h-toggle" style="font-size:0.6rem;color:var(--text-muted);margin-right:4px;">▶</span>' + item.name + '</span><span class="item-code">' + (item.code || '') + '</span></div></td>';
      html += '  <td style="color:var(--text-secondary)">' + (item.brand || '<span style="color:var(--text-muted);">-</span>') + '</td>';
      html += '  <td style="color:var(--text-secondary);font-size:0.72rem">' + (item.model || '<span style="color:var(--text-muted);">-</span>') + '</td>';
      html += '  <td style="text-align:center">' + (item.unit || '<span style="color:var(--text-muted);">-</span>') + '</td>';
      html += '  <td class="num-cell price-cell">¥' + Number(unitPrice).toFixed(2) + '</td>';
       html += '  <td class="num-cell"><span class="stock-num s-' + ss + '">' + item.stock + '</span><span style="display:inline-block;font-size:0.6rem;color:var(--text-muted);margin:0 3px 0 4px;vertical-align:middle;">/' + safeDisp + '</span><span class="stock-bar-wrap" style="display:inline-block;vertical-align:middle;width:45px;"><span class="stock-bar s-' + ss + '" style="display:block;width:' + pct + '%"></span></span></td>';
      html += '  <td class="num-cell amount-cell">¥' + amount.toFixed(2) + '</td>';
      html += '  <td style="text-align:center"><span class="status-tag-new t-' + ss + '"><span class="sd"></span>' + status.text + '</span></td>';
      html += '  <td style="text-align:right">' + (canEdit ? '<button class="action-btn" onclick="event.cancelBubble=true;editItem(\'' + String(item.id).replace(/'/g, "\\'") + '\')">编辑</button>' : '<span style="color:var(--text-muted);font-size:0.68rem">-</span>') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
  });

  container.innerHTML = html;

  // 事件委托：点击商品行展开/收起出入库记录
  if (!_invHybrid.supplementMode) {
    container.addEventListener('click', function invRowClick(e) {
      var tr = e.target.closest('.item-row');
      if (!tr) return;
      if (e.target.closest('.action-btn')) return;
      toggleInvItemHistory(tr);
    });
  }

  // 批量模式：显示底部操作栏
  if (batchMode) {
    showInvBatchBar();
  } else {
    hideInvActionBar();
  }
}

// 切换分类卡片折叠
function toggleInvCard(index) {
  var wrap = document.getElementById('inv-cat-wrp-' + index);
  var tog = document.getElementById('inv-cat-tog-' + index);
  var hdr = document.getElementById('inv-cat-hdr-' + index);
  if (!wrap) return;
  var isOpen = wrap.classList.toggle('is-open');
  if (tog) tog.classList.toggle('is-open');
  if (hdr) hdr.classList.toggle('is-open');
}

/**
 * 点击商品行展开/收起入库记录
 */
function toggleInvItemHistory(row) {
  // 安全守卫：不在补充信息模式下才允许展开
  if (_invHybrid.supplementMode) return;

  var nextRow = row.nextElementSibling;
  // 如果已经有展开的入库记录行，收起它
  if (nextRow && nextRow.classList.contains('inv-history-row')) {
    nextRow.remove();
    row.classList.remove('inv-item-expanded');
    return;
  }

  var itemName = row.getAttribute('data-item-name') || '';
  var itemCode = row.getAttribute('data-item-code') || '';
  var itemId = row.getAttribute('data-item-id') || '';
  if (!itemName && !itemCode) return;

  // 计算列数（跨所有列）
  var totalCols = row.querySelectorAll('td').length;

  // 插入展开行
  var historyRow = document.createElement('tr');
  historyRow.className = 'inv-history-row';
  historyRow.innerHTML = '<td colspan="' + totalCols + '" style="padding:0!important;background:#f8f9fb;">' +
    '<div class="inv-history-panel" style="overflow:hidden;max-height:0;transition:max-height 0.3s ease;">' +
    '<div class="inv-history-inner" style="padding:12px 20px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
    '<span style="font-size:14px;font-weight:600;color:var(--text-primary);">📦 入库记录</span>' +
    '<span class="inv-history-loading" style="font-size:12px;color:var(--text-muted);">加载中...</span>' +
    '</div>' +
    '<div class="inv-history-content"></div>' +
    '</div></div></td>';
  row.parentNode.insertBefore(historyRow, row.nextSibling);
  row.classList.add('inv-item-expanded');

  // 动画展开
  var panel = historyRow.querySelector('.inv-history-panel');
  requestAnimationFrame(function() {
    panel.style.maxHeight = '400px';
  });

  // 从缓存合并出入库记录，形成统一时间线
  var timeline = [];
  var siRecords = (typeof _appCache !== 'undefined' && _appCache.stockInRecords) ? _appCache.stockInRecords : [];
  var soRecords = (typeof _appCache !== 'undefined' && _appCache.stockOutRecords) ? _appCache.stockOutRecords : [];

  // 入库
  siRecords.forEach(function(si) {
    (si.items || []).forEach(function(siItem) {
      var match = false;
      if (itemCode && (siItem.item_code === itemCode || siItem.code === itemCode)) match = true;
      if (!match && itemName && siItem.name === itemName) match = true;
      if (match) {
        timeline.push({
          date: si.stockin_date || (si.created_at ? si.created_at.slice(0, 10) : '-'),
          type: 'in', code: si.code || '-',
          qty: siItem.actual_quantity || 0, unit: siItem.unit || '-',
          price: siItem.price || 0,
          amount: (siItem.actual_quantity || 0) * (siItem.price || 0),
          by: si.confirmed_by || '-',
          note: (function(){try{return '批次 '+si.batch_code;}catch(e){return '';}})()
        });
      }
    });
  });

  // 出库
  soRecords.forEach(function(so) {
    (so.items || []).forEach(function(soItem) {
      var match = false;
      if (itemCode && (soItem.item_code === itemCode || soItem.code === itemCode)) match = true;
      if (!match && itemName && soItem.name === itemName) match = true;
      if (match) {
        timeline.push({
          date: so.stockout_date || (so.created_at ? so.created_at.slice(0, 10) : '-'),
          type: 'out', code: so.code || '-',
          qty: soItem.actual_quantity || soItem.quantity || 0, unit: soItem.unit || '-',
          by: so.confirmed_by || so.created_by || '-',
          note: (function(){try{var reqCode = so.requisition_code || '-'; return '领用单 '+reqCode;}catch(e){return '';}})()
        });
      }
    });
  });

  // 渲染历史记录
  var contentEl = historyRow.querySelector('.inv-history-content');
  var loadingEl = historyRow.querySelector('.inv-history-loading');

  if (timeline.length === 0) {
    if (loadingEl) loadingEl.textContent = '';
    contentEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px 0;">暂无出入库记录</div>';
    return;
  }

  // 按日期倒序
  timeline.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

  var totalIn = timeline.filter(function(r){return r.type==='in';}).reduce(function(s,r){return s+r.qty;},0);
  var totalOut = timeline.filter(function(r){return r.type==='out';}).reduce(function(s,r){return s+r.qty;},0);
  if (loadingEl) loadingEl.textContent = '共 ' + timeline.length + ' 条 · 入库 ' + totalIn + ' · 出库 ' + totalOut;

  var tableHtml = '<table class="hi-table" style="width:100%;border-collapse:collapse;font-size:0.72rem;">';
  tableHtml += '<thead><tr style="background:#efebe6;">';
  tableHtml += '<th style="padding:5px 8px;text-align:left;font-weight:500;color:var(--text-secondary);white-space:nowrap;">日期</th>';
  tableHtml += '<th style="padding:5px 8px;text-align:left;font-weight:500;color:var(--text-secondary);white-space:nowrap;width:42px;">类型</th>';
  tableHtml += '<th style="padding:5px 8px;text-align:left;font-weight:500;color:var(--text-secondary);white-space:nowrap;">单据号</th>';
  tableHtml += '<th style="padding:5px 8px;text-align:right;font-weight:500;color:var(--text-secondary);white-space:nowrap;">数量</th>';
  tableHtml += '<th style="padding:5px 8px;text-align:left;font-weight:500;color:var(--text-secondary);white-space:nowrap;">操作人</th>';
  tableHtml += '<th style="padding:5px 8px;text-align:left;font-weight:500;color:var(--text-secondary);white-space:nowrap;">备注</th>';
  tableHtml += '</tr></thead><tbody>';

  timeline.forEach(function(r) {
    var typeLabel = r.type === 'in'
      ? '<span style="color:var(--success);font-weight:600">入库</span>'
      : '<span style="color:var(--danger);font-weight:600">出库</span>';
    var qtyColor = r.type === 'in' ? 'var(--success)' : 'var(--danger)';
    tableHtml += '<tr style="border-bottom:1px solid #ede8e2;">';
    tableHtml += '<td style="padding:5px 8px;">' + r.date + '</td>';
    tableHtml += '<td style="padding:5px 8px;">' + typeLabel + '</td>';
    tableHtml += '<td style="padding:5px 8px;font-family:monospace;font-size:0.65rem;">' + r.code + '</td>';
    tableHtml += '<td style="padding:5px 8px;text-align:right;font-weight:600;color:' + qtyColor + ';">' + r.qty + ' ' + r.unit + '</td>';
    tableHtml += '<td style="padding:5px 8px;">' + r.by + '</td>';
    tableHtml += '<td style="padding:5px 8px;font-size:0.68rem;color:var(--text-muted);">' + r.note + '</td>';
    tableHtml += '</tr>';
  });

  tableHtml += '</tbody></table>';
  contentEl.innerHTML = tableHtml;
}

function getInvFilteredItems() {
  var items = _invHybrid.allItems.slice();
  var selectedCat = _invHybrid.selectedCat;
  var statusFilter = _invHybrid.currentStatusFilter;
  var searchText = _invHybrid.searchText;

  // 分类筛选
  if (selectedCat) {
    items = items.filter(function(it) { return (it.category || '未分类') === selectedCat; });
  }

  // 状态筛选
  if (statusFilter) {
    items = items.filter(function(it) {
      var s = getStockStatus(it);
      if (statusFilter === 'normal') return s.text === '正常';
      if (statusFilter === 'low') return s.text === '低库存';
      if (statusFilter === 'out') return s.text === '缺货';
      return true;
    });
  }

  // 搜索
  if (searchText) {
    items = items.filter(function(it) {
      return (it.name || '').toLowerCase().includes(searchText) ||
             (it.code || '').toLowerCase().includes(searchText) ||
             (it.brand || '').toLowerCase().includes(searchText) ||
             (it.model || '').toLowerCase().includes(searchText);
    });
  }

  return items;
}

// 折叠/展开分类明细
function toggleInvCategory(summaryId) {
  var rows = document.querySelectorAll('[data-inv-cat="' + summaryId + '"]');
  var toggle = document.getElementById(summaryId + '-toggle');
  if (!rows || rows.length === 0) return;
  var isHidden = rows[0].style.display === 'none';
  rows.forEach(function(row) {
    row.style.display = isHidden ? '' : 'none';
  });
  if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
}

// ============================================================
// 按钮状态
// ============================================================
function updateInvButtonStates() {
  var suppBtn = document.getElementById('inv-supplement-btn');
  if (suppBtn) {
    if (!hasPermission('supplement_info')) {
      suppBtn.style.display = 'none';
    } else {
      suppBtn.style.display = '';
      suppBtn.textContent = _invHybrid.supplementMode ? '完成补充' : '补充信息';
      suppBtn.className = _invHybrid.supplementMode ? 'btn btn-accent' : 'btn';
    }
  }

  var batchBtn = document.getElementById('inv-batch-purchase-btn');
  if (batchBtn) {
    if (!hasPermission('create_purchase')) {
      batchBtn.style.display = 'none';
    } else {
      batchBtn.style.display = '';
      batchBtn.textContent = _invHybrid.batchMode ? '取消购买' : '一键购买';
      batchBtn.className = _invHybrid.batchMode ? 'btn btn-danger' : 'btn';
    }
  }

  var addItemBtn = document.getElementById('add-item-btn');
  if (addItemBtn) {
    addItemBtn.style.display = _invHybrid.supplementMode ? 'none' : '';
  }
}

// ============================================================
// 批量采购模式
// ============================================================
function toggleInvBatchMode() {
  _invHybrid.batchMode = !_invHybrid.batchMode;
  _invHybrid.supplementMode = false;
  updateInvButtonStates();
  renderInvInbox();
}

function showInvBatchBar() {
  var bar = document.getElementById('inv-batch-bar');
  if (bar) {
    bar.style.display = 'flex';
    bar.classList.add('inv-actionbar-show');
  }
  // 底部操作栏的全选复选框
  var selectAllBottom = document.getElementById('inv-select-all-bottom');
  if (selectAllBottom) {
    selectAllBottom.checked = true;
  }
  // 头部表头全选复选框（由 renderInvInbox 动态创建的 th）
  var selectAllTh = document.getElementById('inv-select-all-th');
  if (selectAllTh && _invHybrid.batchMode) {
    selectAllTh.innerHTML = '<input type="checkbox" id="inv-select-all-header" checked>';
    var headerCheckbox = document.getElementById('inv-select-all-header');
    if (headerCheckbox) {
      headerCheckbox.addEventListener('change', function() {
        var checked = headerCheckbox.checked;
        document.querySelectorAll('.inv-batch-cb').forEach(function(cb) { cb.checked = checked; });
        if (selectAllBottom) selectAllBottom.checked = checked;
        updateInvBatchCount();
      });
    }
  }
  updateInvBatchCount();
}

function hideInvActionBar() {
  var batchBar = document.getElementById('inv-batch-bar');
  if (batchBar) batchBar.style.display = 'none';
  var suppBar = document.getElementById('inv-supp-bar');
  if (suppBar) suppBar.style.display = 'none';
}

function updateInvBatchCount() {
  var count = document.querySelectorAll('.inv-batch-cb:checked').length;
  var el = document.getElementById('inv-batch-count');
  if (el) el.textContent = '已选中 ' + count + ' 项';
}

function invBatchPurchase() {
  var checkboxes = document.querySelectorAll('.inv-batch-cb:checked');
  if (checkboxes.length === 0) {
    showToast('请至少勾选一项物品', 'warning');
    return;
  }

  var selectedItems = [];
  checkboxes.forEach(function(cb) {
    var stock = Number(cb.dataset.itemStock) || 0;
    var safety = Number(cb.dataset.itemSafety) || 10;
    var gap = safety - stock;
    var suggestQty = Math.max(gap > 0 ? gap * 2 : safety, 10);

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

  _invHybrid.batchMode = false;
  updateInvButtonStates();

  if (typeof switchModule === 'function') switchModule('purchase');

  setTimeout(function() {
    if (typeof openNewPurchaseModal !== 'function') return;
    openNewPurchaseModal();
    setTimeout(function() {
      if (typeof _kpiFillPurchaseForm === 'function') _kpiFillPurchaseForm(selectedItems);
    }, 200);
  }, 150);
}

// ============================================================
// 补充信息模式
// ============================================================
function toggleInvSupplementMode() {
  if (_invHybrid.supplementMode) {
    _saveInvSupplement();
    return;
  }
  _invHybrid.supplementMode = true;
  _invHybrid.batchMode = false;
  updateInvButtonStates();
  renderInvInbox();
}

function renderInvSupplementTable() {
  var items = getInvFilteredItems();
  var tableWrap = document.getElementById('inv-board-new');
  var bar = document.getElementById('inv-supp-bar');

  if (!tableWrap) return;

  // 分类下拉选项
  var catOptions = '';
  if (typeof categories !== 'undefined' && categories.length > 0) {
    catOptions = categories.map(function(c) { return '<option value="' + c.name + '">' + c.name + '</option>'; }).join('');
  } else {
    catOptions = '<option value="未分类">未分类</option><option value="循环使用类">循环使用类</option><option value="消耗类">消耗类</option>';
  }

  var html = '<div style="margin-bottom:12px;padding:10px 16px;background:var(--accent-glow);border-radius:8px;font-size:13px;color:var(--text-secondary);">✏️ 补充信息模式 — 可编辑分类、品牌、型号、单位、单价</div>';
  html += '<table class="data-table inv-table" id="supplement-table"><thead><tr>';
  html += '<th style="width:30px;">#</th><th>物品编号</th><th>物品名称</th>';
  html += '<th style="min-width:120px;">分类</th><th style="min-width:100px;">品牌</th><th style="min-width:100px;">型号</th><th style="min-width:70px;">单位</th><th style="min-width:80px;">单价</th>';
  html += '<th>库存</th><th>状态</th>';
  html += '</tr></thead><tbody>';

  items.forEach(function(item, idx) {
    var status = getStockStatus(item);
    // 修复：使用 String(item.id) 而非 parseFloat，避免 UUID 被截断
    var itemIdStr = String(item.id);
    html += '<tr>';
    html += '<td style="text-align:center;color:var(--text-muted);font-size:12px;">' + (idx + 1) + '</td>';
    html += '<td style="font-family:monospace;font-size:12px;color:var(--text-muted);">' + (item.code || '-') + '</td>';
    html += '<td style="font-weight:600;">' + item.name + '</td>';
    html += '<td><select class="supp-edit-cat" data-item-id="' + itemIdStr + '" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"><option value="">未分类</option>' + catOptions + '</select></td>';
    html += '<td><input type="text" class="supp-edit-brand" data-item-id="' + itemIdStr + '" value="' + (item.brand || '').replace(/"/g, '&quot;') + '" placeholder="品牌" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="text" class="supp-edit-model" data-item-id="' + itemIdStr + '" value="' + (item.model || '').replace(/"/g, '&quot;') + '" placeholder="型号" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="text" class="supp-edit-unit" data-item-id="' + itemIdStr + '" value="' + (item.unit || '').replace(/"/g, '&quot;') + '" placeholder="单位" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;"></td>';
    html += '<td><input type="number" class="supp-edit-price" data-item-id="' + itemIdStr + '" value="' + (item.unit_price || 0) + '" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:6px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;text-align:right;"></td>';
    html += '<td><span style="font-weight:600;color:' + (item.stock < (item.safety_stock || 10) ? 'var(--danger)' : 'var(--text-primary)') + '">' + item.stock + '</span></td>';
    html += '<td><span class="status-badge ' + status.class + '">' + status.text + '</span></td>';
    html += '</tr>';
  });

  html += '</tbody></table>';

  // 直接替换整个 table-wrap 的内容
  tableWrap.innerHTML = html;

  // 设置分类选中值
  setTimeout(function() {
    items.forEach(function(item) {
      var catSelect = tableWrap.querySelector('.supp-edit-cat[data-item-id="' + String(item.id) + '"]');
      if (catSelect && item.category) {
        catSelect.value = item.category;
      }
      [].forEach.call(tableWrap.querySelectorAll('[data-item-id="' + String(item.id) + '"]'), function(inp) {
        inp.addEventListener('change', _suppUpdateChangeCount);
        inp.addEventListener('input', _suppUpdateChangeCount);
      });
    });
  }, 50);

  // 保存原始数据
  _invHybrid.suppOriginalItems = JSON.parse(JSON.stringify(items));

  // 显示补充信息底部操作栏
  if (bar) {
    bar.style.display = 'flex';
    bar.classList.add('inv-actionbar-show');
  }

  // 隐藏批量采购栏
  var batchBar = document.getElementById('inv-batch-bar');
  if (batchBar) batchBar.style.display = 'none';
}

function _suppUpdateChangeCount() {
  var countEl = document.getElementById('inv-supp-changed-count');
  if (!countEl) return;

  var changed = 0;
  var originalItems = _invHybrid.suppOriginalItems || [];
  var tableWrap = document.getElementById('inv-board-new');

  originalItems.forEach(function(item) {
    var itemIdStr = String(item.id);
    var catEl = tableWrap ? tableWrap.querySelector('.supp-edit-cat[data-item-id="' + itemIdStr + '"]') : null;
    var brandEl = tableWrap ? tableWrap.querySelector('.supp-edit-brand[data-item-id="' + itemIdStr + '"]') : null;
    var modelEl = tableWrap ? tableWrap.querySelector('.supp-edit-model[data-item-id="' + itemIdStr + '"]') : null;
    var unitEl = tableWrap ? tableWrap.querySelector('.supp-edit-unit[data-item-id="' + itemIdStr + '"]') : null;
    var priceEl = tableWrap ? tableWrap.querySelector('.supp-edit-price[data-item-id="' + itemIdStr + '"]') : null;

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

// ============================================================
// 补充信息保存 — 修复 UUID + category_name 问题
// ============================================================
async function _saveInvSupplement() {
  var tableWrap = document.getElementById('inv-board-new');
  if (!tableWrap) return;

  // 防止重复点击：禁用按钮 + 显示保存中状态
  var saveBtn = document.getElementById('inv-supp-save');
  var cancelBtn = document.getElementById('inv-supp-cancel');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }
  if (cancelBtn) cancelBtn.disabled = true;

  try {

  var changedItems = [];
  var errors = [];

  // 遍历 DOM，收集改动
  [].forEach.call(tableWrap.querySelectorAll('.supp-edit-cat'), function(catEl) {
    // 修复：不再使用 parseFloat，直接用 String 保留 UUID
    var itemId = String(catEl.dataset.itemId);
    var brandEl = tableWrap.querySelector('.supp-edit-brand[data-item-id="' + itemId + '"]');
    var modelEl = tableWrap.querySelector('.supp-edit-model[data-item-id="' + itemId + '"]');
    var unitEl = tableWrap.querySelector('.supp-edit-unit[data-item-id="' + itemId + '"]');
    var priceEl = tableWrap.querySelector('.supp-edit-price[data-item-id="' + itemId + '"]');

    // 从原始数据中比对
    var origItem = null;
    if (_invHybrid.suppOriginalItems) {
      origItem = _invHybrid.suppOriginalItems.find(function(i) { return String(i.id) === itemId; });
    }
    if (!origItem && _appCache.inventory) {
      origItem = _appCache.inventory.find(function(i) { return String(i.id) === itemId; });
    }

    var newCat = catEl.value.trim() || '未分类';
    var newBrand = brandEl ? brandEl.value.trim() : '';
    var newModel = modelEl ? modelEl.value.trim() : '';
    var newUnit = unitEl ? unitEl.value.trim() : '';
    var newPrice = priceEl ? Number(priceEl.value || 0) : 0;

    // 判断是否有修改
    if (origItem) {
      if ((origItem.category || '') === newCat &&
          (origItem.brand || '') === newBrand &&
          (origItem.model || '') === newModel &&
          (origItem.unit || '') === newUnit &&
          (origItem.unit_price || 0) === newPrice) {
        return; // 无变化
      }
    }

    // 关键修复：写入 category_name（Supabase 列名），而不是 category
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
    _invHybrid.supplementMode = false;
    updateInvButtonStates();
    loadInventoryHybridData(true);
    return;
  }

  // 逐个写入 Supabase
  var successCount = 0;
  for (var i = 0; i < changedItems.length; i++) {
    var ci = changedItems[i];
    try {
      if (typeof SupaDB !== 'undefined' && SupaDB.updateInventoryItem) {
        console.log('[InventoryHybrid] 写入数据库: itemId=' + ci.id, ci.data);
        await SupaDB.updateInventoryItem(ci.id, ci.data);
        successCount++;
      } else {
        errors.push('SupaDB 不可用');
        break;
      }
    } catch (e) {
      console.warn('[InventoryHybrid] 写入数据库失败 itemId=' + ci.id + ': ' + e.message);
      errors.push('物品#' + ci.id + ': ' + e.message);
    }
  }

  // 更新本地缓存
  if (successCount > 0 && _appCache.inventory) {
    var inv = JSON.parse(JSON.stringify(_appCache.inventory));
    changedItems.forEach(function(ci) {
      var idx = inv.findIndex(function(i) { return String(i.id) === String(ci.id); });
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

  // 云端刷新
  var allSuccess = errors.length === 0;
  if (allSuccess && successCount > 0) {
    try {
      if (typeof refreshData === 'function') {
        await refreshData('inventory');
        console.log('[InventoryHybrid] 云端刷新完成');
      }
    } catch (e) {
      console.warn('[InventoryHybrid] 云端刷新失败: ' + e.message);
    }
  }

  // 反馈
  var msg;
  if (allSuccess) {
    msg = '已保存 ' + successCount + ' 项到数据库';
    showToast(msg, 'success');
  } else if (successCount > 0) {
    msg = '部分保存成功: ' + successCount + ' 项，' + errors.length + ' 项失败';
    showToast(msg, 'warning');
  } else {
    msg = '保存失败，无法连接到数据库';
    showToast(msg, 'error');
  }

  } finally {
    // 无论成功还是失败，确保退出补充信息模式并恢复按钮
    _invHybrid.supplementMode = false;
    updateInvButtonStates();
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存补充信息'; }
    if (cancelBtn) cancelBtn.disabled = false;
    // 立即隐藏补充信息操作栏
    var suppBar = document.getElementById('inv-supp-bar');
    if (suppBar) suppBar.style.display = 'none';
  }

  // 重新渲染（全量数据重新加载 + 按新分类重新分组排版）
  loadInventoryHybridData();
}

function _cancelInvSupplement() {
  _invHybrid.supplementMode = false;
  updateInvButtonStates();
  // 立即隐藏补充信息操作栏（不等异步刷新）
  var suppBar = document.getElementById('inv-supp-bar');
  if (suppBar) suppBar.style.display = 'none';
  loadInventoryHybridData();
}

// ============================================================
// 兼容旧入口：让 loadInventory 路由到明细视图
// ============================================================
// 重写 app.js 中的 loadInventory，让它调用明细视图
var _origLoadInventory = window.loadInventory;
window.loadInventory = function(skipSupabaseFetch) {
  if (typeof loadInventoryHybridData === 'function') {
    loadInventoryHybridData(skipSupabaseFetch);
  } else if (_origLoadInventory) {
    _origLoadInventory(skipSupabaseFetch);
  }
};

// 重写 _invToggleBatchMode
var _origInvToggleBatch = window._invToggleBatchMode;
window._invToggleBatchMode = function() {
  toggleInvBatchMode();
};

// 注意：toggleInvSupplementMode / _saveInvSupplement / _cancelInvSupplement
// 已通过 function 声明提升到全局作用域，自动覆盖 app.js 中的同名函数
// 不再使用 window.xxx = ... 重写（会导致自引用无限递归 → RangeError）
