/**
 * 采购单管理模块 - 处理采购单的创建、导入和流程管理
 */

// 采购单数据存储
let purchaseOrders = [];
let currentImportStep = 1;
let importData = [];

// 类别和品牌型号历史数据
let categories = [];  // [{code: 'XH', name: '循环使用类', scenario: '通用', remark: ''}]
let brandHistory = {};  // {物品名称: [品牌列表]}
let modelHistory = {};  // {物品名称: [型号列表]}
let categoryCodeCounters = {};  // {类别编码: 计数器} 用于每个类别独立计数
let consumptionStandards = [];  // [{item_name, scenario, max_per_tour}] 领用标准

/**
 * 初始化采购单模块
 */
function initPurchaseModule() {
  console.log('=== initPurchaseModule 被调用 ===');
  
  // 根据角色控制按钮可见性
  const canCreatePurchase = hasPermission('create_purchase');
  
  const createBtn = document.getElementById('create-purchase-btn');
  if (createBtn) {
    createBtn.style.display = canCreatePurchase ? 'inline-flex' : 'none';
    createBtn.addEventListener('click', () => openNewPurchaseModal());
  }

  const importBtn = document.getElementById('import-purchase-btn');
  if (importBtn) {
    importBtn.style.display = canCreatePurchase ? 'inline-flex' : 'none';
    importBtn.addEventListener('click', () => openImportModal());
  }

  // 绑定提交采购单按钮
  const submitBtn = document.getElementById('submit-purchase-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitPurchaseOrder);
  }

  // 绑定导入相关按钮
  bindImportEvents();

  // 绑定新增类别按钮
  bindCategoryEvents();

  // 加载数据
  loadCategoriesFromStorage();
  loadCategoryCounters();
  
  console.log('初始化采购单模块，类别数量:', categories.length);
  
  // 加载采购单列表
  loadPurchaseOrders();
}

/**
 * 打开新建采购单模态框
 */
let _editingPurchaseOrderId = null; // 编辑中的采购单ID（取消时不丢失数据）

function openNewPurchaseModal() {
  _editingPurchaseOrderId = null; // 新建模式重置
  const modal = document.getElementById('modal-purchase');
  if (!modal) return;

  // 清空表单
  const form = modal.querySelector('#purchase-form');
  if (form) {
    form.reset();
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    form.querySelector('[name="purchase_date"]').value = today;
    // 默认采购人为当前登录用户
    if (currentUser && currentUser.name) {
      const purchaserInput = form.querySelector('[name="purchaser"]');
      if (purchaserInput) purchaserInput.value = currentUser.name;
    }
  }

  // 清空供应商分组容器
  const container = document.getElementById('supplier-groups-container');
  if (container) {
    container.innerHTML = '';
  }

  // 添加第一个供应商分组
  addSupplierGroup();

  // 更新合计金额
  updatePurchaseTotal();

  // 打开模态框
  openModal('modal-purchase');
}

/**
 * 添加供应商分组
 */
function addSupplierGroup() {
  const container = document.getElementById('supplier-groups-container');
  if (!container) return;

  const groupId = `supplier-${Date.now()}`;
  
  const groupDiv = document.createElement('div');
  groupDiv.className = 'supplier-group';
  groupDiv.id = groupId;
  groupDiv.style.cssText = `
    background: var(--bg-elevated);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--border);
    transition: all 0.2s ease;
  `;
  
  groupDiv.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="flex:1;">
        <label style="font-size:11px;color:var(--text-muted);margin-bottom:4px;display:block;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">供应商名称 *</label>
        <input type="text" class="supplier-name-input" placeholder="请输入供应商名称" required 
          style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;">
      </div>
      <button type="button" onclick="removeSupplierGroup('${groupId}')" title="删除此供应商及所有商品" 
        style="margin-left:12px;padding:6px 12px;color:var(--danger);background:var(--danger-bg);border:1px solid rgba(239,68,68,0.2);border-radius:6px;cursor:pointer;font-size:13px;transition:all 0.2s;">
         删除
      </button>
    </div>
    <div class="table-scroll">
      <table class="data-table" style="width:100%;">
        <thead>
          <tr>
            <th style="width:16%">类别 *</th>
            <th style="width:22%">物品名称 *</th>
            <th style="width:14%">品牌</th>
            <th style="width:12%">型号</th>
            <th style="width:10%">数量 *</th>
            <th style="width:8%">单位</th>
            <th style="width:10%">单价(元)</th>
            <th style="width:10%">金额(元)</th>
            <th style="width:8%">操作</th>
          </tr>
        </thead>
        <tbody class="items-tbody" data-group-id="${groupId}">
          <tr>
            <td colspan="9" style="text-align:center;padding:20px;">
              <button type="button" class="btn btn-accent" onclick="addItemToGroup('${groupId}')" 
                style="padding:8px 20px;font-size:13px;font-weight:600;">+ 添加物品</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background:var(--accent-glow);font-weight:600;">
            <td colspan="7" style="text-align:right;color:var(--text-secondary);">小计：</td>
            <td class="group-subtotal" style="color:var(--accent-light);font-weight:700;">0.00</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  
  container.appendChild(groupDiv);
}

/**
 * 删除供应商分组
 */
function removeSupplierGroup(groupId) {
  const group = document.getElementById(groupId);
  if (group) {
    group.remove();
    updatePurchaseTotal();
  }
}

/**
 * 从localStorage加载类别计数器
 */
function loadCategoryCounters() {
  // 遍历所有已知的类别，加载它们的计数器
  categories.forEach(cat => {
    const counterKey = `categoryCounter_${cat.code}`;
    categoryCodeCounters[cat.code] = parseInt(localStorage.getItem(counterKey) || '1');
  });
}

/**
 * 向指定供应商分组添加物品行
 */
function addItemToGroup(groupId) {
  const tbody = document.querySelector(`.items-tbody[data-group-id="${groupId}"]`);
  if (!tbody) return;

  // 如果是空提示行，先清除
  if (tbody.querySelector('td[colspan]')) {
    tbody.innerHTML = '';
  }

  const row = document.createElement('tr');
  
  // 先生成一个临时ID用于datalist
  const tempId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  row.innerHTML = `
    <td>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <span class="item-code-display" style="font-size:10px;color:var(--text-muted);font-family:monospace;">待选择类别</span>
        <div style="display:flex;gap:4px;">
          <input type="text" class="item-category" placeholder="选择或输入类别" list="category-list-${tempId}" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;">
          <datalist id="category-list-${tempId}">
            ${getCategoryOptionsForDatalist()}
          </datalist>
          <button type="button" class="btn btn-sm" onclick="openCategoryModal(event)" title="新增类别" style="padding:6px 10px;font-weight:bold;color:var(--accent);">+</button>
        </div>
      </div>
    </td>
    <td><input type="text" class="item-name" placeholder="物品名称" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;"></td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-brand" placeholder="品牌" list="brand-list-${tempId}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;">
        <datalist id="brand-list-${tempId}"></datalist>
      </div>
    </td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-model" placeholder="型号" list="model-list-${tempId}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;">
        <datalist id="model-list-${tempId}"></datalist>
      </div>
    </td>
    <td><input type="number" class="item-quantity" placeholder="数量" min="1" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;" onchange="calculateRowAmount(this)"></td>
    <td><input type="text" class="item-unit" placeholder="单位" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;"></td>
    <td><input type="number" class="item-price" placeholder="单价" min="0" step="0.01" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:13px;" onchange="calculateRowAmount(this)"></td>
    <td><span class="row-amount" style="font-weight:600;color:var(--accent-light);font-size:13px;">0.00</span></td>
    <td>
      <div style="display:flex;gap:4px;justify-content:center;">
        <button type="button" class="btn btn-sm" onclick="removePurchaseItemRow(this)" title="删除此行" style="color:var(--danger);padding:6px 10px;font-size:14px;">✕</button>
        <button type="button" class="btn btn-sm" onclick="addItemToGroup('${groupId}')" title="在此行后添加新物品" style="color:var(--success);padding:6px 10px;font-size:14px;">+</button>
      </div>
    </td>
  `;

  tbody.appendChild(row);
  
  // 绑定物品名称变化事件，更新品牌型号历史记录
  const nameInput = row.querySelector('.item-name');
  if (nameInput) {
    nameInput.addEventListener('blur', function() {
      updateBrandModelDatalist(this.value, tempId);
    });
  }
  
  // 绑定品牌和型号输入事件，自动保存历史
  const brandInput = row.querySelector('.item-brand');
  const modelInput = row.querySelector('.item-model');
  
  if (brandInput) {
    brandInput.addEventListener('blur', function() {
      const itemName = row.querySelector('.item-name').value;
      if (itemName && this.value) {
        addBrandToHistory(itemName, this.value);
        updateBrandModelDatalist(itemName, tempId);
      }
    });
  }
  
  if (modelInput) {
    modelInput.addEventListener('blur', function() {
      const itemName = row.querySelector('.item-name').value;
      if (itemName && this.value) {
        addModelToHistory(itemName, this.value);
        updateBrandModelDatalist(itemName, tempId);
      }
    });
  }
  
  // 绑定类别输入事件，如果输入新类别则自动创建，并更新商品编码
  const categoryInput = row.querySelector('.item-category');
  const codeDisplay = row.querySelector('.item-code-display');
  
  if (categoryInput) {
    categoryInput.addEventListener('blur', function() {
      const categoryName = this.value.trim();
      if (categoryName) {
        // 查找或创建类别
        let category = categories.find(c => c.name === categoryName);
        if (!category) {
          category = autoCreateCategory(categoryName);
          refreshAllCategoryDropdowns();
        }
        
        // 生成该类别下的商品编码
        const itemCode = generateItemCodeByCategory(category.code);
        codeDisplay.textContent = itemCode;
        codeDisplay.setAttribute('data-item-code', itemCode);
      }
    });
  }
}

/**
 * 添加采购明细行
 */
function addPurchaseItemRow() {
  const tbody = document.getElementById('purchase-items-tbody');
  if (!tbody) return;

  // 如果是空提示行，先清除
  if (tbody.querySelector('td[colspan]')) {
    tbody.innerHTML = '';
  }

  const row = document.createElement('tr');
  const itemCode = generateItemCode();
  
  row.innerHTML = `
    <td>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <span class="item-code-display" style="font-size:10px;color:var(--text-muted);font-family:monospace;">${itemCode}</span>
        <div style="display:flex;gap:4px;">
          <input type="text" class="item-category" placeholder="选择或输入类别" list="category-list-${itemCode}" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
          <datalist id="category-list-${itemCode}">
            ${getCategoryOptionsForDatalist()}
          </datalist>
          <button type="button" class="btn btn-sm" onclick="openCategoryModal(event)" title="新增类别" style="padding:6px 10px;font-weight:bold;color:var(--accent);">+</button>
        </div>
      </div>
    </td>
    <td><input type="text" class="item-name" placeholder="物品名称" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);"></td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-brand" placeholder="品牌" list="brand-list-${itemCode}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
        <datalist id="brand-list-${itemCode}"></datalist>
      </div>
    </td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-model" placeholder="型号" list="model-list-${itemCode}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
        <datalist id="model-list-${itemCode}"></datalist>
      </div>
    </td>
    <td><input type="number" class="item-quantity" placeholder="数量" min="1" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);" onchange="calculateRowAmount(this)"></td>
    <td><input type="text" class="item-unit" placeholder="单位" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);"></td>
    <td><input type="number" class="item-price" placeholder="单价" min="0" step="0.01" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);" onchange="calculateRowAmount(this)"></td>
    <td><span class="row-amount" style="font-weight:600;color:var(--accent);font-size:14px;">0.00</span></td>
    <td>
      <div style="display:flex;gap:4px;justify-content:center;">
        <button type="button" class="btn btn-sm" onclick="removePurchaseItemRow(this)" title="删除此行" style="color:var(--danger);padding:6px 10px;font-size:14px;">✕</button>
        <button type="button" class="btn btn-sm" onclick="addPurchaseItemRow()" title="在此行后添加新物品" style="color:var(--success);padding:6px 10px;font-size:14px;">+</button>
      </div>
    </td>
  `;

  tbody.appendChild(row);
  
  // 绑定物品名称变化事件，更新品牌型号历史记录
  const nameInput = row.querySelector('.item-name');
  if (nameInput) {
    nameInput.addEventListener('blur', function() {
      updateBrandModelDatalist(this.value, itemCode);
    });
  }
  
  // 绑定品牌和型号输入事件，自动保存历史
  const brandInput = row.querySelector('.item-brand');
  const modelInput = row.querySelector('.item-model');
  
  if (brandInput) {
    brandInput.addEventListener('blur', function() {
      const itemName = row.querySelector('.item-name').value;
      if (itemName && this.value) {
        addBrandToHistory(itemName, this.value);
        updateBrandModelDatalist(itemName, itemCode);
      }
    });
  }
  
  if (modelInput) {
    modelInput.addEventListener('blur', function() {
      const itemName = row.querySelector('.item-name').value;
      if (itemName && this.value) {
        addModelToHistory(itemName, this.value);
        updateBrandModelDatalist(itemName, itemCode);
      }
    });
  }
  
  // 绑定类别输入事件，如果输入新类别则自动创建
  const categoryInput = row.querySelector('.item-category');
  if (categoryInput) {
    categoryInput.addEventListener('blur', function() {
      const categoryName = this.value.trim();
      if (categoryName && !categories.find(c => c.name === categoryName)) {
        // 自动创建新类别
        autoCreateCategory(categoryName);
        refreshAllCategoryDropdowns();
      }
    });
  }
}

/**
 * 计算行金额
 */
function calculateRowAmount(input) {
  const row = input.closest('tr');
  const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
  const price = parseFloat(row.querySelector('.item-price').value) || 0;
  const amount = quantity * price;
  
  row.querySelector('.row-amount').textContent = amount.toFixed(2);
  
  // 更新所在供应商分组的小计
  updateGroupSubtotal(row);
  // 更新总金额
  updatePurchaseTotal();
}

/**
 * 更新供应商分组小计
 */
function updateGroupSubtotal(row) {
  const tbody = row.closest('tbody');
  if (!tbody) return;
  
  const group = tbody.closest('.supplier-group');
  if (!group) return;
  
  let subtotal = 0;
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(r => {
    const amountText = r.querySelector('.row-amount')?.textContent || '0.00';
    subtotal += parseFloat(amountText) || 0;
  });
  
  const subtotalElement = group.querySelector('.group-subtotal');
  if (subtotalElement) {
    subtotalElement.textContent = subtotal.toFixed(2);
  }
}

/**
 * 更新采购单总金额
 */
function updatePurchaseTotal() {
  let total = 0;
  const allSubtotals = document.querySelectorAll('.group-subtotal');
  allSubtotals.forEach(subtotal => {
    total += parseFloat(subtotal.textContent) || 0;
  });
  
  const totalElement = document.getElementById('purchase-total-amount');
  if (totalElement) {
    totalElement.textContent = total.toFixed(2);
  }
}

/**
 * 删除采购明细行
 */
function removePurchaseItemRow(btn) {
  const row = btn.closest('tr');
  const tbody = row.closest('tbody');
  
  // 删除行
  row.remove();
  
  // 如果该分组没有物品了，显示添加按钮提示
  if (tbody && tbody.querySelectorAll('tr').length === 0) {
    const groupId = tbody.getAttribute('data-group-id');
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:20px;">
          <button type="button" class="btn btn-accent" onclick="addItemToGroup('${groupId}')" 
            style="padding:8px 20px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(64,158,255,0.3);">+ 添加物品</button>
        </td>
      </tr>
    `;
  }
  
  // 更新小计和总计
  updateGroupSubtotal(row);
  updatePurchaseTotal();
}

/**
 * 提交采购单
 */
async function submitPurchaseOrder() {
  const form = document.getElementById('purchase-form');
  if (!form) return;

  // 验证必填字段
  const purchaseDate = form.querySelector('[name="purchase_date"]').value;
  const purchaser = form.querySelector('[name="purchaser"]').value;
  
  if (!purchaseDate || !purchaser) {
    showToast('请填写采购日期和采购人', 'warning');
    return;
  }

  showButtonLoading('submit-purchase-btn', '提交中...');
  try {

  // 获取所有供应商分组
  const supplierGroups = document.querySelectorAll('.supplier-group');
  if (supplierGroups.length === 0) {
    showToast('请至少添加一个供应商', 'warning');
    return;
  }

  // 收集所有数据
  const allItems = [];
  let hasError = false;
  
  supplierGroups.forEach(group => {
    const supplierName = group.querySelector('.supplier-name-input').value.trim();
    if (!supplierName) {
      showToast('请填写所有供应商名称', 'warning');
      hasError = true;
      return;
    }
    
    const tbody = group.querySelector('.items-tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const nameInput = row.querySelector('.item-name');
      if (nameInput && nameInput.value) {
        const category = row.querySelector('.item-category')?.value || '';
        const itemCode = row.querySelector('.item-code-display')?.getAttribute('data-item-code') || '';
        const brand = row.querySelector('.item-brand')?.value || '';
        const model = row.querySelector('.item-model')?.value || '';
        const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        
        if (!category) {
          // 未选择类别时自动归为"未分类"
          // 不做硬性阻断，允许采购时只填名称和数量
        }
        
        // 保存品牌型号历史
        if (brand) addBrandToHistory(nameInput.value, brand);
        if (model) addModelToHistory(nameInput.value, model);
        
        allItems.push({
          supplier: supplierName,
          category: category || '未分类',
          code: itemCode,
          name: nameInput.value,
          brand: brand,
          model: model,
          quantity: quantity,
          unit: row.querySelector('.item-unit')?.value || '',
          price: price,
          amount: quantity * price
        });
      }
    });
  });
  
  if (hasError) return;

  if (allItems.length === 0) {
    showToast('请至少添加一个物品', 'warning');
    return;
  }
  
  // 生成采购单号
  const orderCode = generatePurchaseCode();
  
  // 计算总金额
  const totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);
  
  // 创建采购单对象
  const purchaseOrder = {
    // 不再依赖本地 id，在云端创建后使用返回 id
    code: orderCode,
    purchase_date: purchaseDate,
    purchaser: purchaser,
    suppliers: Array.from(supplierGroups).map(g => g.querySelector('.supplier-name-input').value.trim()),
    items: allItems,
    total_amount: totalAmount,
    status: 'pending_stockin', // 待入库
    created_at: new Date().toISOString(),
    remark: form.querySelector('[name="remark"]').value || ''
  };

  // 先尝试写入云端
  if (typeof SupaDB !== 'undefined' && SupaDB.createPurchaseOrder) {
    try {
      const created = await SupaDB.createPurchaseOrder(purchaseOrder);
      // 更新本地缓存与 UI
      try {
        let local = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
        local.unshift(created);
        localStorage.setItem('purchaseOrders', JSON.stringify(local));
      } catch(e) { console.warn('更新本地 purchaseOrders 缓存失败', e.message); }

      closeModal();
      loadPurchaseOrders();
      if (typeof refreshAllBusinessKPI === 'function') refreshAllBusinessKPI();
      showToast(`采购单 ${created.code} 已创建并同步至云端`, 'success');
      return;
    } catch (e) {
      console.warn('云端保存采购单失败，回退到本地：', e.message);
      // 回退到本地保存
    }
  }

  // 若 SupaDB 不可用或写入失败，回退到本地保存
  purchaseOrder.id = _editingPurchaseOrderId || Date.now();
  if (_editingPurchaseOrderId) {
    const idx = purchaseOrders.findIndex(o => o.id === _editingPurchaseOrderId);
    if (idx >= 0) purchaseOrders[idx] = purchaseOrder; else purchaseOrders.push(purchaseOrder);
    _editingPurchaseOrderId = null;
  } else {
    purchaseOrders.push(purchaseOrder);
  }
  savePurchaseOrders();
  closeModal();
  loadPurchaseOrders();
  if (typeof refreshAllBusinessKPI === 'function') refreshAllBusinessKPI();
  showToast(`采购单 ${purchaseOrder.code} 已保存（本地）`, 'success');
  console.log('采购单创建成功（本地）:', purchaseOrder);
  } finally {
    hideButtonLoading('submit-purchase-btn');
  }
}

/**
 * 生成采购单号
 */
function generatePurchaseCode() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `PO${year}${month}${day}${random}`;
}

/**
 * 保存采购单数据到本地存储
 */
function savePurchaseOrders() {
  localStorage.setItem('purchaseOrders', JSON.stringify(purchaseOrders));
  console.log('采购单已保存，总数:', purchaseOrders.length);
}

/**
 * 从localStorage加载类别数据
 */
function loadCategoriesFromStorage() {
  const data = localStorage.getItem('categories');
  if (data) {
    categories = JSON.parse(data);
  }
  // 如果没有任何类别，初始化默认类别（新体系：循环使用类/消耗类/其他）
  if (categories.length === 0) {
    categories = [
      { code: 'XH', name: '循环使用类', scenario: '通用', remark: '可回收重复使用的物品', created_at: new Date().toISOString() },
      { code: 'HM', name: '消耗类', scenario: '通用', remark: '一次性消耗品', created_at: new Date().toISOString() },
      { code: 'QT', name: '其他', scenario: '通用', remark: '其他类别物品', created_at: new Date().toISOString() }
    ];
    localStorage.setItem('categories', JSON.stringify(categories));
  } else {
    // 迁移：旧体系（饮品/食品/日用品/办公用品）→ 新体系
    const oldNames = ['饮品', '食品', '日用品', '办公用品'];
    const hasOldDefaults = categories.some(c => oldNames.includes(c.name));
    const hasNewDefaults = categories.some(c => ['循环使用类', '消耗类'].includes(c.name));
    if (hasOldDefaults && !hasNewDefaults) {
      // 保留用户自定义类别，追加新默认类别
      const newDefaults = [
        { code: 'XH', name: '循环使用类', scenario: '通用', remark: '可回收重复使用的物品', created_at: new Date().toISOString() },
        { code: 'HM', name: '消耗类', scenario: '通用', remark: '一次性消耗品', created_at: new Date().toISOString() },
        { code: 'QT', name: '其他', scenario: '通用', remark: '其他类别物品', created_at: new Date().toISOString() }
      ];
      newDefaults.forEach(nd => {
        if (!categories.find(c => c.name === nd.name)) {
          categories.push(nd);
        }
      });
      // 给旧类别补充 scenario 字段
      categories.forEach(c => {
        if (!c.scenario) c.scenario = '通用';
      });
      localStorage.setItem('categories', JSON.stringify(categories));
      console.log('品类体系已迁移：追加新默认类别');
    } else if (!hasNewDefaults) {
      // 没有旧默认也没有新默认（纯自定义），补充 scenario 字段
      categories.forEach(c => {
        if (!c.scenario) c.scenario = '通用';
      });
      localStorage.setItem('categories', JSON.stringify(categories));
    }
  }
  // 加载领用标准
  loadConsumptionStandards();
}

/**
 * 渲染品类管理页面的品类卡片
 */
function renderCategoryList() {
  const container = document.getElementById('category-list');
  if (!container) {
    console.warn('[品类管理] #category-list 容器不存在');
    return;
  }
  console.log('[品类管理] renderCategoryList 开始, categories:', categories.length, 'currentUser:', currentUser);

  loadCategoriesFromStorage();
  console.log('[品类管理] loadCategoriesFromStorage 后 categories:', categories.length);

  // 新增品类按钮权限：仅管理员可见
  const addCatBtn = document.getElementById('add-category-btn');
  if (addCatBtn) {
    const role = currentUser ? currentUser.role : '';
    addCatBtn.style.display = (role === 'admin') ? '' : 'none';
  }

  // 只有管理员才能编辑和删除品类
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (categories.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无品类，点击上方按钮新增</div>';
    return;
  }

  // 统计每个品类的库存物品数
  let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  if (inventory.length === 0 && typeof mockData !== 'undefined') inventory = mockData.items;
  const itemCountMap = {};
  inventory.forEach(item => {
    const cat = item.category || '未分类';
    if (!itemCountMap[cat]) itemCountMap[cat] = { count: 0, stock: 0 };
    itemCountMap[cat].count++;
    itemCountMap[cat].stock += (item.stock || 0);
  });

  // 场景标签样式映射
  const scenarioBadgeStyle = {
    '列车餐车': 'background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;',
    '列车客房': 'background:#fce4ec;color:#c62828;padding:2px 8px;border-radius:10px;font-size:11px;',
    '通用': 'background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;',
  };

  container.innerHTML = categories.map((cat, index) => {
    const info = itemCountMap[cat.name] || { count: 0, stock: 0 };
    const scenario = cat.scenario || '通用';
    const badge = scenarioBadgeStyle[scenario] || scenarioBadgeStyle['通用'];
    const adminActions = isAdmin ? `
      <div style="margin-top:10px;display:flex;gap:6px;">
        <button class="btn btn-sm" onclick="event.stopPropagation();editCategory(${index})" style="flex:1;">编辑</button>
        <button class="btn btn-sm" onclick="event.stopPropagation();deleteCategory(${index})" style="flex:1;color:var(--danger);">删除</button>
      </div>` : '';
    return `
    <div class="category-card" onclick="_showCategoryItems('${cat.name}')" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="category-name">${cat.name}</div>
        <span style="${badge}">${scenario}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);font-family:monospace;margin-top:4px;">${cat.code}</div>
      <div class="category-count" style="margin-top:6px;">
        ${info.count} 种物品 · 库存 ${info.stock} 件
      </div>
      ${adminActions}
    </div>`;
  }).join('');

  // 渲染领用标准配置面板
  renderConsumptionStandardsPanel();
}

/**
 * 点击品类卡片 → 展开该分类下的库存物品
 */
function _showCategoryItems(catName) {
  const panel = document.getElementById('category-detail-panel');
  const titleEl = document.getElementById('category-detail-title');
  const bodyEl = document.getElementById('category-detail-body');
  if (!panel || !titleEl || !bodyEl) return;

  // 如果已经打开了同一个品类，则关闭
  if (panel.classList.contains('open') && titleEl._currentCat === catName) {
    panel.classList.remove('open');
    titleEl._currentCat = null;
    return;
  }

  titleEl._currentCat = catName;
  titleEl.textContent = `📁 ${catName} — 分类明细`;

  let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  if (inventory.length === 0 && typeof mockData !== 'undefined') inventory = mockData.items;
  const catItems = inventory.filter(item => (item.category || '未分类') === catName);

  if (catItems.length === 0) {
    bodyEl.innerHTML = '<div class="expand-empty">该分类下暂无物品</div>';
  } else {
    let html = '<table class="expand-table"><thead><tr><th>编号</th><th>名称</th><th>品牌</th><th>型号</th><th>库存</th><th>安全库存</th><th>单位</th><th>状态</th></tr></thead><tbody>';
    catItems.forEach(item => {
      const low = item.stock < (item.safety_stock || 10);
      html += `<tr>
        <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${item.code || '-'}</td>
        <td style="font-weight:600;">${item.name || '-'}</td>
        <td>${item.brand || '-'}</td>
        <td>${item.model || '-'}</td>
        <td style="font-weight:600;color:${low ? 'var(--danger)' : 'var(--success)'};">${item.stock}</td>
        <td>${item.safety_stock || 10}</td>
        <td>${item.unit || '-'}</td>
        <td><span class="status-badge ${low ? 'warning' : 'success'}">${low ? '低库存' : '正常'}</span></td>
      </tr>`;
    });
    html += '</tbody></table>';
    bodyEl.innerHTML = html;
  }

  // 关闭旧面板后打开
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('open'), 80);

  // 绑定关闭按钮
  const closeBtn = document.getElementById('category-detail-close');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      titleEl._currentCat = null;
    });
  }
}

/**
 * 编辑品类
 */
function editCategory(index) {
  const cat = categories[index];
  if (!cat) return;
  
  showPrompt('修改品类名称：', cat.name, function(newName) {
    if (newName && newName.trim() && newName.trim() !== cat.name) {
      // 检查重名
      if (categories.find(c => c.name === newName.trim())) {
        showToast('该品类名称已存在', 'warning');
        return;
      }
      cat.name = newName.trim();
      localStorage.setItem('categories', JSON.stringify(categories));
      renderCategoryList();
      refreshAllCategoryDropdowns();
      showToast(`品类已更新为"${newName.trim()}"`, 'success');
    }
  });
}

/**
 * 删除品类
 */
function deleteCategory(index) {
  const cat = categories[index];
  if (!cat) return;
  showConfirm(`确定删除品类"${cat.name}"吗？`, function() {
    categories.splice(index, 1);
    localStorage.setItem('categories', JSON.stringify(categories));
    renderCategoryList();
    refreshAllCategoryDropdowns();
  });
}

/**
 * 从本地存储加载采购单数据
 */
function loadPurchaseOrdersData() {
  const data = localStorage.getItem('purchaseOrders');
  console.log('从localStorage读取采购单数据:', data ? '有数据' : '无数据');
  if (data) {
    purchaseOrders = JSON.parse(data);
    console.log('解析后的采购单数量:', purchaseOrders.length);
  } else {
    purchaseOrders = [];
  }
}

/**
 * 加载采购单列表
 */
function loadPurchaseOrders() {
  console.log('>>> loadPurchaseOrders 函数开始执行');
  
  // 每次加载列表时刷新按钮可见性
  const canCreatePurchase = hasPermission('create_purchase');
  const createBtn = document.getElementById('create-purchase-btn');
  const importBtn = document.getElementById('import-purchase-btn');
  if (createBtn) createBtn.style.display = canCreatePurchase ? 'inline-flex' : 'none';
  if (importBtn) importBtn.style.display = canCreatePurchase ? 'inline-flex' : 'none';
  
  // 检查DOM元素是否存在
  var tbody = document.getElementById('purchase-tbody');
  console.log('tbody元素:', tbody);
  if (!tbody) {
    console.error('❌ 找不到 purchase-tbody 元素！');
    return;
  }
  console.log('✅ 找到 purchase-tbody 元素');
  
  loadPurchaseOrdersData();
  
  console.log('加载采购单列表，当前数量:', purchaseOrders.length);

  if (purchaseOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无采购单</td></tr>';
    console.log('采购单列表为空');
    return;
  }
  
  console.log('渲染采购单列表:', purchaseOrders);

  tbody.innerHTML = purchaseOrders.map(order => {
    const statusText = getStatusText(order.status);
    const statusClass = getStatusClass(order.status);
    const isPending = order.status === 'pending_stockin';
    
    // 根据权限决定操作按钮
    let actionButtons = `<button class="btn btn-sm" onclick="viewPurchaseDetail(${order.id})">查看</button>`;
    
    if (isPending && hasPermission('edit_purchase')) {
      actionButtons += ` <button class="btn btn-sm btn-accent" onclick="editPurchaseOrder(${order.id})">编辑</button>`;
    }
    
    if (isPending && hasPermission('confirm_stockin')) {
      actionButtons += ` <button class="btn btn-sm" onclick="confirmStockIn(${order.id})" style="background:var(--success);border-color:var(--success);color:#fff;">入库</button>`;
    }
    
    return `
      <tr>
        <td>${order.code}</td>
        <td>${order.purchase_date}</td>
        <td>${order.purchaser}</td>
        <td>${order.items.length} 种</td>
        <td>¥${order.total_amount.toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
  const statusMap = {
    'pending_stockin': '待入库',
    'stockin_completed': '已入库',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
}

/**
 * 获取状态样式类
 */
function getStatusClass(status) {
  const classMap = {
    'pending_stockin': 'warning',
    'stockin_completed': 'success',
    'cancelled': 'danger'
  };
  return classMap[status] || '';
}

/**
 * 查看采购单详情（模态框）
 */
function viewPurchaseDetail(orderId) {
  const order = purchaseOrders.find(o => o.id === orderId);
  if (!order) return;

  const suppliers = order.suppliers || [];
  const supplierText = suppliers.length > 0 ? suppliers.join('、') : '-';

  const body = document.getElementById('detail-modal-body');
  if (!body) return;

  body.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">基本信息</div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">采购单号</span>
          <span class="detail-value accent">${order.code}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">状态</span>
          <span class="detail-value"><span class="status-badge ${getStatusClass(order.status)}">${getStatusText(order.status)}</span></span>
        </div>
        <div class="detail-item">
          <span class="detail-label">采购日期</span>
          <span class="detail-value">${order.purchase_date}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">采购人</span>
          <span class="detail-value">${order.purchaser}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">供应商</span>
          <span class="detail-value">${supplierText}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">总金额</span>
          <span class="detail-value large accent">¥${order.total_amount.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">采购明细（共 ${order.items.length} 种物品）</div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>类别</th>
              <th>物品名称</th>
              <th>品牌</th>
              <th>型号</th>
              <th>数量</th>
              <th>单位</th>
              <th>单价</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${item.category || '-'}</td>
                <td style="font-weight:600;">${item.name}</td>
                <td>${item.brand || '-'}</td>
                <td>${item.model || '-'}</td>
                <td>${item.quantity}</td>
                <td>${item.unit || '-'}</td>
                <td>¥${item.price.toFixed(2)}</td>
                <td style="font-weight:600;color:var(--accent);">¥${item.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--bg-elevated);font-weight:600;">
              <td colspan="8" style="text-align:right;color:var(--text-secondary);">合计：</td>
              <td style="color:var(--accent);font-size:15px;">¥${order.total_amount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    ${order.remark ? `
    <div class="detail-section">
      <div class="detail-section-title">备注</div>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.6;">${order.remark}</p>
    </div>
    ` : ''}

    <div style="text-align:center;color:var(--text-muted);font-size:11px;margin-top:16px;">
      创建时间：${new Date(order.created_at).toLocaleString('zh-CN')}
    </div>
  `;

  // 设置标题
  document.getElementById('detail-modal-title').textContent = `采购单详情 - ${order.code}`;

  // 设置底部按钮
  const footer = document.getElementById('detail-modal-footer');
  const canEdit = order.status === 'pending_stockin' && hasPermission('edit_purchase');
  footer.innerHTML = `
    <button class="btn modal-cancel">关闭</button>
    ${canEdit ? `<button class="btn btn-accent" onclick="closeModal(); editPurchaseOrder(${order.id});">编辑采购单</button>` : ''}
  `;

  // 重新绑定关闭按钮事件
  footer.querySelectorAll('.modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => closeModal());
  });

  openModal('modal-purchase-detail');
}

/**
 * 编辑采购单（入库前可修改）
 */
function editPurchaseOrder(orderId) {
  if (!hasPermission('edit_purchase')) {
    showToast('您没有编辑采购单的权限', 'warning');
    return;
  }

  const order = purchaseOrders.find(o => o.id === orderId);
  if (!order) return;

  if (order.status !== 'pending_stockin') {
    showToast('只有待入库状态的采购单可以编辑', 'warning');
    return;
  }

  // 打开新建采购单模态框，预填数据
  const modal = document.getElementById('modal-purchase');
  if (!modal) return;

  const form = modal.querySelector('#purchase-form');
  if (form) {
    form.reset();
    form.querySelector('[name="purchase_date"]').value = order.purchase_date;
    form.querySelector('[name="purchaser"]').value = order.purchaser;
    form.querySelector('[name="remark"]').value = order.remark || '';
  }

  // 清空并重建供应商分组
  const container = document.getElementById('supplier-groups-container');
  if (container) {
    container.innerHTML = '';
  }

  // 按供应商分组物品
  const supplierMap = {};
  order.items.forEach(item => {
    const supplier = item.supplier || '默认供应商';
    if (!supplierMap[supplier]) supplierMap[supplier] = [];
    supplierMap[supplier].push(item);
  });

  Object.entries(supplierMap).forEach(([supplierName, items]) => {
    addSupplierGroup();
    const groups = container.querySelectorAll('.supplier-group');
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) return;

    // 设置供应商名称
    const nameInput = lastGroup.querySelector('.supplier-name-input');
    if (nameInput) nameInput.value = supplierName;

    // 添加物品行
    const tbody = lastGroup.querySelector('.items-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    items.forEach(item => {
      addItemToGroup(lastGroup.id);
      const rows = tbody.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      if (!lastRow) return;

      const categoryInput = lastRow.querySelector('.item-category');
      const nameInput = lastRow.querySelector('.item-name');
      const brandInput = lastRow.querySelector('.item-brand');
      const modelInput = lastRow.querySelector('.item-model');
      const quantityInput = lastRow.querySelector('.item-quantity');
      const unitInput = lastRow.querySelector('.item-unit');
      const priceInput = lastRow.querySelector('.item-price');

      if (categoryInput) {
        categoryInput.value = item.category || '';
        // 触发类别变更以生成编码
        categoryInput.dispatchEvent(new Event('blur'));
      }
      if (nameInput) nameInput.value = item.name || '';
      if (brandInput) brandInput.value = item.brand || '';
      if (modelInput) modelInput.value = item.model || '';
      if (quantityInput) quantityInput.value = item.quantity || '';
      if (unitInput) unitInput.value = item.unit || '';
      if (priceInput) priceInput.value = item.price || '';

      // 更新金额
      calculateRowAmount(quantityInput);
    });
  });

  updatePurchaseTotal();

  // 标记编辑中的采购单（不立即删除，取消时数据不丢失）
  _editingPurchaseOrderId = orderId;

  openModal('modal-purchase');
}

/**
 * 确认入库（打开入库确认模态框）
 */
function confirmStockIn(orderId) {
  const order = purchaseOrders.find(o => o.id === orderId);
  if (!order) return;

  // 检查权限
  if (!hasPermission('confirm_stockin')) {
    showToast('只有仓库管理员可以确认入库', 'warning');
    return;
  }

  // 填充采购单信息
  document.getElementById('confirm-purchase-code').textContent = order.code;
  document.getElementById('confirm-purchase-date').textContent = order.purchase_date;
  document.getElementById('confirm-purchaser').textContent = order.purchaser;
  document.getElementById('confirm-supplier').textContent = order.supplier || '-';

  // 设置默认入库日期为今天
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('stockin-date').value = today;

  // 生成批次号
  const batchCode = `BATCH${Date.now()}`;
  document.getElementById('stockin-batch').value = batchCode;

  // 填充入库明细
  const tbody = document.getElementById('stockin-items-tbody');
  if (tbody) {
    tbody.innerHTML = order.items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.brand || '-'}</td>
        <td>${item.model || '-'}</td>
        <td>${item.quantity}</td>
        <td><input type="number" class="actual-quantity" value="${item.quantity}" min="0" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text-primary);font-size:13px;"></td>
        <td>${item.unit}</td>
        <td>¥${item.price.toFixed(2)}</td>
        <td>¥${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `).join('');
  }

  // 绑定确认入库按钮
  const confirmBtn = document.getElementById('confirm-stockin-btn');
  if (confirmBtn) {
    // 移除旧的事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => executeStockIn(order));
  }

  // 打开模态框
  openModal('modal-stockin-confirm');
}

/**
 * 执行入库操作
 */
async function executeStockIn(order) {
  const stockinDate = document.getElementById('stockin-date').value;
  const batchCode = document.getElementById('stockin-batch').value;
  const remark = document.getElementById('stockin-remark').value;

  if (!stockinDate) {
    showToast('请选择入库日期', 'warning');
    return;
  }

  showButtonLoading('confirm-stockin-btn', '入库中...');
  try {

  // 获取实际入库数量
  const rows = document.querySelectorAll('#stockin-items-tbody tr');
  const stockinItems = [];
  
  rows.forEach((row, index) => {
    const actualQty = parseInt(row.querySelector('.actual-quantity').value) || 0;
    const item = order.items[index];
    
    stockinItems.push({
      ...item,
      actual_quantity: actualQty
    });
  });

  const stockInPayload = {
    stockin_date: stockinDate,
    batch_code: batchCode,
    items: stockinItems,
    total_quantity: stockinItems.reduce((sum, item) => sum + item.actual_quantity, 0),
    total_amount: stockinItems.reduce((sum, item) => sum + (item.actual_quantity * item.price), 0),
    remark: remark
  };

  // 优先尝试云端入库（SupaDB.confirmStockIn）
  if (typeof SupaDB !== 'undefined' && SupaDB.confirmStockIn) {
    try {
      const inserted = await SupaDB.confirmStockIn(order.id, stockInPayload);
      // 成功后刷新列表和记录
      try {
        // 更新本地缓存（乐观）
        let localPOs = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
        localPOs = localPOs.map(p => (p.code === order.code ? Object.assign({}, p, { status: 'stockin_completed' }) : p));
        localStorage.setItem('purchaseOrders', JSON.stringify(localPOs));
      } catch(e){console.warn('更新本地采购单缓存失败', e.message)}
      // 同步保存到本地 stockInRecords + 生成库存明细
      try {
        var siRecord = {
          id: Date.now(),
          code: inserted.code || ('SI' + Date.now()),
          purchase_order_id: order.id,
          purchase_order_code: order.code,
          stockin_date: stockinDate,
          batch_code: inserted.batch_code || batchCode,
          items: stockinItems,
          total_quantity: stockInPayload.total_quantity,
          total_amount: stockInPayload.total_amount,
          status: 'completed',
          confirmed_by: inserted.confirmed_by || getCurrentUser().name,
          confirmed_at: inserted.confirmed_at || new Date().toISOString(),
          remark: remark,
          created_at: new Date().toISOString()
        };
        saveStockInRecord(siRecord);
        generateInventoryFromStockIn(siRecord);
      } catch(e){console.warn('保存本地入库记录失败', e.message)}

      closeModal();
      loadPurchaseOrders();
      if (typeof loadStockInRecords === 'function') loadStockInRecords();
      showToast(`入库成功！批次号：${inserted.code || batchCode}，已同步至云端`, 'success', 4000);
      return;
    } catch (e) {
      console.warn('云端入库失败，退回本地处理：', e.message);
      // 继续本地处理
    }
  }

  // 回退到本地处理（若云端不可用或失败）
  // 创建入库记录
  const stockInRecord = {
    id: Date.now(),
    code: `SI${Date.now()}`,
    purchase_order_id: order.id,
    purchase_order_code: order.code,
    stockin_date: stockinDate,
    batch_code: batchCode,
    items: stockinItems,
    total_quantity: stockinItems.reduce((sum, item) => sum + item.actual_quantity, 0),
    total_amount: stockinItems.reduce((sum, item) => sum + (item.actual_quantity * item.price), 0),
    status: 'completed',
    confirmed_by: getCurrentUser().name,
    confirmed_at: new Date().toISOString(),
    remark: remark,
    created_at: new Date().toISOString()
  };

  // 保存入库记录
  saveStockInRecord(stockInRecord);

  // 更新采购单状态
  order.status = 'stockin_completed';
  savePurchaseOrders();

  // 自动生成库存明细
  generateInventoryFromStockIn(stockInRecord);

  // 关闭模态框
  closeModal();

  // 刷新列表
  loadPurchaseOrders();
  if (typeof loadStockInRecords === 'function') {
    loadStockInRecords();
  }

  showToast(`入库成功！批次号：${batchCode}，已自动生成库存明细（本地）`, 'success', 4000);
  
  console.log('入库完成（本地）:', stockInRecord);
  } finally {
    hideButtonLoading('confirm-stockin-btn');
  }
}

/**
 * 保存入库记录
 */
function saveStockInRecord(record) {
  let records = [];
  const data = localStorage.getItem('stockInRecords');
  if (data) {
    records = JSON.parse(data);
  }
  records.push(record);
  localStorage.setItem('stockInRecords', JSON.stringify(records));
}

/**
 * 从入库记录生成库存明细
 */
function generateInventoryFromStockIn(stockInRecord) {
  // 获取现有库存数据
  let inventory = [];
  const data = localStorage.getItem('inventory');
  if (data) {
    inventory = JSON.parse(data);
  }

  // 为每个入库物品创建或更新库存记录
  stockInRecord.items.forEach(item => {
    if (item.actual_quantity <= 0) return; // 跳过数量为0的物品

    // 查找是否已存在该物品
    const existingItem = inventory.find(inv => 
      inv.name === item.name && 
      inv.brand === item.brand && 
      inv.model === item.model
    );

    if (existingItem) {
      // 更新现有库存
      existingItem.stock += item.actual_quantity;
      existingItem.last_stockin_date = stockInRecord.stockin_date;
      existingItem.last_stockin_batch = stockInRecord.batch_code;
    } else {
      // 创建新库存记录
      inventory.push({
        id: Date.now() + Math.random(),
        code: `ITEM${String(inventory.length + 1).padStart(3, '0')}`,
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        category: '未分类', // 需要后续分类
        stock: item.actual_quantity,
        unit: item.unit,
        safety_stock: 10,
        last_stockin_date: stockInRecord.stockin_date,
        last_stockin_batch: stockInRecord.batch_code,
        source: 'purchase', // 标记来源为采购
        created_at: new Date().toISOString()
      });
    }
  });

  // 保存库存数据
  localStorage.setItem('inventory', JSON.stringify(inventory));
  
  console.log('库存明细已更新');
}

/**
 * ===== Excel导入功能 =====
 */

/**
 * 打开导入模态框
 */
function openImportModal() {
  currentImportStep = 1;
  importData = [];
  updateImportStep();
  openModal('modal-import');
}

/**
 * 绑定导入事件
 */
function bindImportEvents() {
  // 下载模板
  const downloadBtn = document.getElementById('download-template-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadTemplate);
  }

  // 上传区域点击
  const uploadArea = document.getElementById('upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('click', () => {
      document.getElementById('import-file-input').click();
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--accent)';
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = 'var(--border)';
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--border)';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileUpload(files[0]);
      }
    });
  }

  // 文件选择
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  // 上一步/下一步按钮
  const prevBtn = document.getElementById('import-prev-btn');
  const nextBtn = document.getElementById('import-next-btn');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentImportStep > 1) {
        currentImportStep--;
        updateImportStep();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentImportStep < 4) {
        if (currentImportStep === 3 && importData.length === 0) {
          showToast('请先上传文件', 'warning');
          return;
        }
        currentImportStep++;
        updateImportStep();
      } else {
        // 第4步确认导入
        executeImport();
      }
    });
  }
}

/**
 * 更新导入步骤显示
 */
function updateImportStep() {
  // 更新步骤指示器
  const steps = document.querySelectorAll('.step');
  steps.forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index + 1 === currentImportStep) {
      step.classList.add('active');
    } else if (index + 1 < currentImportStep) {
      step.classList.add('completed');
    }
  });

  // 显示对应步骤内容
  const contents = document.querySelectorAll('.import-step-content');
  contents.forEach((content, index) => {
    content.classList.remove('active');
    if (index + 1 === currentImportStep) {
      content.classList.add('active');
    }
  });

  // 控制按钮显示
  const prevBtn = document.getElementById('import-prev-btn');
  const nextBtn = document.getElementById('import-next-btn');
  
  if (prevBtn) {
    prevBtn.style.display = currentImportStep > 1 ? 'inline-flex' : 'none';
  }
  
  if (nextBtn) {
    if (currentImportStep === 4) {
      nextBtn.textContent = '确认导入';
    } else {
      nextBtn.textContent = '下一步';
    }
  }
}

/**
 * 下载Excel模板
 */
function downloadTemplate() {
  // 创建模板数据（类别使用新体系：循环使用类/消耗类）
  const templateData = [
    ['采购日期', '采购人', '供应商', '类别', '物品名称', '品牌', '型号', '数量', '单位', '单价', '备注'],
    ['2026-06-09', '张三', 'XX供应商', '消耗类', '一次性拖鞋', '洁丽雅', '均码', '200', '双', '3.5', '列车客房用'],
    ['2026-06-09', '张三', 'XX供应商', '循环使用类', '不锈钢托盘', '顺发', '中号', '20', '个', '25.0', '列车餐车用'],
    ['2026-06-09', '张三', 'XX供应商', '消耗类', '矿泉水', '农夫山泉', '550ml', '100', '瓶', '2.5', '']
  ];

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, ws, '采购单模板');

  // 下载文件
  XLSX.writeFile(wb, '采购单导入模板.xlsx');
}

/**
 * 处理文件上传
 */
function handleFileUpload(file) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // 读取第一个工作表
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      // 解析数据
      parseImportData(jsonData);
      
      // 进入下一步
      currentImportStep = 3;
      updateImportStep();
      
    } catch (error) {
      showToast('文件解析失败：' + error.message, 'error');
      console.error(error);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

/**
 * 解析导入数据
 */
// 解析 Excel 中可能的日期类型（支持数字序列、ISO、常见分隔符）
function parseExcelDateValue(v) {
  if (!v) return '';
  // Excel 数值序列（常见）：将其转换为 JS 日期
  if (typeof v === 'number') {
    // Excel epoch -> JS epoch: (v - 25569) * 86400 * 1000
    try {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch (e) { /* ignore */ }
  }

  // 如果是日期字符串，尝试标准化
  if (typeof v === 'string') {
    let s = v.trim();
    // 常见 Excel 导出会用 '/' 或 '.' 或 '-' 分隔
    s = s.replace(/^\s+|\s+$/g, '');
    s = s.replace(/\./g, '-').replace(/\//g, '-');

    // 如果格式是 dd-mm-yyyy 或 d-m-yyyy，转换为 yyyy-mm-dd
    const parts = s.split('-');
    if (parts.length === 3) {
      // 判断是否为 yyyy-mm-dd
      if (parts[0].length === 4) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } else {
        // 假设 dd-mm-yyyy
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const yyyy = parts[2];
        const iso = `${yyyy}-${mm}-${dd}`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
    }

    // 最后尝试 Date.parse
    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
  }

  return '';
}

function parseImportData(data) {
  if (data.length < 2) {
    showToast('文件中没有有效数据', 'warning');
    return;
  }

  // 跳过表头
  const rows = data.slice(1);
  importData = [];
  const errors = [];

  rows.forEach((row, index) => {
    // 现在模板包含 11 列：采购日期, 采购人, 供应商, 类别, 物品名称, 品牌, 型号, 数量, 单位, 单价, 备注
    if (row.length < 8) {
      errors.push(`第${index + 2}行：数据列数不足`);
      return;
    }

    // 解析采购日期，支持数字序列或字符串
    const rawDate = row[0];
    const purchaseDate = parseExcelDateValue(rawDate) || '';

    const purchaser = row[1] || '';
    const supplier = row[2] || '';
    const category = row[3] || '';
    const itemName = row[4] || '';
    const brand = row[5] || '';
    const model = row[6] || '';

    const quantity = parseFloat(row[7]) || 0;
    const unit = row[8] || '';
    const price = parseFloat(row[9]) || 0;
    const amount = quantity * price;

    if (quantity <= 0) {
      errors.push(`第${index + 2}行：数量必须大于0`);
      return;
    }

    importData.push({
      row_number: index + 2,
      purchase_date: purchaseDate,
      purchaser: purchaser,
      supplier: supplier,
      category: category,
      item_name: itemName,
      brand: brand,
      model: model,
      quantity: quantity,
      unit: unit,
      price: price,
      amount: amount,
      remark: row[10] || '',
      valid: true
    });
  });

  // 显示预览
  displayImportPreview(errors);
}

/**
 * 显示导入预览
 */
function displayImportPreview(errors) {
  const tbody = document.getElementById('import-preview-tbody');
  if (!tbody) return;

  // 显示错误信息
  const errorDiv = document.getElementById('import-errors');
  const errorList = document.getElementById('error-list');
  
  if (errors.length > 0 && errorDiv && errorList) {
    errorDiv.style.display = 'block';
    errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
  } else if (errorDiv) {
    errorDiv.style.display = 'none';
  }

  // 显示数据预览
  tbody.innerHTML = importData.map(item => `
    <tr>
      <td>${item.row_number}</td>
      <td>${item.purchase_date}</td>
      <td>${item.purchaser}</td>
      <td>${item.category || '-'}</td>
      <td>${item.item_name}</td>
      <td>${item.brand || '-'}</td>
      <td>${item.model || '-'}</td>
      <td>${item.quantity}</td>
      <td>${item.unit}</td>
      <td>¥${item.price.toFixed(2)}</td>
      <td>¥${item.amount.toFixed(2)}</td>
      <td><span class="status-badge success">✓</span></td>
    </tr>
  `).join('');

  // 更新统计信息
  document.getElementById('preview-count').textContent = importData.length;
  const total = importData.reduce((sum, item) => sum + item.amount, 0);
  document.getElementById('preview-total').textContent = total.toFixed(2);
}

/**
 * 执行导入
 */
function executeImport() {
  if (importData.length === 0) {
    showToast('没有可导入的数据', 'warning');
    return;
  }

  // 预处理：确保类别/品牌/型号存在于系统中；若系统内无该物品则创建空库存记录（stock=0）以便后续同步
  try {
    let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');

    importData.forEach(it => {
      // 类别自动创建
      if (it.category && !categories.find(c => c.name === it.category)) {
        autoCreateCategory(it.category);
      }
      // 品牌/型号历史记录
      if (it.brand) addBrandToHistory(it.item_name, it.brand);
      if (it.model) addModelToHistory(it.item_name, it.model);

      // 若系统中不存在该物品（按 name+brand+model），则创建一条库存占位（stock 0）
      const exists = inventory.find(inv => inv.name === it.item_name && (inv.brand || '') === (it.brand || '') && (inv.model || '') === (it.model || ''));
      if (!exists) {
        const newInv = {
          id: Date.now() + Math.random(),
          code: `ITEM${String(inventory.length + 1).padStart(3, '0')}`,
          name: it.item_name,
          brand: it.brand || '',
          model: it.model || '',
          category: it.category || '未分类',
          stock: 0,
          unit: it.unit || '',
          safety_stock: 10,
          created_at: new Date().toISOString(),
          source: 'import-placeholder'
        };
        inventory.push(newInv);
      }
    });

    // 保存可能新增的类别和 inventory
    localStorage.setItem('categories', JSON.stringify(categories));
    localStorage.setItem('inventory', JSON.stringify(inventory));
  } catch (e) { console.warn('预创建条目失败', e); }

  // 按采购日期和采购人分组
  const groups = {};
  importData.forEach(item => {
    const key = `${item.purchase_date}_${item.purchaser}`;
    if (!groups[key]) {
      groups[key] = {
        purchase_date: item.purchase_date,
        purchaser: item.purchaser,
        supplier: item.supplier,
        items: []
      };
    }
    groups[key].items.push({
      name: item.item_name,
      brand: item.brand,
      model: item.model,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      amount: item.amount
    });
  });

  // 创建采购单
  Object.values(groups).forEach(group => {
    const orderCode = generatePurchaseCode();
    const totalAmount = group.items.reduce((sum, item) => sum + item.amount, 0);
    
    const purchaseOrder = {
      id: Date.now() + Math.random(),
      code: orderCode,
      purchase_date: group.purchase_date,
      purchaser: group.purchaser,
      supplier: group.supplier,
      items: group.items,
      total_amount: totalAmount,
      status: 'pending_stockin',
      created_at: new Date().toISOString(),
      remark: 'Excel导入'
    };

    purchaseOrders.push(purchaseOrder);
  });

  // 保存数据
  savePurchaseOrders();

  // 关闭模态框
  closeModal();

  // 刷新列表
  loadPurchaseOrders();

  showToast(`成功导入 ${Object.keys(groups).length} 个采购单`, 'success');
}

/**
 * 根据类别编码生成商品编码
 */
function generateItemCodeByCategory(categoryCode) {
  // 初始化该类别的计数器（如果不存在）
  if (!categoryCodeCounters[categoryCode]) {
    categoryCodeCounters[categoryCode] = parseInt(localStorage.getItem(`categoryCounter_${categoryCode}`) || '1');
  }
  
  const counter = categoryCodeCounters[categoryCode];
  const code = `${categoryCode}${String(counter).padStart(6, '0')}`;
  
  // 更新计数器
  categoryCodeCounters[categoryCode]++;
  localStorage.setItem(`categoryCounter_${categoryCode}`, categoryCodeCounters[categoryCode].toString());
  
  return code;
}

/**
 * 生成商品编码（旧版，保留兼容）
 */
function generateItemCode() {
  // 从localStorage获取计数器
  let counter = parseInt(localStorage.getItem('itemCodeCounter') || '1');
  const code = `SKU${String(counter).padStart(5, '0')}`;
  counter++;
  localStorage.setItem('itemCodeCounter', counter.toString());
  itemCodeCounter = counter; // 更新内存中的计数器
  return code;
}

/**
 * 获取类别选项HTML（用于datalist）
 */
function getCategoryOptionsForDatalist() {
  return categories.map(cat => 
    `<option value="${cat.name}">`
  ).join('');
}

/**
 * 获取类别选项HTML（用于select）
 */
function getCategoryOptions() {
  return categories.map(cat => 
    `<option value="${cat.name}">${cat.name}</option>`
  ).join('');
}

/**
 * 自动创建新类别（生成类别编码前缀）
 */
function autoCreateCategory(categoryName) {
  // 根据类别名称生成编码前缀（新体系）
  let codePrefix;
  if (categoryName.includes('循环') || categoryName.toLowerCase().includes('reuse')) {
    codePrefix = 'XH';
  } else if (categoryName.includes('消耗') || categoryName.toLowerCase().includes('consum')) {
    codePrefix = 'HM';
  } else if (categoryName.includes('其他') || categoryName.toLowerCase().includes('other')) {
    codePrefix = 'QT';
  } else {
    // 默认使用 SK + 序号
    codePrefix = 'SK' + String(categories.length + 1).padStart(2, '0');
  }
  
  categories.push({
    code: codePrefix,
    name: categoryName,
    scenario: '通用',
    remark: '自动创建',
    created_at: new Date().toISOString()
  });
  
  // 保存到localStorage
  localStorage.setItem('categories', JSON.stringify(categories));
  
  // 同步到库存分类
  syncCategoryToInventory(codePrefix, categoryName);
  
  console.log(`自动创建类别：${categoryName} (${codePrefix})`);
  
  return categories[categories.length - 1];
}

/**
 * 打开新增类别模态框
 */
function openCategoryModal(event) {
  // 阻止事件冒泡，防止关闭采购单模态框
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
  
  // 生成类别编码
  const code = `CAT${String(categories.length + 1).padStart(3, '0')}`;
  document.getElementById('new-category-code').value = code;
  document.getElementById('new-category-name').value = '';
  document.getElementById('new-category-remark').value = '';
  
  // 重置场景选择
  const scenarioSelect = document.getElementById('new-category-scenario');
  if (scenarioSelect) scenarioSelect.value = '通用';
  
  openModal('modal-category');
}

/**
 * 绑定类别事件
 */
function bindCategoryEvents() {
  const saveBtn = document.getElementById('save-category-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveNewCategory);
  }

  // 顶部新增品类按钮绑定，保证点击生效
  const addCatBtn = document.getElementById('add-category-btn');
  if (addCatBtn && !addCatBtn._bound) {
    addCatBtn._bound = true;
    addCatBtn.addEventListener('click', (e) => { e.preventDefault(); openCategoryModal(e); });
    // 根据权限控制可见性（若有 hasPermission）
    try { if (typeof hasPermission === 'function') addCatBtn.style.display = hasPermission('create_category') ? '' : 'none'; } catch(e) { /* ignore */ }
  }
}

/**
 * 保存新类别
 */
function saveNewCategory() {
  const name = document.getElementById('new-category-name').value.trim();
  const code = document.getElementById('new-category-code').value.trim();
  const remark = document.getElementById('new-category-remark').value.trim();
  const scenarioEl = document.getElementById('new-category-scenario');
  const scenario = scenarioEl ? scenarioEl.value : '通用';
  
  if (!name) {
    showToast('请输入类别名称', 'warning');
    return;
  }
  
  // 检查是否已存在
  if (categories.find(c => c.name === name)) {
    showToast('该类别已存在', 'warning');
    return;
  }
  
  // 添加类别
  categories.push({
    code: code,
    name: name,
    scenario: scenario,
    remark: remark,
    created_at: new Date().toISOString()
  });
  
  // 保存到localStorage
  localStorage.setItem('categories', JSON.stringify(categories));
  
  // 同步到库存分类
  syncCategoryToInventory(code, name);
  
  // 关闭模态框
  closeModal();
  
  // 刷新所有类别下拉框
  refreshAllCategoryDropdowns();
  
  // 刷新品类管理页面
  renderCategoryList();
  
  showToast(`类别「${name}」已创建`, 'success');
}

/**
 * 同步类别到库存分类
 */
function syncCategoryToInventory(code, name) {
  // 这里可以调用库存管理模块的API
  // 暂时保存在localStorage中
  let inventoryCategories = [];
  const data = localStorage.getItem('inventoryCategories');
  if (data) {
    inventoryCategories = JSON.parse(data);
  }
  
  if (!inventoryCategories.find(c => c.name === name)) {
    inventoryCategories.push({
      code: code,
      name: name,
      created_at: new Date().toISOString()
    });
    localStorage.setItem('inventoryCategories', JSON.stringify(inventoryCategories));
  }
}

/**
 * 加载类别数据（兼容旧接口，委托给 loadCategoriesFromStorage）
 */
function loadCategories() {
  loadCategoriesFromStorage();
}

/**
 * 刷新所有类别下拉框
 */
function refreshAllCategoryDropdowns() {
  // 刷新datalist
  categories.forEach((cat, index) => {
    const datalist = document.getElementById(`category-list-SKU${String(index + 1).padStart(5, '0')}`);
    if (datalist) {
      datalist.innerHTML = getCategoryOptionsForDatalist();
    }
  });
  
  // 刷新所有现存的datalist（动态生成的行）
  const allDatalists = document.querySelectorAll('[id^="category-list-"]');
  allDatalists.forEach(datalist => {
    datalist.innerHTML = getCategoryOptionsForDatalist();
  });
}

/**
 * 加载品牌型号历史记录
 */
function loadBrandModelHistory() {
  const brandData = localStorage.getItem('brandHistory');
  const modelData = localStorage.getItem('modelHistory');
  
  if (brandData) {
    brandHistory = JSON.parse(brandData);
  }
  if (modelData) {
    modelHistory = JSON.parse(modelData);
  }
}

/**
 * 保存品牌型号历史记录
 */
function saveBrandModelHistory() {
  localStorage.setItem('brandHistory', JSON.stringify(brandHistory));
  localStorage.setItem('modelHistory', JSON.stringify(modelHistory));
}

/**
 * 更新品牌型号下拉列表
 */
function updateBrandModelDatalist(itemName, itemCode) {
  if (!itemName) return;
  
  // 初始化历史记录
  if (!brandHistory[itemName]) {
    brandHistory[itemName] = [];
  }
  if (!modelHistory[itemName]) {
    modelHistory[itemName] = [];
  }
  
  // 更新品牌datalist
  const brandDatalist = document.getElementById(`brand-list-${itemCode}`);
  if (brandDatalist) {
    brandDatalist.innerHTML = brandHistory[itemName]
      .map(brand => `<option value="${brand}">`)
      .join('');
  }
  
  // 更新型号datalist
  const modelDatalist = document.getElementById(`model-list-${itemCode}`);
  if (modelDatalist) {
    modelDatalist.innerHTML = modelHistory[itemName]
      .map(model => `<option value="${model}">`)
      .join('');
  }
}

/**
 * 添加品牌到历史记录
 */
function addBrandToHistory(itemName, brand) {
  if (!itemName || !brand) return;
  
  if (!brandHistory[itemName]) {
    brandHistory[itemName] = [];
  }
  
  if (!brandHistory[itemName].includes(brand)) {
    brandHistory[itemName].push(brand);
    saveBrandModelHistory();
  }
}

/**
 * 添加型号到历史记录
 */
function addModelToHistory(itemName, model) {
  if (!itemName || !model) return;
  
  if (!modelHistory[itemName]) {
    modelHistory[itemName] = [];
  }
  
  if (!modelHistory[itemName].includes(model)) {
    modelHistory[itemName].push(model);
    saveBrandModelHistory();
  }
}

// ============== 领用标准管理 ==============

/**
 * 加载领用标准
 */
function loadConsumptionStandards() {
  const data = localStorage.getItem('consumptionStandards');
  if (data) {
    consumptionStandards = JSON.parse(data);
  }
}

/**
 * 保存领用标准到 localStorage
 */
function saveConsumptionStandards() {
  localStorage.setItem('consumptionStandards', JSON.stringify(consumptionStandards));
}

/**
 * 添加或更新领用标准
 */
function upsertConsumptionStandard(itemName, scenario, maxPerTour) {
  const idx = consumptionStandards.findIndex(
    s => s.item_name === itemName && s.scenario === scenario
  );
  if (idx >= 0) {
    consumptionStandards[idx].max_per_tour = maxPerTour;
  } else {
    consumptionStandards.push({
      id: Date.now(),
      item_name: itemName,
      scenario: scenario,
      max_per_tour: maxPerTour,
      created_at: new Date().toISOString()
    });
  }
  saveConsumptionStandards();
}

/**
 * 删除领用标准
 */
function deleteConsumptionStandard(id) {
  consumptionStandards = consumptionStandards.filter(s => s.id !== id);
  saveConsumptionStandards();
  renderConsumptionStandardsPanel();
  showToast('领用标准已删除', 'success');
}

/**
 * 获取某物品在某场景下的领用标准
 */
function getConsumptionStandard(itemName, scenario) {
  // 优先精确匹配场景
  let std = consumptionStandards.find(s => s.item_name === itemName && s.scenario === scenario);
  if (std) return std;
  // 其次匹配"通用"场景
  std = consumptionStandards.find(s => s.item_name === itemName && s.scenario === '通用');
  return std || null;
}

/**
 * 检查领用是否超额
 * 返回 { overLimit: boolean, standard: number|null, currentTotal: number, message: string }
 */
function checkOverLimit(itemName, scenario, requestedQty, tourName) {
  const std = getConsumptionStandard(itemName, scenario);
  if (!std) return { overLimit: false, standard: null, currentTotal: 0, message: '' };

  // 统计同一团期同一场景下该物品已领用总量（不含已取消/已完成出库的）
  let reqList = JSON.parse(localStorage.getItem('requisitions') || '[]');
  let currentTotal = 0;
  reqList.forEach(req => {
    if (req.tour_name === tourName && req.scenario === scenario &&
        req.status !== 'cancelled' && req.status !== 'withdrawn') {
      req.items.forEach(it => {
        if (it.name === itemName) {
          currentTotal += it.quantity;
        }
      });
    }
  });

  // 也检查已完成的出库记录
  let soList = JSON.parse(localStorage.getItem('stockOutRecords') || '[]');
  soList.forEach(so => {
    if (so.tour_name === tourName && so.scenario === scenario) {
      so.items.forEach(it => {
        if (it.name === itemName) {
          currentTotal += it.quantity;
        }
      });
    }
  });

  // 去重：出库记录中的已计入领用单的，不再重复加
  // 简化处理：出库记录关联领用单，用 requisition_id 去重
  // 重新统计：只统计"已完成出库"的数量 + "待出库"领用单的数量
  currentTotal = 0;
  const countedReqIds = new Set();

  // 已出库的数量
  soList.forEach(so => {
    if (so.tour_name === tourName && so.scenario === scenario && so.requisition_id) {
      countedReqIds.add(so.requisition_id);
      so.items.forEach(it => {
        if (it.name === itemName) currentTotal += it.quantity;
      });
    }
  });

  // 待出库的领用单数量（未被出库记录覆盖的）
  reqList.forEach(req => {
    if (req.tour_name === tourName && req.scenario === scenario &&
        !countedReqIds.has(req.id) &&
        req.status !== 'cancelled' && req.status !== 'withdrawn' &&
        req.status !== 'outbound_completed') {
      req.items.forEach(it => {
        if (it.name === itemName) currentTotal += it.quantity;
      });
    }
  });

  const newTotal = currentTotal + requestedQty;
  const overLimit = newTotal > std.max_per_tour;

  return {
    overLimit,
    standard: std.max_per_tour,
    currentTotal,
    newTotal,
    message: overLimit
      ? `⚠️ "${itemName}" 在团期「${tourName}」(${scenario}) 已领用 ${currentTotal}，本次申请 ${requestedQty}，合计 ${newTotal}，超过标准上限 ${std.max_per_tour}`
      : ''
  };
}

/**
 * 渲染领用标准配置面板（在品类管理页面下方）
 */
function renderConsumptionStandardsPanel() {
  try {
  let panel = document.getElementById('consumption-standards-panel');
  if (!panel) {
    // 如果面板不存在，尝试在品类管理模块中创建
    const modulePane = document.getElementById('module-categories');
    if (!modulePane) return;

    panel = document.createElement('div');
    panel.id = 'consumption-standards-panel';
    panel.className = 'panel';
    panel.style.marginTop = '16px';
    modulePane.appendChild(panel);
  }

  loadConsumptionStandards();

  const isAdmin = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');

  // 获取所有库存物品名用于下拉
  let inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  const itemNames = [...new Set(inventory.map(it => it.name).filter(Boolean))];
  const itemOptions = itemNames.map(n => `<option value="${n}">${n}</option>`).join('');

  const scenarioOptions = ['列车餐车', '列车客房', '通用'].map(s =>
    `<option value="${s}">${s}</option>`
  ).join('');

  let tableHtml = '';
  if (consumptionStandards.length === 0) {
    tableHtml = '<tr><td colspan="5" class="empty-state">暂无领用标准，请添加</td></tr>';
  } else {
    tableHtml = consumptionStandards.map(std => `
      <tr>
        <td style="font-weight:600;">${std.item_name}</td>
        <td><span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:12px;">${std.scenario}</span></td>
        <td style="font-weight:700;color:var(--accent);">${std.max_per_tour}</td>
        <td>${std.created_at ? std.created_at.slice(0, 10) : '-'}</td>
        <td>
          ${isAdmin ? `<button class="btn btn-sm" style="color:var(--danger);" onclick="deleteConsumptionStandard(${std.id})">删除</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">领用标准配置</div>
      ${isAdmin ? '<button class="btn btn-accent" id="add-standard-btn">+ 新增标准</button>' : ''}
    </div>
    <p style="color:var(--text-muted);font-size:13px;margin:0 0 16px 0;">
      设置每个物品在每个团期中的领用上限。当领用数量超过标准时，系统将在领用单和报表中标记超额。
    </p>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>物品名称</th>
            <th>使用场景</th>
            <th>每团期上限</th>
            <th>创建日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="standards-tbody">${tableHtml}</tbody>
      </table>
    </div>
    ${isAdmin ? `
    <div id="add-standard-form" style="display:none;margin-top:16px;padding:16px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);">
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:160px;margin:0;">
          <label style="font-size:12px;">物品名称</label>
          <input type="text" id="std-item-name" list="std-item-datalist" placeholder="输入或选择物品" style="width:100%;">
          <datalist id="std-item-datalist">${itemOptions}</datalist>
        </div>
        <div class="form-group" style="flex:0 0 140px;margin:0;">
          <label style="font-size:12px;">使用场景</label>
          <select id="std-scenario" style="width:100%;">${scenarioOptions}</select>
        </div>
        <div class="form-group" style="flex:0 0 120px;margin:0;">
          <label style="font-size:12px;">每团期上限</label>
          <input type="number" id="std-max-qty" min="1" value="10" style="width:100%;">
        </div>
        <div style="display:flex;gap:8px;padding-bottom:0;">
          <button class="btn btn-accent" onclick="_saveStandardFromForm()">保存</button>
          <button class="btn" onclick="document.getElementById('add-standard-form').style.display='none'">取消</button>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // 绑定新增标准按钮
  const addBtn = document.getElementById('add-standard-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const form = document.getElementById('add-standard-form');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  }
  } catch (e) {
    console.error('[renderConsumptionStandardsPanel] 错误:', e);
  }
}

/**
 * 从表单保存领用标准
 */
function _saveStandardFromForm() {
  const itemName = document.getElementById('std-item-name').value.trim();
  const scenario = document.getElementById('std-scenario').value;
  const maxQty = parseInt(document.getElementById('std-max-qty').value);

  if (!itemName) { showToast('请输入物品名称', 'warning'); return; }
  if (!maxQty || maxQty < 1) { showToast('请输入有效的上限数量', 'warning'); return; }

  upsertConsumptionStandard(itemName, scenario, maxQty);
  document.getElementById('add-standard-form').style.display = 'none';
  renderConsumptionStandardsPanel();
  showToast(`已设置「${itemName}」在${scenario}的领用标准：每团期上限 ${maxQty}`, 'success');
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPurchaseModule,
    loadPurchaseOrders,
    loadCategoriesFromStorage,
    renderCategoryList,
    getConsumptionStandard,
    checkOverLimit,
    loadConsumptionStandards,
    consumptionStandards
  };
}
