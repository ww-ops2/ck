/**
 * 导航模块 - 处理页面切换和菜单交互
 */

// 当前激活的模块
let currentModule = 'dashboard';

/**
 * 初始化导航
 */
function initNavigation() {
  // 绑定导航项点击事件
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const module = item.dataset.module;
      if (module) {
        switchModule(module);
      }
    });
  });
  
  // 绑定刷新按钮
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  // 启动自动同频（定时增量同步 + 标签页聚焦即时同步）
  startAutoSync();
}

// ============================================================
// 自动同频：解决多用户场景下「A 改了 B 还看旧数据」
// 做法：每 30s（页面可见且有用户登录时）只增量同步当前模块所需表；
//       标签页重新聚焦时立即同步一次。每次只动 1~4 张表，远轻于全量同步。
// ============================================================
let _autoSyncTimer = null;
const AUTO_SYNC_INTERVAL = 30000; // 30 秒

// 整表重渲染时保留库存列表滚动位置，避免轮询重绘导致跳到顶部
function _autoRenderModule(module) {
  let scEl = null, scTop = 0;
  if (module === 'inventory') {
    scEl = document.getElementById('inv-board-new');
    if (scEl) scTop = scEl.scrollTop;
  }
  if (typeof loadModuleData === 'function') loadModuleData(module);
  if (scEl) { try { scEl.scrollTop = scTop; } catch (e) {} }
}

function _runAutoSyncOnce() {
  if (document.visibilityState !== 'visible') return;
  if (typeof isSupabaseReady === 'function' && !isSupabaseReady()) return;
  if (typeof currentUser === 'undefined' || !currentUser) return;
  // 用户正在编辑/弹窗时跳过整表重渲染，避免打断
  const modalOpen = document.querySelector('.modal-overlay');
  if (modalOpen && modalOpen.offsetParent !== null) return;
  if (typeof _invHybrid !== 'undefined' && _invHybrid && _invHybrid.supplementMode) return;
  try {
    if (typeof syncModuleTables === 'function') syncModuleTables(currentModule);
    _autoRenderModule(currentModule);
  } catch (e) {
    console.warn('[AutoSync] 同步异常:', e.message);
  }
}

function startAutoSync() {
  if (_autoSyncTimer) return; // 防止重复启动
  console.log('[AutoSync] 启动，间隔 ' + (AUTO_SYNC_INTERVAL / 1000) + 's');

  _autoSyncTimer = setInterval(function () {
    _runAutoSyncOnce();
  }, AUTO_SYNC_INTERVAL);

  // 标签页重新获得焦点时立即同步一次（B 切回页面即可看到 A 的修改）
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      _runAutoSyncOnce();
    }
  });
}

/**
 * 切换到指定模块
 */
function switchModule(moduleName) {
  // 更新导航项激活状态
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.dataset.module === moduleName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // 隐藏所有模块面板
  const panes = document.querySelectorAll('.module-pane');
  panes.forEach(pane => {
    pane.classList.remove('active');
  });
  
  // 显示目标模块面板
  const targetPane = document.getElementById(`module-${moduleName}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }
  
  // 更新页面标题
  updatePageTitle(moduleName);
  
  // 记录当前模块
  currentModule = moduleName;
  
  // 触发模块加载
  loadModuleData(moduleName);
}

/**
 * 更新页面标题
 */
function updatePageTitle(moduleName) {
  const titles = {
    'dashboard': '仪表盘',
    'inventory': '库存概览',
    'categories': '品类管理',
    'purchase': '采购单管理',
    'stock-in': '入库管理',
    'requisition': '领用单管理',
    'stock-out': '出库管理',
    'monthly-summary': '月度汇总',
    'reports': '团期使用报表',
    'analytics': '数据分析',
    'history': '操作记录',
    'admin-users': '账号管理',
    'admin-roles': '角色权限',
    'admin-settings': '系统设置'
  };
  
  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    titleEl.textContent = titles[moduleName] || '未知模块';
  }
}

/**
 * 加载模块数据
 */
function loadModuleData(moduleName) {
  console.log('加载模块数据:', moduleName);
  
  switch (moduleName) {
    case 'dashboard':
      if (typeof loadDashboard === 'function') {
        loadDashboard();
      }
      break;
    case 'inventory':
      // 模块切换时重放一次入场动画；自动同步(loadModuleData)不置位 → 不重放，避免闪烁
      window.__invForceAnim = true;
      if (typeof initInventoryHybrid === 'function') {
        initInventoryHybrid();
      } else if (typeof loadInventory === 'function') {
        loadInventory();
      }
      break;
    case 'categories':
      if (typeof renderCategoryList === 'function') {
        renderCategoryList();
      }
      break;
    case 'purchase':
      if (typeof loadPurchaseOrders === 'function') {
        loadPurchaseOrders();
      }
      if (typeof _bfUpdatePurchaseKPI === 'function') _bfUpdatePurchaseKPI();
      break;
    case 'stock-in':
      if (typeof loadHybridStockInData === 'function') {
        loadHybridStockInData();
      } else if (typeof loadStockInRecords === 'function') {
        loadStockInRecords();
      }
      if (typeof _bfUpdateStockInKPI === 'function') _bfUpdateStockInKPI();
      break;
    case 'requisition':
      if (typeof loadRequisitions === 'function') {
        loadRequisitions();
      }
      if (typeof _bfUpdateRequisitionKPI === 'function') _bfUpdateRequisitionKPI();
      break;
    case 'stock-out':
      if (typeof loadStockOutRecords === 'function') {
        loadStockOutRecords();
      }
      if (typeof loadRequisitions === 'function') {
        loadRequisitions();
      }
      if (typeof _bfUpdateStockOutKPI === 'function') _bfUpdateStockOutKPI();
      break;
    case 'monthly-summary':
      if (typeof loadMonthlySummary === 'function') {
        loadMonthlySummary();
      }
      break;
    case 'reports':
      if (typeof loadReports === 'function') {
        loadReports();
      }
      break;
    case 'admin-users':
      if (typeof loadUserList === 'function') {
        loadUserList();
      }
      break;
    case 'history':
      if (typeof loadAuditLogs === 'function') {
        loadAuditLogs();
      }
      break;
    default:
      break;
  }
}

/**
 * 处理刷新 — 强制从 Supabase 拉取最新数据后重新渲染
 */
async function handleRefresh() {
  console.log('刷新当前模块:', currentModule);

  // 从 Supabase 拉取最新数据
  if (typeof syncFromSupabase === 'function') {
    try {
      await syncFromSupabase({ force: true });
    } catch (e) {
      console.warn('[Refresh] Supabase 同步失败:', e.message);
    }
  }

  // 重新加载当前模块数据
  loadModuleData(currentModule);

  // 显示刷新提示
  if (typeof showToast === 'function') {
    showToast('数据已刷新', 'success');
  }
}

/**
 * 显示通知
 */
function showNotification(message, type = 'info') {
  // 简单的alert实现，后续可以改为更优雅的通知组件
  console.log(`[${type}] ${message}`);
}

/**
 * 获取当前模块
 */
function getCurrentModule() {
  return currentModule;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initNavigation,
    switchModule,
    getCurrentModule
  };
}
