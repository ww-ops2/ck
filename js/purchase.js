/**
 * 采购单管理模块 - 处理采购单的创建、导入和流程管理
 */

// 采购单数据存储
let purchaseOrders = [];
let currentImportStep = 1;
let importData = [];

// 类别和品牌型号历史数据
let categories = [];  // [{code: 'SKU', name: '饮品', remark: ''}]
let brandHistory = {};  // {物品名称: [品牌列表]}
let modelHistory = {};  // {物品名称: [型号列表]}
let categoryCodeCounters = {};  // {类别编码: 计数器} 用于每个类别独立计数

/**
 * 初始化采购单模块
 */
function initPurchaseModule() {
  console.log('=== initPurchaseModule 被调用 ===');
  
  // 绑定新建采购单按钮
  const createBtn = document.getElementById('create-purchase-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => openNewPurchaseModal());
  }

  // 绑定导入按钮
  const importBtn = document.getElementById('import-purchase-btn');
  if (importBtn) {
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
function openNewPurchaseModal() {
  const modal = document.getElementById('modal-purchase');
  if (!modal) return;

  // 清空表单
  const form = modal.querySelector('#purchase-form');
  if (form) {
    form.reset();
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    form.querySelector('[name="purchase_date"]').value = today;
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
    background: linear-gradient(145deg, #ffffff, #f8f9fa);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8);
    border: 1px solid var(--border);
  `;
  
  groupDiv.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="flex:1;">
        <label style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;display:block;">供应商名称 *</label>
        <input type="text" class="supplier-name-input" placeholder="请输入供应商名称" required 
          style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
      </div>
      <button type="button" onclick="removeSupplierGroup('${groupId}')" title="删除此供应商及所有商品" 
        style="margin-left:12px;padding:6px 12px;color:var(--danger);background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:14px;transition:all 0.2s;">
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
                style="padding:8px 20px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(64,158,255,0.3);">+ 添加物品</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background:rgba(64,158,255,0.05);font-weight:600;">
            <td colspan="7" style="text-align:right;">小计：</td>
            <td class="group-subtotal">0.00</td>
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
          <input type="text" class="item-category" placeholder="选择或输入类别" list="category-list-${tempId}" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
          <datalist id="category-list-${tempId}">
            ${getCategoryOptionsForDatalist()}
          </datalist>
          <button type="button" class="btn btn-sm" onclick="openCategoryModal(event)" title="新增类别" style="padding:6px 10px;font-weight:bold;color:var(--accent);">+</button>
        </div>
      </div>
    </td>
    <td><input type="text" class="item-name" placeholder="物品名称" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);"></td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-brand" placeholder="品牌" list="brand-list-${tempId}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
        <datalist id="brand-list-${tempId}"></datalist>
      </div>
    </td>
    <td>
      <div style="position:relative;">
        <input type="text" class="item-model" placeholder="型号" list="model-list-${tempId}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);">
        <datalist id="model-list-${tempId}"></datalist>
      </div>
    </td>
    <td><input type="number" class="item-quantity" placeholder="数量" min="1" required style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);" onchange="calculateRowAmount(this)"></td>
    <td><input type="text" class="item-unit" placeholder="单位" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);"></td>
    <td><input type="number" class="item-price" placeholder="单价" min="0" step="0.01" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:linear-gradient(145deg, #ffffff, #f5f5f5);color:var(--text-primary);font-size:13px;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08);" onchange="calculateRowAmount(this)"></td>
    <td><span class="row-amount" style="font-weight:600;color:var(--accent);font-size:14px;">0.00</span></td>
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
function submitPurchaseOrder() {
  const form = document.getElementById('purchase-form');
  if (!form) return;

  // 验证必填字段
  const purchaseDate = form.querySelector('[name="purchase_date"]').value;
  const purchaser = form.querySelector('[name="purchaser"]').value;
  
  if (!purchaseDate || !purchaser) {
    alert('请填写采购日期和采购人');
    return;
  }

  // 获取所有供应商分组
  const supplierGroups = document.querySelectorAll('.supplier-group');
  if (supplierGroups.length === 0) {
    alert('请至少添加一个供应商');
    return;
  }

  // 收集所有数据
  const allItems = [];
  let hasError = false;
  
  supplierGroups.forEach(group => {
    const supplierName = group.querySelector('.supplier-name-input').value.trim();
    if (!supplierName) {
      alert('请填写所有供应商名称');
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
          alert(`物品 "${nameInput.value}" 必须选择类别`);
          hasError = true;
          return;
        }
        
        // 保存品牌型号历史
        if (brand) addBrandToHistory(nameInput.value, brand);
        if (model) addModelToHistory(nameInput.value, model);
        
        allItems.push({
          supplier: supplierName,
          category: category,
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
    alert('请至少添加一个物品');
    return;
  }
  
  // 生成采购单号
  const orderCode = generatePurchaseCode();
  
  // 计算总金额
  const totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);
  
  // 创建采购单对象
  const purchaseOrder = {
    id: Date.now(),
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

  // 保存到数据 store
  purchaseOrders.push(purchaseOrder);
  console.log('保存前采购单数量:', purchaseOrders.length);
  savePurchaseOrders();
  console.log('已保存到localStorage');

  // 关闭模态框
  closeModal();

  // 刷新列表
  console.log('即将刷新采购单列表...');
  loadPurchaseOrders();
  console.log('采购单列表刷新完成');

  // 显示成功提示
  alert(`采购单 ${orderCode} 已创建，已流转至仓库待入库`);
  
  console.log('采购单创建成功:', purchaseOrder);
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
  try {
    console.log('>>> loadPurchaseOrders 函数开始执行');
    console.log('当前页面URL:', window.location.href);
    console.log('document对象:', document);
    
    // 检查DOM元素是否存在
    const tbody = document.getElementById('purchase-tbody');
    console.log('tbody元素:', tbody);
    if (!tbody) {
      console.error('❌ 找不到 purchase-tbody 元素！');
      console.log('尝试查找所有table元素:', document.querySelectorAll('table'));
      return;
    }
    console.log('✅ 找到 purchase-tbody 元素');
  } catch (error) {
    console.error('loadPurchaseOrders 出错:', error);
    return;
  }
  
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
    
    return `
      <tr>
        <td>${order.code}</td>
        <td>${order.purchase_date}</td>
        <td>${order.purchaser}</td>
        <td>${order.items.length} 种</td>
        <td>¥${order.total_amount.toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-sm" onclick="viewPurchaseDetail(${order.id})">查看</button>
          ${order.status === 'pending_stockin' ? `<button class="btn btn-sm btn-accent" onclick="confirmStockIn(${order.id})">入库</button>` : ''}
        </td>
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
 * 查看采购单详情
 */
function viewPurchaseDetail(orderId) {
  const order = purchaseOrders.find(o => o.id === orderId);
  if (!order) return;

  let detail = `采购单号：${order.code}\n`;
  detail += `采购日期：${order.purchase_date}\n`;
  detail += `采购人：${order.purchaser}\n`;
  detail += `供应商：${order.supplier || '-'}\n`;
  detail += `总金额：¥${order.total_amount.toFixed(2)}\n`;
  detail += `状态：${getStatusText(order.status)}\n\n`;
  detail += `明细：\n`;
  
  order.items.forEach((item, index) => {
    detail += `${index + 1}. ${item.name} ${item.brand ? '(' + item.brand + ')' : ''} ${item.model ? '[' + item.model + ']' : ''}\n`;
    detail += `   数量：${item.quantity} ${item.unit}  单价：¥${item.price.toFixed(2)}  金额：¥${item.amount.toFixed(2)}\n`;
  });

  alert(detail);
}

/**
 * 确认入库（打开入库确认模态框）
 */
function confirmStockIn(orderId) {
  const order = purchaseOrders.find(o => o.id === orderId);
  if (!order) return;

  // 检查权限（只有仓库管理员可以确认入库）
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'warehouse') {
    alert('只有仓库管理员可以确认入库');
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
        <td><input type="number" class="actual-quantity" value="${item.quantity}" min="0" style="width:80px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text-primary);"></td>
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
function executeStockIn(order) {
  const stockinDate = document.getElementById('stockin-date').value;
  const batchCode = document.getElementById('stockin-batch').value;
  const remark = document.getElementById('stockin-remark').value;

  if (!stockinDate) {
    alert('请选择入库日期');
    return;
  }

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

  alert(`入库成功！批次号：${batchCode}\n已自动生成库存明细`);
  
  console.log('入库完成:', stockInRecord);
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
          alert('请先上传文件');
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
  // 创建模板数据
  const templateData = [
    ['采购日期', '采购人', '供应商', '物品名称', '品牌', '型号', '数量', '单位', '单价', '备注'],
    ['2026-06-09', '张三', 'XX供应商', '矿泉水', '农夫山泉', '550ml', '100', '瓶', '2.5', ''],
    ['2026-06-09', '张三', 'XX供应商', '方便面', '康师傅', '桶装', '50', '箱', '45.0', '']
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
      alert('文件解析失败：' + error.message);
      console.error(error);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

/**
 * 解析导入数据
 */
function parseImportData(data) {
  if (data.length < 2) {
    alert('文件中没有有效数据');
    return;
  }

  // 跳过表头
  const rows = data.slice(1);
  importData = [];
  const errors = [];

  rows.forEach((row, index) => {
    if (row.length < 6) {
      errors.push(`第${index + 2}行：数据列数不足`);
      return;
    }

    const quantity = parseFloat(row[6]) || 0;
    const price = parseFloat(row[8]) || 0;
    const amount = quantity * price;

    if (quantity <= 0) {
      errors.push(`第${index + 2}行：数量必须大于0`);
      return;
    }

    importData.push({
      row_number: index + 2,
      purchase_date: row[0] || '',
      purchaser: row[1] || '',
      supplier: row[2] || '',
      item_name: row[3] || '',
      brand: row[4] || '',
      model: row[5] || '',
      quantity: quantity,
      unit: row[7] || '',
      price: price,
      amount: amount,
      remark: row[9] || '',
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
    alert('没有可导入的数据');
    return;
  }

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

  alert(`成功导入 ${Object.keys(groups).length} 个采购单`);
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
  // 根据类别名称生成编码前缀
  let codePrefix;
  if (categoryName.includes('饮品') || categoryName.toLowerCase().includes('drink')) {
    codePrefix = 'SKU';
  } else if (categoryName.includes('食品') || categoryName.toLowerCase().includes('food')) {
    codePrefix = 'SKP';
  } else if (categoryName.includes('日用') || categoryName.toLowerCase().includes('daily')) {
    codePrefix = 'SKD';
  } else {
    // 默认使用前三个字符的大写拼音首字母或简写
    codePrefix = 'SK' + String(categories.length + 1).padStart(2, '0');
  }
  
  categories.push({
    code: codePrefix,
    name: categoryName,
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
}

/**
 * 保存新类别
 */
function saveNewCategory() {
  const name = document.getElementById('new-category-name').value.trim();
  const code = document.getElementById('new-category-code').value.trim();
  const remark = document.getElementById('new-category-remark').value.trim();
  
  if (!name) {
    alert('请输入类别名称');
    return;
  }
  
  // 检查是否已存在
  if (categories.find(c => c.name === name)) {
    alert('该类别已存在');
    return;
  }
  
  // 添加类别
  categories.push({
    code: code,
    name: name,
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
  
  alert(`类别「${name}」已创建`);
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
 * 加载类别数据
 */
function loadCategories() {
  const data = localStorage.getItem('categories');
  if (data) {
    categories = JSON.parse(data);
  }
  
  // 如果没有类别，添加默认类别
  if (categories.length === 0) {
    categories = [
      { code: 'CAT001', name: '饮品', remark: '' },
      { code: 'CAT002', name: '食品', remark: '' },
      { code: 'CAT003', name: '日用品', remark: '' },
      { code: 'CAT004', name: '办公用品', remark: '' }
    ];
    localStorage.setItem('categories', JSON.stringify(categories));
  }
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

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPurchaseModule,
    loadPurchaseOrders
  };
}
