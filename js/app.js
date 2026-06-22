/**
 * 主应用逻辑 - 初始化应用、加载数据、处理交互
 */

// 模拟数据（实际项目中应从Supabase获取）
const mockData = {
  items: [
    { id: 1, code: 'ITEM001', name: '矿泉水', category: '饮品', stock: 500, unit: '瓶', safety_stock: 100 },
    { id: 2, code: 'ITEM002', name: '方便面', category: '食品', stock: 200, unit: '箱', safety_stock: 50 },
    { id: 3, code: 'ITEM003', name: '纸巾', category: '日用品', stock: 80, unit: '包', safety_stock: 100 }
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
  
  // 初始化认证模块
  initAuth();
  
  // 绑定模态框关闭事件
  bindModalEvents();
  
  // 设置默认月份
  setDefaultMonth();
  
  // 初始化各模块
  if (typeof initPurchaseModule === 'function') {
    initPurchaseModule();
  }
  if (typeof initStockInModule === 'function') {
    initStockInModule();
  }
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
}

/**
 * 更新KPI卡片
 */
function updateKPICards() {
  document.getElementById('kpi-total-items').textContent = mockData.items.length;
  document.getElementById('kpi-month-in').textContent = '0';
  document.getElementById('kpi-month-out').textContent = '0';
  document.getElementById('kpi-pending-purchase').textContent = '0';
  document.getElementById('kpi-pending-stockin').textContent = '0';
  document.getElementById('kpi-low-stock').textContent = countLowStock();
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
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: '出库',
          data: outData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.1)',
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
          labels: { color: '#94a3b8' }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e3a5f' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: '#1e3a5f' },
          ticks: { color: '#94a3b8' }
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
          '#6366f1',
          '#10b981',
          '#f59e0b',
          '#ef4444',
          '#8b5cf6',
          '#3b82f6'
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
          labels: { color: '#94a3b8' }
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
 * 加载库存列表
 */
function loadInventory() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;
  
  if (mockData.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无数据</td></tr>';
    return;
  }
  
  tbody.innerHTML = mockData.items.map(item => {
    const status = getStockStatus(item);
    return `
      <tr>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.stock}</td>
        <td>${item.unit}</td>
        <td>${item.safety_stock}</td>
        <td><span class="status-badge ${status.class}">${status.text}</span></td>
        <td>${new Date().toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm" onclick="editItem(${item.id})">编辑</button>
        </td>
      </tr>
    `;
  }).join('');
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
 */
function loadPurchaseOrders() {
  const tbody = document.getElementById('purchase-tbody');
  if (!tbody) return;
  
  if (mockData.purchaseOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无采购单</td></tr>';
  }
}

/**
 * 加载入库记录
 */
function loadStockInRecords() {
  const tbody = document.getElementById('stockin-tbody');
  if (!tbody) return;
  
  if (mockData.stockInRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无入库记录</td></tr>';
  }
}

/**
 * 加载领用单列表
 */
function loadRequisitions() {
  const tbody = document.getElementById('requisition-tbody');
  if (!tbody) return;
  
  if (mockData.requisitions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无领用单</td></tr>';
  }
}

/**
 * 加载出库记录
 */
function loadStockOutRecords() {
  const tbody = document.getElementById('stockout-tbody');
  if (!tbody) return;
  
  if (mockData.stockOutRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无出库记录</td></tr>';
  }
}

/**
 * 加载报表数据
 */
function loadReports() {
  // 实现报表加载逻辑
}

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
 * 编辑物品（占位函数）
 */
function editItem(itemId) {
  console.log('编辑物品:', itemId);
  alert('编辑功能待实现');
}
