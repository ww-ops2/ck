/**
 * 出库管理模块 - 领用申请 + 出库确认 + 库存扣减
 * 流程：其他角色申请领用 → 推送仓库 → 仓库确认出库 → 库存扣减
 */

let requisitions = [];

// 物品选择器状态
let _reqInventoryCache = [];
let _reqSelectedItems = [];
let _editReqSelectedItems = []; // 编辑模式已选物品

// 团期名称列表
let _tourNames = [];

// 当前正在确认出库的领用单ID
let _currentStockOutReqId = null;

/**
 * 场景名称标准化（兼容旧数据：餐车→列车餐车，客房→列车客房）
 */
function _normalizeScenario(s) {
  if (!s) return '其他';
  if (s === '餐车') return '列车餐车';
  if (s === '客房') return '列车客房';
  return s;
}

/**
 * 初始化出库模块
 */
function initRequisitionModule() {
  // 新建领用单按钮 - 仅员工和管理员可见
  const createBtn = document.getElementById('create-requisition-btn');
  if (createBtn) {
    const role = currentUser ? currentUser.role : '';
    if (role === 'staff' || role === 'admin') {
      createBtn.style.display = '';
    } else {
      createBtn.style.display = 'none';
    }
    createBtn.addEventListener('click', openRequisitionModal);
  }

  // 提交领用单按钮
  const submitBtn = document.getElementById('submit-requisition-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitRequisition);
  }

  // 保存编辑领用单按钮
  const saveBtn = document.getElementById('save-requisition-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveRequisitionEdit);
  }

  // 分类筛选 & 搜索（新建）
  const filterCat = document.getElementById('req-filter-category');
  if (filterCat) {
    filterCat.addEventListener('change', _renderAvailableItems);
  }
  const searchInput = document.getElementById('req-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', _renderAvailableItems);
  }

  // 分类筛选 & 搜索（编辑）
  const editFilterCat = document.getElementById('edit-req-filter-category');
  if (editFilterCat) {
    editFilterCat.addEventListener('change', _renderEditAvailableItems);
  }
  const editSearchInput = document.getElementById('edit-req-search-input');
  if (editSearchInput) {
    editSearchInput.addEventListener('input', _renderEditAvailableItems);
  }

  // 团期名称下拉（新建）
  _initTourNameDropdown('tour-name-input', 'tour-name-list');
  // 团期名称下拉（编辑）
  _initTourNameDropdown('edit-tour-name-input', 'edit-tour-name-list');

  // 出库确认模态框按钮
  const previewDiffBtn = document.getElementById('stockout-preview-diff-btn');
  if (previewDiffBtn) {
    previewDiffBtn.addEventListener('click', _previewStockOutDiff);
  }
  const finalConfirmBtn = document.getElementById('stockout-final-confirm-btn');
  if (finalConfirmBtn) {
    finalConfirmBtn.addEventListener('click', _finalConfirmStockOut);
  }

  // 出库状态筛选
  const filterSelect = document.getElementById('filter-stockout-status');
  if (filterSelect) {
    filterSelect.addEventListener('change', loadStockOutRecords);
  }

  // 加载数据
  loadRequisitions();
  loadStockOutRecords();
}

/**
 * 初始化团期名称可搜索下拉
 */
function _initTourNameDropdown(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  input.addEventListener('focus', function() {
    _loadTourNames();
    _renderTourNameList(input.value.trim(), inputId, listId);
    list.style.display = 'block';
  });

  input.addEventListener('input', function() {
    _renderTourNameList(input.value.trim(), inputId, listId);
    list.style.display = 'block';
  });

  document.addEventListener('click', function(e) {
    const dropdown = input.parentElement;
    if (dropdown && !dropdown.contains(e.target)) {
      list.style.display = 'none';
    }
  });
}

/**
 * 从已有领用单中收集团期名称
 */
function _loadTourNames() {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);

  const nameSet = new Set();
  reqList.forEach(r => {
    if (r.tour_name) nameSet.add(r.tour_name);
  });
  _tourNames = [...nameSet].sort();
}

/**
 * 渲染团期名称下拉列表
 */
function _renderTourNameList(keyword, inputId, listId) {
  const list = document.getElementById(listId);
  const input = document.getElementById(inputId);
  if (!list || !input) return;

  const filtered = keyword
    ? _tourNames.filter(n => n.toLowerCase().includes(keyword.toLowerCase()))
    : _tourNames;

  let html = '';
  filtered.forEach(name => {
    html += `<div class="tour-name-option" data-value="${_escapeHtml(name)}">${_escapeHtml(name)}</div>`;
  });

  if (keyword && !_tourNames.includes(keyword)) {
    html += `<div class="tour-name-option add-new" data-value="${_escapeHtml(keyword)}">+ 新增「${_escapeHtml(keyword)}」</div>`;
  }

  if (!html) {
    html = '<div class="tour-name-empty">暂无团期，直接输入后点击添加</div>';
  }

  list.innerHTML = html;

  // 绑定选项点击事件
  list.querySelectorAll('.tour-name-option').forEach(opt => {
    opt.addEventListener('click', function() {
      input.value = this.dataset.value;
      list.style.display = 'none';
    });
  });
}

/**
 * HTML转义
 */
function _escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 获取所有物品在待出库领用单中的占用数量
 */
function _getPendingQuantities(excludeReqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);

  const pending = {};
  reqList.forEach(req => {
    if (req.status === 'pending_outbound' && req.id !== excludeReqId) {
      if (req.items) {
        req.items.forEach(item => {
          const id = String(item.item_id);
          pending[id] = (pending[id] || 0) + item.quantity;
        });
      }
    }
  });
  return pending;
}

/**
 * 打开领用单模态框
 */
function openRequisitionModal() {
  const form = document.getElementById('requisition-form');
  if (form) {
    form.reset();
    const today = new Date().toISOString().split('T')[0];
    const applyDateInput = form.querySelector('[name="apply_date"]');
    if (applyDateInput) applyDateInput.value = today;
    const tourDateInput = form.querySelector('[name="tour_date"]');
    if (tourDateInput) tourDateInput.value = today;
    if (currentUser) {
      const applicantInput = form.querySelector('[name="applicant"]');
      if (applicantInput) applicantInput.value = currentUser.name;
    }
  }

  // 清空已选物品
  _reqSelectedItems = [];

  // 从localStorage加载库存物品
  let inventory = [];
  const invData = localStorage.getItem('inventory');
  if (invData) inventory = JSON.parse(invData);
  if (inventory.length === 0) {
    inventory = [
      { id: 1, code: 'ITEM001', name: '矿泉水', category: '饮品', stock: 500, unit: '瓶' },
      { id: 2, code: 'ITEM002', name: '方便面', category: '食品', stock: 200, unit: '箱' },
      { id: 3, code: 'ITEM003', name: '纸巾', category: '日用品', stock: 80, unit: '包' }
    ];
  }
  _reqInventoryCache = inventory;

  // 填充分类下拉
  _populateCategoryFilter('req-filter-category', inventory);

  // 清空搜索
  const searchInput = document.getElementById('req-search-input');
  if (searchInput) searchInput.value = '';

  // 清空团期名称
  const tourNameInput = document.getElementById('tour-name-input');
  if (tourNameInput) tourNameInput.value = '';
  const tourNameList = document.getElementById('tour-name-list');
  if (tourNameList) tourNameList.style.display = 'none';

  // 渲染可选物品和已选物品
  _renderAvailableItems();
  _renderSelectedItems();

  openModal('modal-requisition');
}

/**
 * 填充分类筛选下拉
 */
function _populateCategoryFilter(selectId, inventory) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const categories = [...new Set(inventory.map(it => it.category || '未分类'))];
  categories.sort();

  select.innerHTML = '<option value="">全部分类</option>' +
    categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

/**
 * 渲染可选物品列表（新建模式）
 */
function _renderAvailableItems() {
  const container = document.getElementById('req-available-items');
  if (!container) return;

  const filterCat = document.getElementById('req-filter-category')?.value || '';
  const keyword = (document.getElementById('req-search-input')?.value || '').trim().toLowerCase();

  let items = _reqInventoryCache.slice();

  if (filterCat) {
    items = items.filter(it => (it.category || '未分类') === filterCat);
  }
  if (keyword) {
    items = items.filter(it =>
      it.name.toLowerCase().includes(keyword) ||
      (it.code || '').toLowerCase().includes(keyword)
    );
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">未找到匹配的物品</div>';
    return;
  }

  const selectedIds = _reqSelectedItems.map(s => String(s.item_id));
  const pendingMap = _getPendingQuantities(null);

  container.innerHTML = items.map(item => {
    const isSelected = selectedIds.includes(String(item.id));
    const pendingQty = pendingMap[String(item.id)] || 0;
    const available = item.stock - pendingQty;
    const stockColor = available <= 0 ? 'var(--danger)' : (available < 10 ? 'var(--warning)' : 'var(--text-primary)');
    const cat = item.category || '未分类';

    return `
      <div class="item-picker-row" data-item-id="${item.id}">
        <div class="item-picker-info">
          <div class="item-picker-name">${_escapeHtml(item.name)}${item.brand ? ' (' + _escapeHtml(item.brand) + ')' : ''}
            <span class="item-picker-category-tag">${_escapeHtml(cat)}</span>
          </div>
          <div class="item-picker-meta">${_escapeHtml(item.code)}${item.model ? ' · ' + _escapeHtml(item.model) : ''}</div>
        </div>
        <div class="item-picker-stock" style="color:${stockColor}">
          库存 ${item.stock}${pendingQty > 0 ? ` <span style="font-size:11px;">(占用${pendingQty}, 可用${available})</span>` : ''} ${item.unit}
        </div>
        ${isSelected
          ? `<button class="item-picker-add-btn added" disabled>已添加</button>`
          : available <= 0
            ? `<button class="item-picker-add-btn added" disabled>无可用</button>`
            : `<button class="item-picker-add-btn" onclick="_addItemToRequisition('${item.id}')">+ 添加</button>`
        }
      </div>
    `;
  }).join('');
}

/**
 * 渲染可选物品列表（编辑模式）
 */
function _renderEditAvailableItems() {
  const container = document.getElementById('edit-req-available-items');
  if (!container) return;

  const filterCat = document.getElementById('edit-req-filter-category')?.value || '';
  const keyword = (document.getElementById('edit-req-search-input')?.value || '').trim().toLowerCase();

  let items = _reqInventoryCache.slice();

  if (filterCat) {
    items = items.filter(it => (it.category || '未分类') === filterCat);
  }
  if (keyword) {
    items = items.filter(it =>
      it.name.toLowerCase().includes(keyword) ||
      (it.code || '').toLowerCase().includes(keyword)
    );
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">未找到匹配的物品</div>';
    return;
  }

  const editReqId = parseInt(document.getElementById('edit-req-id')?.value) || null;
  const selectedIds = _editReqSelectedItems.map(s => String(s.item_id));
  const pendingMap = _getPendingQuantities(editReqId);

  container.innerHTML = items.map(item => {
    const isSelected = selectedIds.includes(String(item.id));
    const pendingQty = pendingMap[String(item.id)] || 0;
    const available = item.stock - pendingQty;
    const stockColor = available <= 0 ? 'var(--danger)' : (available < 10 ? 'var(--warning)' : 'var(--text-primary)');
    const cat = item.category || '未分类';

    return `
      <div class="item-picker-row" data-item-id="${item.id}">
        <div class="item-picker-info">
          <div class="item-picker-name">${_escapeHtml(item.name)}${item.brand ? ' (' + _escapeHtml(item.brand) + ')' : ''}
            <span class="item-picker-category-tag">${_escapeHtml(cat)}</span>
          </div>
          <div class="item-picker-meta">${_escapeHtml(item.code)}${item.model ? ' · ' + _escapeHtml(item.model) : ''}</div>
        </div>
        <div class="item-picker-stock" style="color:${stockColor}">
          库存 ${item.stock}${pendingQty > 0 ? ` <span style="font-size:11px;">(占用${pendingQty}, 可用${available})</span>` : ''} ${item.unit}
        </div>
        ${isSelected
          ? `<button class="item-picker-add-btn added" disabled>已添加</button>`
          : available <= 0
            ? `<button class="item-picker-add-btn added" disabled>无可用</button>`
            : `<button class="item-picker-add-btn" onclick="_addItemToEditRequisition('${item.id}')">+ 添加</button>`
        }
      </div>
    `;
  }).join('');
}

/**
 * 添加物品到已选列表（新建模式）
 */
function _addItemToRequisition(itemId) {
  const item = _reqInventoryCache.find(it => String(it.id) === String(itemId));
  if (!item) return;

  if (_reqSelectedItems.find(s => String(s.item_id) === String(itemId))) return;

  const pendingMap = _getPendingQuantities(null);
  const pendingQty = pendingMap[String(item.id)] || 0;

  _reqSelectedItems.push({
    item_id: String(item.id),
    name: item.name,
    code: item.code,
    category: item.category || '未分类',
    unit: item.unit,
    stock: item.stock,
    brand: item.brand || '',
    model: item.model || '',
    pendingQty: pendingQty,
    quantity: 1
  });

  _renderAvailableItems();
  _renderSelectedItems();
}

/**
 * 添加物品到已选列表（编辑模式）
 */
function _addItemToEditRequisition(itemId) {
  const item = _reqInventoryCache.find(it => String(it.id) === String(itemId));
  if (!item) return;

  if (_editReqSelectedItems.find(s => String(s.item_id) === String(itemId))) return;

  const editReqId = parseInt(document.getElementById('edit-req-id')?.value) || null;
  const pendingMap = _getPendingQuantities(editReqId);
  const pendingQty = pendingMap[String(item.id)] || 0;

  _editReqSelectedItems.push({
    item_id: String(item.id),
    name: item.name,
    code: item.code,
    category: item.category || '未分类',
    unit: item.unit,
    stock: item.stock,
    brand: item.brand || '',
    model: item.model || '',
    pendingQty: pendingQty,
    quantity: 1
  });

  _renderEditAvailableItems();
  _renderEditSelectedItems();
}

/**
 * 从已选列表移除物品（新建模式）
 */
function _removeItemFromRequisition(itemId) {
  _reqSelectedItems = _reqSelectedItems.filter(s => String(s.item_id) !== String(itemId));
  _renderAvailableItems();
  _renderSelectedItems();
}

/**
 * 从已选列表移除物品（编辑模式）
 */
function _removeItemFromEditRequisition(itemId) {
  _editReqSelectedItems = _editReqSelectedItems.filter(s => String(s.item_id) !== String(itemId));
  _renderEditAvailableItems();
  _renderEditSelectedItems();
}

/**
 * 更新已选物品数量（新建模式）
 */
function _updateSelectedItemQty(itemId, qty) {
  const item = _reqSelectedItems.find(s => String(s.item_id) === String(itemId));
  if (!item) return;
  const parsed = parseInt(qty) || 1;
  const available = item.stock - item.pendingQty;
  item.quantity = Math.max(1, Math.min(parsed, available));
  const countSpan = document.getElementById('req-selected-count');
  if (countSpan) countSpan.textContent = _reqSelectedItems.length;
  // 更新状态提示
  const row = document.querySelector(`#req-selected-tbody tr[data-item-id="${item.item_id}"]`);
  if (row) {
    const statusTd = row.querySelector('.req-row-status');
    if (statusTd) {
      if (item.quantity > available) {
        statusTd.innerHTML = '<span style="color:var(--danger);font-size:12px;font-weight:600;">超库存!</span>';
      } else {
        statusTd.innerHTML = `<span style="color:var(--success);font-size:12px;">可用 ${available}</span>`;
      }
    }
    // 更新输入框样式
    const qtyInput = row.querySelector('.req-qty-input');
    if (qtyInput) {
      qtyInput.style.borderColor = item.quantity > available ? 'var(--danger)' : '';
      qtyInput.style.color = item.quantity > available ? 'var(--danger)' : '';
    }
  }
}

/**
 * 更新已选物品数量（编辑模式）
 */
function _updateEditSelectedItemQty(itemId, qty) {
  const item = _editReqSelectedItems.find(s => String(s.item_id) === String(itemId));
  if (!item) return;
  const parsed = parseInt(qty) || 1;
  const available = item.stock - item.pendingQty;
  item.quantity = Math.max(1, Math.min(parsed, available));
  const countSpan = document.getElementById('edit-req-selected-count');
  if (countSpan) countSpan.textContent = _editReqSelectedItems.length;
  const row = document.querySelector(`#edit-req-selected-tbody tr[data-item-id="${item.item_id}"]`);
  if (row) {
    const statusTd = row.querySelector('.req-row-status');
    if (statusTd) {
      if (item.quantity > available) {
        statusTd.innerHTML = '<span style="color:var(--danger);font-size:12px;font-weight:600;">超库存!</span>';
      } else {
        statusTd.innerHTML = `<span style="color:var(--success);font-size:12px;">可用 ${available}</span>`;
      }
    }
    const qtyInput = row.querySelector('.req-qty-input');
    if (qtyInput) {
      qtyInput.style.borderColor = item.quantity > available ? 'var(--danger)' : '';
      qtyInput.style.color = item.quantity > available ? 'var(--danger)' : '';
    }
  }
}

/**
 * 渲染已选物品表格（新建模式）
 */
function _renderSelectedItems() {
  const tbody = document.getElementById('req-selected-tbody');
  const countSpan = document.getElementById('req-selected-count');
  if (!tbody) return;

  if (countSpan) countSpan.textContent = _reqSelectedItems.length;

  if (_reqSelectedItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂未选择物品</td></tr>';
    return;
  }

  tbody.innerHTML = _reqSelectedItems.map(item => {
    const available = item.stock - item.pendingQty;
    let statusHtml = '';
    if (item.quantity > available) {
      statusHtml = '<span style="color:var(--danger);font-size:12px;font-weight:600;">超库存!</span>';
    } else {
      statusHtml = `<span style="color:var(--success);font-size:12px;">可用 ${available}</span>`;
    }

    return `
      <tr data-item-id="${item.item_id}">
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${_escapeHtml(item.code)}</td>
        <td style="font-weight:600;">${_escapeHtml(item.name)}</td>
        <td>${_escapeHtml(item.category)}</td>
        <td>${_escapeHtml(item.brand || '-')}</td>
        <td>${_escapeHtml(item.model || '-')}</td>
        <td>${_escapeHtml(item.unit)}</td>
        <td>
          ${item.pendingQty > 0
            ? `<span style="color:var(--warning);font-weight:600;">${item.pendingQty}</span>`
            : '<span style="color:var(--text-muted);">0</span>'}
        </td>
        <td>
          <span style="font-weight:600;color:${item.stock < 10 ? 'var(--danger)' : 'var(--text-primary)'}">${item.stock}</span>
        </td>
        <td>
          <input type="number" class="req-qty-input" value="${item.quantity}" min="1" max="${available}"
            onchange="_updateSelectedItemQty('${item.item_id}', this.value)"
            onblur="_updateSelectedItemQty('${item.item_id}', this.value)"
            style="${item.quantity > available ? 'border-color:var(--danger);color:var(--danger);' : ''}">
          <div class="req-row-status">${statusHtml}</div>
        </td>
        <td>
          <button class="req-remove-btn" onclick="_removeItemFromRequisition('${item.item_id}')">移除</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 渲染已选物品表格（编辑模式）
 */
function _renderEditSelectedItems() {
  const tbody = document.getElementById('edit-req-selected-tbody');
  const countSpan = document.getElementById('edit-req-selected-count');
  if (!tbody) return;

  if (countSpan) countSpan.textContent = _editReqSelectedItems.length;

  if (_editReqSelectedItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂未选择物品</td></tr>';
    return;
  }

  tbody.innerHTML = _editReqSelectedItems.map(item => {
    const available = item.stock - item.pendingQty;
    let statusHtml = '';
    if (item.quantity > available) {
      statusHtml = '<span style="color:var(--danger);font-size:12px;font-weight:600;">超库存!</span>';
    } else {
      statusHtml = `<span style="color:var(--success);font-size:12px;">可用 ${available}</span>`;
    }

    return `
      <tr data-item-id="${item.item_id}">
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${_escapeHtml(item.code)}</td>
        <td style="font-weight:600;">${_escapeHtml(item.name)}</td>
        <td>${_escapeHtml(item.category)}</td>
        <td>${_escapeHtml(item.brand || '-')}</td>
        <td>${_escapeHtml(item.model || '-')}</td>
        <td>${_escapeHtml(item.unit)}</td>
        <td>
          <span style="font-weight:600;color:${item.stock < 10 ? 'var(--danger)' : 'var(--text-primary)'}">${item.stock}</span>
        </td>
        <td>
          <input type="number" class="req-qty-input" value="${item.quantity}" min="1" max="${available}"
            onchange="_updateEditSelectedItemQty('${item.item_id}', this.value)"
            onblur="_updateEditSelectedItemQty('${item.item_id}', this.value)"
            style="${item.quantity > available ? 'border-color:var(--danger);color:var(--danger);' : ''}">
          <div class="req-row-status">${statusHtml}</div>
        </td>
        <td>
          <button class="req-remove-btn" onclick="_removeItemFromEditRequisition('${item.item_id}')">移除</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 提交领用申请
 */
function submitRequisition() {
  const form = document.getElementById('requisition-form');
  if (!form) return;

  const applyDate = form.querySelector('[name="apply_date"]').value;
  const tourDate = form.querySelector('[name="tour_date"]').value;
  const tourName = form.querySelector('[name="tour_name"]').value.trim();
  const scenario = form.querySelector('[name="scenario"]').value;
  const applicant = form.querySelector('[name="applicant"]').value;
  const remark = form.querySelector('[name="remark"]').value;

  if (!applyDate || !tourDate || !tourName || !scenario || !applicant) {
    showToast('请填写申请日期、团期日期、团期名称、使用场景和申请人', 'warning');
    return;
  }

  if (_reqSelectedItems.length === 0) {
    showToast('请至少添加一个物品', 'warning');
    return;
  }

  // 获取最新的占用量
  const pendingMap = _getPendingQuantities(null);
  let hasError = false;
  const items = _reqSelectedItems.map(s => {
    const currentPending = pendingMap[String(s.item_id)] || 0;
    const available = s.stock - currentPending;

    if (s.quantity <= 0) {
      hasError = true;
      showToast(`"${s.name}" 的领用数量必须大于0`, 'warning');
      return null;
    }
    if (s.quantity > available) {
      hasError = true;
      showToast(`"${s.name}" 领用数量(${s.quantity}) + 其他领用单已占用(${currentPending}) = ${s.quantity + currentPending}，超过当前库存(${s.stock})，请减少数量`, 'warning');
      return null;
    }
    return {
      item_id: s.item_id,
      name: s.name,
      code: s.code,
      category: s.category,
      unit: s.unit,
      quantity: s.quantity,
      brand: s.brand,
      model: s.model
    };
  });

  if (hasError) return;

  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  // === 超额领用检测 ===
  if (typeof checkOverLimit === 'function') {
    const overLimitWarnings = [];
    items.forEach(it => {
      const result = checkOverLimit(it.name, scenario, it.quantity, tourName);
      if (result.overLimit) {
        overLimitWarnings.push(result.message);
      }
    });

    if (overLimitWarnings.length > 0) {
      const warningMsg = '以下物品超过领用标准上限：\n\n' +
        overLimitWarnings.join('\n') +
        '\n\n是否仍要继续提交？';
      // 注：showConfirm 为异步回调，此处需同步阻塞，暂用原生 confirm
      if (!confirm(warningMsg)) return;
    }
  }

  const requisition = {
    id: Date.now(),
    code: 'RQ' + Date.now().toString().slice(-8),
    tour_date: tourDate,
    tour_name: tourName,
    scenario: scenario,
    applicant: applicant,
    apply_date: applyDate,
    items: items,
    total_quantity: totalQty,
    status: 'pending_outbound',
    remark: remark,
    created_at: new Date().toISOString()
  };

  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  reqList.push(requisition);
  localStorage.setItem('requisitions', JSON.stringify(reqList));

  closeModal();
  loadRequisitions();
  loadStockOutRecords();
  updateKPICards();
  if (typeof refreshAllBusinessKPI === 'function') refreshAllBusinessKPI();

  showToast(`领用申请 ${requisition.code} 已提交，已推送至仓库管理员待出库`, 'success');
  console.log('领用单创建成功:', requisition);
}

/**
 * 加载领用单列表
 */
function loadRequisitions() {
  const tbody = document.getElementById('requisition-tbody');
  if (!tbody) return;

  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);

  reqList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (reqList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无领用单</td></tr>';
    return;
  }

  const role = currentUser ? currentUser.role : '';
  const currentUserName = currentUser ? currentUser.name : '';

  tbody.innerHTML = reqList.map(req => {
    const statusText = getReqStatusText(req.status);
    const statusClass = getReqStatusClass(req.status);
    const canConfirm = req.status === 'pending_outbound' && hasPermission('confirm_stockout');
    // 申请人且待出库状态可撤回/修改/删除
    const isOwner = req.status === 'pending_outbound' && (
      req.applicant === currentUserName || role === 'admin'
    );

    let actionBtns = `<button class="btn btn-sm" onclick="viewRequisitionDetail(${req.id})">查看</button>`;
    if (canConfirm) {
      actionBtns += ` <button class="btn btn-sm" onclick="confirmStockOut(${req.id})" style="background:var(--success);border-color:var(--success);color:#fff;">确认出库</button>`;
    }
    if (isOwner && !canConfirm) {
      actionBtns += ` <button class="btn btn-sm" onclick="editRequisition(${req.id})" style="background:var(--accent);border-color:var(--accent);color:#fff;">修改</button>`;
      actionBtns += ` <button class="btn btn-sm" onclick="withdrawRequisition(${req.id})" style="background:var(--warning);border-color:var(--warning);color:#fff;">撤回</button>`;
      actionBtns += ` <button class="btn btn-sm" onclick="deleteRequisition(${req.id})" style="background:var(--danger);border-color:var(--danger);color:#fff;">删除</button>`;
    }
    // 管理员既能确认出库也能撤回/修改/删除
    if (isOwner && canConfirm) {
      actionBtns += ` <button class="btn btn-sm" onclick="editRequisition(${req.id})" style="background:var(--accent);border-color:var(--accent);color:#fff;">修改</button>`;
      actionBtns += ` <button class="btn btn-sm" onclick="withdrawRequisition(${req.id})" style="background:var(--warning);border-color:var(--warning);color:#fff;">撤回</button>`;
      actionBtns += ` <button class="btn btn-sm" onclick="deleteRequisition(${req.id})" style="background:var(--danger);border-color:var(--danger);color:#fff;">删除</button>`;
    }

    return `
      <tr>
        <td>${req.code}</td>
        <td>${req.tour_date || '-'}</td>
        <td>${_escapeHtml(req.tour_name || '-')}</td>
        <td>${_normalizeScenario(req.scenario)}</td>
        <td>${req.applicant}</td>
        <td>${req.apply_date}</td>
        <td>${req.items.length} 种 / ${req.total_quantity} 件</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${actionBtns}</td>
      </tr>
    `;
  }).join('');
}

/**
 * 查看领用单详情 - 模态框渲染
 */
function viewRequisitionDetail(reqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === reqId);
  if (!req) return;

  const statusText = getReqStatusText(req.status);
  const statusClass = getReqStatusClass(req.status);

  const body = document.getElementById('requisition-detail-body');
  if (!body) return;

  let itemsHtml = '';
  if (req.items && req.items.length > 0) {
    // 检查超额领用
    const overLimitInfo = {};
    if (typeof getConsumptionStandard === 'function') {
      req.items.forEach(item => {
        const std = getConsumptionStandard(item.name, req.scenario);
        if (std) {
          const result = checkOverLimit(item.name, req.scenario, 0, req.tour_name);
          overLimitInfo[item.name] = {
            standard: std.max_per_tour,
            totalUsed: result.currentTotal,
            overLimit: result.currentTotal > std.max_per_tour
          };
        }
      });
    }

    itemsHtml = `
      <div class="detail-section-title">领用明细</div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>物品编号</th>
              <th>物品名称</th>
              <th>分类</th>
              <th>品牌</th>
              <th>型号</th>
              <th>数量</th>
              <th>单位</th>
              <th>标准</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${req.items.map((item, i) => {
              const info = overLimitInfo[item.name];
              const overBadge = info && info.overLimit
                ? `<span style="background:#fde8e8;color:#e53935;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;">超额</span>`
                : (info ? `<span style="background:#e8f5e9;color:#2e7d32;padding:2px 6px;border-radius:8px;font-size:11px;">正常</span>` : '-');
              const stdText = info ? `${info.standard}/团期` : '-';
              return `
              <tr${info && info.overLimit ? ' style="background:#fff8f0;"' : ''}>
                <td>${i + 1}</td>
                <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${_escapeHtml(item.code)}</td>
                <td style="font-weight:600;">${_escapeHtml(item.name)}</td>
                <td>${_escapeHtml(item.category || '-')}</td>
                <td>${_escapeHtml(item.brand || '-')}</td>
                <td>${_escapeHtml(item.model || '-')}</td>
                <td style="font-weight:600;">${item.quantity}</td>
                <td>${_escapeHtml(item.unit)}</td>
                <td>${stdText}</td>
                <td>${overBadge}</td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="detail-info-grid">
      <div class="detail-info-item">
        <span class="detail-info-label">领用单号</span>
        <span class="detail-info-value">${req.code}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">状态</span>
        <span class="detail-info-value"><span class="status-badge ${statusClass}">${statusText}</span></span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">申请日期</span>
        <span class="detail-info-value">${req.apply_date || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期日期</span>
        <span class="detail-info-value">${req.tour_date || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">申请人</span>
        <span class="detail-info-value">${_escapeHtml(req.applicant)}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期名称</span>
        <span class="detail-info-value">${_escapeHtml(req.tour_name || '-')}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">使用场景</span>
        <span class="detail-info-value">${_normalizeScenario(req.scenario)}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">物品总数</span>
        <span class="detail-info-value">${req.items.length} 种 / ${req.total_quantity} 件</span>
      </div>
      ${req.remark ? `
      <div class="detail-info-item">
        <span class="detail-info-label">备注</span>
        <span class="detail-info-value">${_escapeHtml(req.remark)}</span>
      </div>` : ''}
    </div>
    ${itemsHtml}
  `;

  // 确保标题正确
  const titleEl = document.querySelector('#modal-requisition-detail .modal-header h2');
  if (titleEl) titleEl.textContent = '领用单详情';

  openModal('modal-requisition-detail');
}

/**
 * 确认出库 - 打开确认模态框（第一步：填写实际出库数量）
 */
function confirmStockOut(reqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === reqId);
  if (!req) return;

  if (!hasPermission('confirm_stockout')) {
    showToast('只有仓库管理员可以确认出库', 'warning');
    return;
  }

  _currentStockOutReqId = reqId;

  // 填充基本信息
  const infoDiv = document.getElementById('stockout-confirm-info');
  if (infoDiv) {
    infoDiv.innerHTML = `
      <div class="detail-info-item">
        <span class="detail-info-label">领用单号</span>
        <span class="detail-info-value">${req.code}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期日期</span>
        <span class="detail-info-value">${req.tour_date || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期名称</span>
        <span class="detail-info-value">${_escapeHtml(req.tour_name || '-')}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">使用场景</span>
        <span class="detail-info-value">${_normalizeScenario(req.scenario)}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">申请人</span>
        <span class="detail-info-value">${_escapeHtml(req.applicant)}</span>
      </div>
    `;
  }

  // 填充物品表格（实际出库数量默认等于申请数量）
  const tbody = document.getElementById('stockout-confirm-tbody');
  if (tbody) {
    tbody.innerHTML = req.items.map((item, i) => `
      <tr data-item-id="${item.item_id}">
        <td style="font-weight:600;">${_escapeHtml(item.name)}</td>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${_escapeHtml(item.code)}</td>
        <td>${item.quantity} ${item.unit}</td>
        <td>
          <input type="number" class="req-qty-input stockout-actual-qty" data-item-id="${item.item_id}"
            data-requested="${item.quantity}" value="${item.quantity}" min="0" max="${item.quantity}"
            style="width:70px;">
        </td>
        <td>${_escapeHtml(item.unit)}</td>
        <td class="stockout-diff-cell" data-item-id="${item.item_id}">
          <span style="color:var(--text-muted);">-</span>
        </td>
      </tr>
    `).join('');
  }

  // 隐藏差异汇总，重置按钮状态
  const diffSummary = document.getElementById('stockout-diff-summary');
  if (diffSummary) diffSummary.style.display = 'none';
  const previewBtn = document.getElementById('stockout-preview-diff-btn');
  if (previewBtn) previewBtn.style.display = '';
  const confirmBtn = document.getElementById('stockout-final-confirm-btn');
  if (confirmBtn) confirmBtn.style.display = 'none';

  // 重置标题
  const titleEl = document.querySelector('#modal-requisition-detail .modal-header h2');
  // 这里用另一个模态框
  openModal('modal-confirm-stockout');
}

/**
 * 预览出库差异
 */
function _previewStockOutDiff() {
  const inputs = document.querySelectorAll('.stockout-actual-qty');
  let hasDiff = false;
  let diffHtml = '<div class="detail-section-title">差异汇总</div>';
  diffHtml += '<div class="table-scroll"><table class="data-table"><thead><tr><th>物品名称</th><th>申请数量</th><th>实际出库</th><th>差异</th></tr></thead><tbody>';

  let allValid = true;

  inputs.forEach(input => {
    const requested = parseInt(input.dataset.requested) || 0;
    const actual = parseInt(input.value) || 0;
    const diff = actual - requested;
    const itemId = input.dataset.itemId;

    if (actual < 0) {
      allValid = false;
      return;
    }
    if (actual > requested) {
      allValid = false;
      input.style.borderColor = 'var(--danger)';
      return;
    }

    // 更新每行的差异列
    const diffCell = document.querySelector(`.stockout-diff-cell[data-item-id="${itemId}"]`);
    if (diffCell) {
      if (diff === 0) {
        diffCell.innerHTML = '<span style="color:var(--text-muted);">无差异</span>';
      } else {
        diffCell.innerHTML = `<span style="color:var(--warning);font-weight:600;">${diff > 0 ? '+' : ''}${diff}</span>`;
        hasDiff = true;
      }
    }

    const row = input.closest('tr');
    const itemName = row ? row.querySelector('td:first-child').textContent : '';

    if (diff !== 0) {
      hasDiff = true;
      diffHtml += `<tr>
        <td>${_escapeHtml(itemName)}</td>
        <td>${requested}</td>
        <td>${actual}</td>
        <td style="color:${diff < 0 ? 'var(--warning)' : 'var(--success)'};font-weight:600;">${diff > 0 ? '+' : ''}${diff}</td>
      </tr>`;
    }
  });

  diffHtml += '</tbody></table></div>';

  if (!allValid) {
    showToast('实际出库数量不能大于申请数量，请修正！', 'warning');
    return;
  }

  if (!hasDiff) {
    diffHtml += '<p style="text-align:center;color:var(--success);margin-top:10px;">实际出库与申请数量完全一致</p>';
  } else {
    diffHtml += '<p style="color:var(--warning);margin-top:10px;font-size:13px;">请确认以上差异，点击"确认出库"将按实际出库数量扣减库存。</p>';
  }

  const diffSummary = document.getElementById('stockout-diff-summary');
  if (diffSummary) {
    diffSummary.innerHTML = diffHtml;
    diffSummary.style.display = 'block';
  }

  // 切换按钮
  const previewBtn = document.getElementById('stockout-preview-diff-btn');
  if (previewBtn) previewBtn.style.display = 'none';
  const confirmBtn = document.getElementById('stockout-final-confirm-btn');
  if (confirmBtn) confirmBtn.style.display = '';
}

/**
 * 最终确认出库
 */
function _finalConfirmStockOut() {
  if (!_currentStockOutReqId) return;

  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === _currentStockOutReqId);
  if (!req) return;

  // 收集实际出库数量
  const inputs = document.querySelectorAll('.stockout-actual-qty');
  const actualQuantities = {};
  let valid = true;

  inputs.forEach(input => {
    const itemId = input.dataset.itemId;
    const requested = parseInt(input.dataset.requested) || 0;
    const actual = parseInt(input.value) || 0;

    if (actual < 0 || actual > requested) {
      valid = false;
    }
    actualQuantities[itemId] = actual;
  });

  if (!valid) {
    showToast('实际出库数量不能为负数或大于申请数量，请修正！', 'warning');
    return;
  }

  const stockOutDate = new Date().toISOString().split('T')[0];

  // 扣减库存（按实际出库数量）
  let inventory = [];
  const invData = localStorage.getItem('inventory');
  if (invData) inventory = JSON.parse(invData);

  const actualItems = [];
  let actualTotalQty = 0;

  req.items.forEach(reqItem => {
    const actualQty = actualQuantities[String(reqItem.item_id)] || reqItem.quantity;
    const invItem = inventory.find(it => String(it.id) === String(reqItem.item_id));
    if (invItem) {
      invItem.stock = Math.max(0, invItem.stock - actualQty);
    }
    if (actualQty > 0) {
      actualItems.push({
        ...reqItem,
        quantity: actualQty,
        requested_quantity: reqItem.quantity
      });
      actualTotalQty += actualQty;
    }
  });

  localStorage.setItem('inventory', JSON.stringify(inventory));

  // 创建出库记录
  const stockOutRecord = {
    id: Date.now(),
    code: 'SO' + Date.now().toString().slice(-8),
    requisition_id: req.id,
    requisition_code: req.code,
    tour_date: req.tour_date || '',
    tour_name: req.tour_name || '',
    scenario: req.scenario,
    stockout_date: stockOutDate,
    items: actualItems,
    total_quantity: actualTotalQty,
    status: 'completed',
    confirmed_by: currentUser ? currentUser.name : '',
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  let soList = [];
  const soData = localStorage.getItem('stockOutRecords');
  if (soData) soList = JSON.parse(soData);
  soList.push(stockOutRecord);
  localStorage.setItem('stockOutRecords', JSON.stringify(soList));

  // 更新领用单状态
  req.status = 'outbound_completed';
  localStorage.setItem('requisitions', JSON.stringify(reqList));

  // 关闭模态框
  closeModal();

  // 刷新列表和KPI
  loadRequisitions();
  loadStockOutRecords();
  updateKPICards();
  loadDashboard();

  // 显示出库结果 — 渲染模态框
  const resultBody = document.getElementById('stockout-result-body');
  if (resultBody) {
    const diffItems = actualItems.filter(it => it.quantity !== it.requested_quantity);
    const hasNoDiff = diffItems.length === 0;

    let diffHtml = '';
    if (hasNoDiff) {
      diffHtml = '<div style="text-align:center;padding:12px 0;color:var(--success);font-size:14px;font-weight:600;">实际出库与申请数量完全一致</div>';
    } else {
      diffHtml = `
        <div class="detail-section-title" style="margin-top:16px;">差异明细</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>物品名称</th><th>申请数量</th><th>实际出库</th><th>差异</th></tr></thead>
            <tbody>
              ${diffItems.map(it => {
                const diff = it.quantity - it.requested_quantity;
                return `<tr>
                  <td style="font-weight:600;">${_escapeHtml(it.name)}</td>
                  <td>${it.requested_quantity}</td>
                  <td>${it.quantity}</td>
                  <td style="color:${diff < 0 ? 'var(--warning)' : 'var(--success)'};font-weight:600;">${diff > 0 ? '+' : ''}${diff}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p style="color:var(--warning);margin-top:8px;font-size:12px;">库存已按实际出库数量扣减</p>
      `;
    }

    resultBody.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:48px;line-height:1;">&#10004;</div>
        <div style="font-size:18px;font-weight:700;color:var(--success);margin-top:8px;">出库成功</div>
        <div style="color:var(--text-muted);margin-top:4px;">出库单号：<span style="font-family:monospace;font-weight:600;color:var(--text-primary);">${stockOutRecord.code}</span></div>
      </div>
      <div class="detail-info-grid" style="grid-template-columns:1fr 1fr;">
        <div class="detail-info-item">
          <span class="detail-info-label">关联领用单</span>
          <span class="detail-info-value">${req.code}</span>
        </div>
        <div class="detail-info-item">
          <span class="detail-info-label">出库日期</span>
          <span class="detail-info-value">${stockOutDate}</span>
        </div>
        <div class="detail-info-item">
          <span class="detail-info-label">实际出库</span>
          <span class="detail-info-value">${actualItems.length} 种 / ${actualTotalQty} 件</span>
        </div>
        <div class="detail-info-item">
          <span class="detail-info-label">确认人</span>
          <span class="detail-info-value">${_escapeHtml(stockOutRecord.confirmed_by)}</span>
        </div>
      </div>
      ${diffHtml}
    `;

    openModal('modal-stockout-result');
  }

  _currentStockOutReqId = null;
  if (typeof refreshAllBusinessKPI === 'function') refreshAllBusinessKPI();
  console.log('出库完成:', stockOutRecord);
}

/**
 * 编辑领用单
 */
function editRequisition(reqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === reqId);
  if (!req) return;

  // 权限检查：只有申请人本人或管理员可以修改
  const role = currentUser ? currentUser.role : '';
  const currentUserName = currentUser ? currentUser.name : '';
  if (req.applicant !== currentUserName && role !== 'admin') {
    showToast('只有申请人或管理员可以修改领用单', 'warning');
    return;
  }

  if (req.status !== 'pending_outbound') {
    showToast('只能修改待出库状态的领用单', 'warning');
    return;
  }

  // 填充表单
  document.getElementById('edit-req-id').value = req.id;
  const form = document.getElementById('edit-requisition-form');
  if (form) {
    form.querySelector('[name="edit_apply_date"]').value = req.apply_date || '';
    form.querySelector('[name="edit_tour_date"]').value = req.tour_date || '';
    form.querySelector('[name="edit_tour_name"]').value = req.tour_name || '';
    form.querySelector('[name="edit_applicant"]').value = req.applicant || '';
    form.querySelector('[name="edit_scenario"]').value = req.scenario || '';
    form.querySelector('[name="edit_remark"]').value = req.remark || '';
  }

  // 加载库存数据
  let inventory = [];
  const invData = localStorage.getItem('inventory');
  if (invData) inventory = JSON.parse(invData);
  if (inventory.length === 0) {
    inventory = [
      { id: 1, code: 'ITEM001', name: '矿泉水', category: '饮品', stock: 500, unit: '瓶' },
      { id: 2, code: 'ITEM002', name: '方便面', category: '食品', stock: 200, unit: '箱' },
      { id: 3, code: 'ITEM003', name: '纸巾', category: '日用品', stock: 80, unit: '包' }
    ];
  }
  _reqInventoryCache = inventory;

  // 填充分类下拉
  _populateCategoryFilter('edit-req-filter-category', inventory);

  // 清空搜索
  const searchInput = document.getElementById('edit-req-search-input');
  if (searchInput) searchInput.value = '';

  // 预填已选物品
  const pendingMap = _getPendingQuantities(req.id);
  _editReqSelectedItems = (req.items || []).map(item => ({
    item_id: String(item.item_id),
    name: item.name,
    code: item.code,
    category: item.category || '未分类',
    unit: item.unit,
    stock: (() => {
      const inv = inventory.find(it => String(it.id) === String(item.item_id));
      return inv ? inv.stock : 0;
    })(),
    brand: item.brand || '',
    model: item.model || '',
    pendingQty: pendingMap[String(item.item_id)] || 0,
    quantity: item.quantity
  }));

  _renderEditAvailableItems();
  _renderEditSelectedItems();

  openModal('modal-edit-requisition');
}

/**
 * 保存编辑的领用单
 */
function saveRequisitionEdit() {
  const form = document.getElementById('edit-requisition-form');
  if (!form) return;

  const reqId = parseInt(document.getElementById('edit-req-id').value);
  const applyDate = form.querySelector('[name="edit_apply_date"]').value;
  const tourDate = form.querySelector('[name="edit_tour_date"]').value;
  const tourName = form.querySelector('[name="edit_tour_name"]').value.trim();
  const scenario = form.querySelector('[name="edit_scenario"]').value;
  const applicant = form.querySelector('[name="edit_applicant"]').value;
  const remark = form.querySelector('[name="edit_remark"]').value;

  if (!applyDate || !tourDate || !tourName || !scenario || !applicant) {
    showToast('请填写申请日期、团期日期、团期名称、使用场景和申请人', 'warning');
    return;
  }

  if (_editReqSelectedItems.length === 0) {
    showToast('请至少添加一个物品', 'warning');
    return;
  }

  // 校验库存
  const pendingMap = _getPendingQuantities(reqId);
  let hasError = false;
  const items = _editReqSelectedItems.map(s => {
    const currentPending = pendingMap[String(s.item_id)] || 0;
    const available = s.stock - currentPending;

    if (s.quantity <= 0) {
      hasError = true;
      showToast(`"${s.name}" 的领用数量必须大于0`, 'warning');
      return null;
    }
    if (s.quantity > available) {
      hasError = true;
      showToast(`"${s.name}" 领用数量(${s.quantity}) + 其他领用单已占用(${currentPending}) = ${s.quantity + currentPending}，超过当前库存(${s.stock})，请减少数量`, 'warning');
      return null;
    }
    return {
      item_id: s.item_id,
      name: s.name,
      code: s.code,
      category: s.category,
      unit: s.unit,
      quantity: s.quantity,
      brand: s.brand,
      model: s.model
    };
  });

  if (hasError) return;

  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  // 更新领用单
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const reqIndex = reqList.findIndex(r => r.id === reqId);
  if (reqIndex === -1) {
    showToast('领用单不存在', 'error');
    return;
  }

  reqList[reqIndex] = {
    ...reqList[reqIndex],
    tour_date: tourDate,
    tour_name: tourName,
    scenario: scenario,
    applicant: applicant,
    apply_date: applyDate,
    items: items,
    total_quantity: totalQty,
    remark: remark
  };

  localStorage.setItem('requisitions', JSON.stringify(reqList));

  closeModal();
  loadRequisitions();
  loadStockOutRecords();
  updateKPICards();

  showToast(`领用单 ${reqList[reqIndex].code} 已更新`, 'success');
}

/**
 * 撤回领用单（改为已取消状态，可重新编辑）
 */
function withdrawRequisition(reqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === reqId);
  if (!req) return;

  // 权限检查
  const role = currentUser ? currentUser.role : '';
  const currentUserName = currentUser ? currentUser.name : '';
  if (req.applicant !== currentUserName && role !== 'admin') {
    showToast('只有申请人或管理员可以撤回领用单', 'warning');
    return;
  }

  if (req.status !== 'pending_outbound') {
    showToast('只能撤回待出库状态的领用单', 'warning');
    return;
  }

  showConfirm(`确定要撤回领用单 ${req.code} 吗？撤回后状态将变为"已撤回"，您可以重新编辑后再次提交。`, function() {
    req.status = 'cancelled';
    localStorage.setItem('requisitions', JSON.stringify(reqList));

    loadRequisitions();
    loadStockOutRecords();
    updateKPICards();

    showToast(`领用单 ${req.code} 已撤回`, 'success');
  });
}

/**
 * 删除领用单
 */
function deleteRequisition(reqId) {
  let reqList = [];
  const data = localStorage.getItem('requisitions');
  if (data) reqList = JSON.parse(data);
  const req = reqList.find(r => r.id === reqId);
  if (!req) return;

  // 权限检查
  const role = currentUser ? currentUser.role : '';
  const currentUserName = currentUser ? currentUser.name : '';
  if (req.applicant !== currentUserName && role !== 'admin') {
    showToast('只有申请人或管理员可以删除领用单', 'warning');
    return;
  }

  if (req.status !== 'pending_outbound') {
    showToast('只能删除待出库状态的领用单', 'warning');
    return;
  }

  showConfirm(`确定要永久删除领用单 ${req.code} 吗？此操作不可恢复！`, function() {
    reqList = reqList.filter(r => r.id !== reqId);
    localStorage.setItem('requisitions', JSON.stringify(reqList));

    loadRequisitions();
    loadStockOutRecords();
    updateKPICards();

    showToast(`领用单 ${req.code} 已删除`, 'success');
  });
}

/**
 * 加载出库记录列表 - 合并待出库领用单 + 已完成出库记录
 */
function loadStockOutRecords() {
  const tbody = document.getElementById('stockout-tbody');
  if (!tbody) return;

  // 1. 读取待出库的领用单
  let reqList = [];
  const reqData = localStorage.getItem('requisitions');
  if (reqData) reqList = JSON.parse(reqData);

  const pendingReqs = reqList.filter(r => r.status === 'pending_outbound');

  // 2. 读取已完成出库记录
  let completedRecords = [];
  const soData = localStorage.getItem('stockOutRecords');
  if (soData) completedRecords = JSON.parse(soData);

  // 3. 合并为统一列表
  const canConfirm = hasPermission('confirm_stockout');

  const merged = [];

  pendingReqs.forEach(req => {
    merged.push({
      type: 'pending',
      code: '-',
      requisition_code: req.code,
      requisition_id: req.id,
      tour_date: req.tour_date || '',
      tour_name: req.tour_name || '',
      scenario: req.scenario,
      applicant: req.applicant,
      date: req.apply_date,
      items: req.items,
      total_quantity: req.total_quantity,
      status: 'pending',
      canConfirm: canConfirm
    });
  });

  completedRecords.forEach(r => {
    merged.push({
      type: 'completed',
      code: r.code,
      requisition_code: r.requisition_code,
      requisition_id: r.requisition_id,
      tour_date: r.tour_date || '',
      tour_name: r.tour_name || '',
      scenario: r.scenario,
      applicant: '',
      date: r.stockout_date,
      items: r.items,
      total_quantity: r.total_quantity,
      status: 'completed',
      canConfirm: false
    });
  });

  // 4. 按状态筛选
  const filterStatus = document.getElementById('filter-stockout-status')?.value || '';
  let filtered = merged;
  if (filterStatus) {
    filtered = merged.filter(r => r.status === filterStatus);
  }

  // 待出库排前面，然后按日期倒序
  filtered.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'pending' ? -1 : 1;
    return new Date(b.date) - new Date(a.date);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无出库记录</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    if (r.type === 'pending') {
      return `
        <tr>
          <td><span style="color:var(--text-muted);font-size:12px;">待生成</span></td>
          <td style="font-weight:600;">${r.requisition_code}</td>
          <td>${r.tour_date || '-'}</td>
          <td>${_escapeHtml(r.tour_name || '-')}</td>
          <td>${_normalizeScenario(r.scenario)}</td>
          <td>${r.date}</td>
          <td>${r.items.length} 种 / ${r.total_quantity} 件</td>
          <td><span class="status-badge warning">待确认</span></td>
          <td>
            <button class="btn btn-sm" onclick="viewRequisitionDetail(${r.requisition_id})">查看</button>
            ${r.canConfirm ? `<button class="btn btn-sm" onclick="confirmStockOut(${r.requisition_id})" style="background:var(--success);border-color:var(--success);color:#fff;">确认出库</button>` : ''}
          </td>
        </tr>
      `;
    } else {
      return `
        <tr>
          <td>${r.code}</td>
          <td>${r.requisition_code}</td>
          <td>${r.tour_date || '-'}</td>
          <td>${_escapeHtml(r.tour_name || '-')}</td>
          <td>${_normalizeScenario(r.scenario)}</td>
          <td>${r.date}</td>
          <td>${r.items.length} 种 / ${r.total_quantity} 件</td>
          <td><span class="status-badge success">已出库</span></td>
          <td>
            <button class="btn btn-sm" onclick="viewStockOutDetail('${r.code}')">查看详情</button>
          </td>
        </tr>
      `;
    }
  }).join('');
}

/**
 * 查看出库详情
 */
function viewStockOutDetail(recordCode) {
  let records = [];
  const data = localStorage.getItem('stockOutRecords');
  if (data) records = JSON.parse(data);
  const record = records.find(r => r.code === recordCode);
  if (!record) { showToast('未找到该出库记录', 'error'); return; }

  const body = document.getElementById('requisition-detail-body');
  if (!body) return;

  let itemsHtml = '';
  if (record.items && record.items.length > 0) {
    itemsHtml = `
      <div class="detail-section-title">出库明细</div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>物品编号</th>
              <th>物品名称</th>
              <th>分类</th>
              <th>申请数量</th>
              <th>实际出库</th>
              <th>差异</th>
              <th>单位</th>
            </tr>
          </thead>
          <tbody>
            ${record.items.map((item, i) => {
              const requested = item.requested_quantity || item.quantity;
              const actual = item.quantity;
              const diff = actual - requested;
              const diffText = diff === 0 ? '<span style="color:var(--text-muted)">无差异</span>' :
                `<span style="color:${diff < 0 ? 'var(--warning)' : 'var(--success)'};font-weight:600;">${diff > 0 ? '+' : ''}${diff}</span>`;
              return `
              <tr>
                <td>${i + 1}</td>
                <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${_escapeHtml(item.code)}</td>
                <td style="font-weight:600;">${_escapeHtml(item.name)}</td>
                <td>${_escapeHtml(item.category || '-')}</td>
                <td>${requested}</td>
                <td style="font-weight:600;">${actual}</td>
                <td>${diffText}</td>
                <td>${_escapeHtml(item.unit)}</td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="detail-info-grid">
      <div class="detail-info-item">
        <span class="detail-info-label">出库单号</span>
        <span class="detail-info-value">${record.code}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">关联领用单</span>
        <span class="detail-info-value">${record.requisition_code}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">出库日期</span>
        <span class="detail-info-value">${record.stockout_date}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">确认人</span>
        <span class="detail-info-value">${_escapeHtml(record.confirmed_by)}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期日期</span>
        <span class="detail-info-value">${record.tour_date || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">团期名称</span>
        <span class="detail-info-value">${_escapeHtml(record.tour_name || '-')}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">使用场景</span>
        <span class="detail-info-value">${_normalizeScenario(record.scenario)}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">物品总数</span>
        <span class="detail-info-value">${record.items.length} 种 / ${record.total_quantity} 件</span>
      </div>
    </div>
    ${itemsHtml}
  `;

  const titleEl = document.querySelector('#modal-requisition-detail .modal-header h2');
  if (titleEl) titleEl.textContent = '出库单详情';

  openModal('modal-requisition-detail');
}

/**
 * 领用单状态文字
 */
function getReqStatusText(status) {
  const map = {
    'pending_outbound': '待出库',
    'outbound_completed': '已出库',
    'cancelled': '已撤回'
  };
  return map[status] || status;
}

/**
 * 领用单状态样式
 */
function getReqStatusClass(status) {
  const map = {
    'pending_outbound': 'warning',
    'outbound_completed': 'success',
    'cancelled': 'danger'
  };
  return map[status] || '';
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initRequisitionModule, loadRequisitions, loadStockOutRecords };
}
