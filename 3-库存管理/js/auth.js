/**
 * 认证模块 - 处理用户登录、登出和权限管理
 */

// 模拟用户数据库（实际项目中应连接Supabase）
const mockUsers = [
  { id: 1, username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' },
  { id: 2, username: 'purchase', password: 'purchase123', name: '采购员张三', role: 'purchase' },
  { id: 3, username: 'warehouse', password: 'warehouse123', name: '仓管李四', role: 'warehouse' },
  { id: 4, username: 'finance', password: 'finance123', name: '财务王五', role: 'finance' },
  { id: 5, username: 'staff', password: 'staff123', name: '员工赵六', role: 'staff' }
];

// 当前登录用户
let currentUser = null;

/**
 * 初始化认证模块
 */
function initAuth() {
  // 检查本地存储中是否有登录信息
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  }
  
  // 绑定登录表单
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // 绑定登出按钮
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

/**
 * 处理登录 - 角色下拉快速登录
 */
function handleLogin(e) {
  e.preventDefault();
  
  const roleSelect = document.getElementById('login-role');
  const role = roleSelect ? roleSelect.value : '';
  
  if (!role) {
    showToast('请选择一个角色', 'warning');
    return;
  }
  
  // 根据角色查找用户
  const user = mockUsers.find(u => u.role === role);
  
  if (user) {
    // 登录成功
    currentUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
    
    // 保存到本地存储
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // 显示应用
    showApp();
    
    console.log('登录成功:', currentUser);
  } else {
    showToast('未找到该角色对应的用户', 'error');
  }
}

/**
 * 处理登出
 */
function handleLogout() {
  showConfirm('确定要退出登录吗？', function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLoginPage();
  }, { confirmText: '确认退出', danger: false, icon: '🚪' });
}

/**
 * 显示应用主界面
 */
async function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  
  // 更新用户信息
  updateUserDisplay();
  
  // 根据角色显示/隐藏菜单
  updateMenuByRole();
  
  // 触发导航初始化
  if (typeof initNavigation === 'function') {
    initNavigation();
  }
  
  // 从 Supabase 同步最新数据到 localStorage（不阻塞 UI 初始化）
  if (typeof syncFromSupabase === 'function') {
    try {
      await syncFromSupabase();
      console.log('[Auth] Supabase 数据同步完成');
    } catch (e) {
      console.warn('[Auth] Supabase 同步失败，使用本地缓存:', e.message);
    }
  }
  
  // 加载仪表盘数据
  if (typeof loadDashboard === 'function') {
    loadDashboard();
  }
}

/**
 * 显示登录页面
 */
function showLoginPage() {
  document.getElementById('login-page').style.display = 'grid';
  document.getElementById('app-container').style.display = 'none';
  
  // 重置角色选择
  const roleSelect = document.getElementById('login-role');
  if (roleSelect) {
    roleSelect.value = '';
  }
}

/**
 * 更新用户信息显示
 */
function updateUserDisplay() {
  if (!currentUser) return;
  
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = getRoleName(currentUser.role);
  
  // 设置头像emoji
  const roleEmojis = {
    admin: '👑',
    purchase: '🛒',
    warehouse: '📦',
    finance: '💰',
    staff: '👤'
  };
  document.getElementById('user-avatar').textContent = roleEmojis[currentUser.role] || '👤';
}

/**
 * 根据角色更新菜单显示
 * 采购：采购单录入+编辑+流程推送
 * 仓库：采购入库+差异调整+出库确认
 * 财务：查看权限
 * 其他角色：领用出库申请
 * 管理员：所有权限
 */
function updateMenuByRole() {
  if (!currentUser) return;

  const role = currentUser.role;

  // 各角色可见的菜单模块
  const roleMenuAccess = {
    admin: ['dashboard', 'inventory', 'categories', 'purchase', 'stock-in', 'requisition', 'stock-out', 'reports', 'analytics', 'history', 'admin-users', 'admin-roles', 'admin-settings'],
    purchase: ['dashboard', 'inventory', 'categories', 'purchase', 'reports', 'analytics'],
    warehouse: ['dashboard', 'inventory', 'categories', 'stock-in', 'stock-out', 'reports', 'analytics'],
    finance: ['dashboard', 'inventory', 'categories', 'purchase', 'stock-in', 'requisition', 'stock-out', 'reports', 'analytics', 'history'],
    staff: ['dashboard', 'inventory', 'requisition', 'stock-out']
  };

  const accessibleModules = roleMenuAccess[role] || roleMenuAccess['staff'];

  // 隐藏不可见的导航项
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const module = item.dataset.module;
    if (module && !accessibleModules.includes(module)) {
      item.style.display = 'none';
    } else {
      item.style.display = 'flex';
    }
  });

  // 管理员专属区域
  const adminSections = document.querySelectorAll('.admin-only');
  adminSections.forEach(section => {
    section.style.display = role === 'admin' ? 'block' : 'none';
  });

  // 保存权限到全局变量供其他模块使用
  window.currentRolePermissions = getPermissionsForRole(role);
}

/**
 * 统一权限矩阵
 * admin 拥有所有权限；其他角色按需分配
 */
function getPermissionsForRole(role) {
  var permissions = {
    admin: [
      'create_purchase', 'edit_purchase', 'view_purchase', 'delete_purchase',
      'confirm_stockin', 'confirm_stockout',
      'create_requisition', 'edit_requisition', 'withdraw_requisition', 'delete_requisition',
      'manage_inventory', 'adjust_stock', 'edit_inventory',
      'manage_categories',
      'view_inventory', 'export_reports', 'admin_settings'
    ],
    purchase: [
      'create_purchase', 'edit_purchase', 'view_purchase',
      'view_inventory', 'manage_categories'
    ],
    warehouse: [
      'view_purchase', 'confirm_stockin',
      'confirm_stockout', 'adjust_stock',
      'manage_inventory', 'view_inventory'
    ],
    finance: [
      'view_purchase', 'view_inventory', 'export_reports'
    ],
    staff: [
      'create_requisition', 'edit_requisition', 'view_inventory'
    ]
  };
  return permissions[role] || permissions['staff'];
}

/**
 * 检查角色是否有某权限（统一入口）
 */
function roleHasPermission(role, permission) {
  if (role === 'admin') return true;
  var perms = getPermissionsForRole(role);
  return perms.includes(permission);
}

/**
 * 获取角色中文名
 */
function getRoleName(role) {
  const roleNames = {
    admin: '管理员',
    purchase: '采购员',
    warehouse: '仓库管理员',
    finance: '财务',
    staff: '员工'
  };
  return roleNames[role] || '未知角色';
}

/**
 * 检查当前用户是否有指定权限（支持 role/user 覆盖，localStorage 可配置）
 */
function hasPermission(permission) {
  if (!currentUser) return false;
  // 管理员拥有所有权限
  if (currentUser.role === 'admin') return true;

  // 基于角色的默认权限（兼容旧逻辑）
  var defaultPerms = getPermissionsForRole(currentUser.role || 'staff');

  // 从 localStorage 中读取可配置覆盖（键：rolePermissions, userPermissions）
  var rolePermStore = {};
  var userPermStore = {};
  try { rolePermStore = JSON.parse(localStorage.getItem('rolePermissions') || '{}'); } catch(e) { rolePermStore = {}; }
  try { userPermStore = JSON.parse(localStorage.getItem('userPermissions') || '{}'); } catch(e) { userPermStore = {}; }
n  var perms = Array.isArray(defaultPerms) ? defaultPerms.slice() : [];
  if (rolePermStore[currentUser.role] && Array.isArray(rolePermStore[currentUser.role])) {
    perms = Array.from(new Set(perms.concat(rolePermStore[currentUser.role])));
  }
  if (userPermStore[currentUser.id] && Array.isArray(userPermStore[currentUser.id])) {
    perms = Array.from(new Set(perms.concat(userPermStore[currentUser.id])));
  }
n  return perms.includes('all') || perms.includes(permission);
}

/**
 * 设置/保存角色权限到 localStorage
 */
function setRolePermissions(role, perms) {
  try {
    var store = JSON.parse(localStorage.getItem('rolePermissions') || '{}');
    store[role] = perms;
    localStorage.setItem('rolePermissions', JSON.stringify(store));
    return true;
  } catch(e) { return false; }
}

/**
 * 设置/保存用户权限到 localStorage
 */
function setUserPermissions(userId, perms) {
  try {
    var store = JSON.parse(localStorage.getItem('userPermissions') || '{}');
    store[userId] = perms;
    localStorage.setItem('userPermissions', JSON.stringify(store));
    return true;
  } catch(e) { return false; }
}

/**
 * 获取当前用户信息
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * 检查是否已登录
 */
function isLoggedIn() {
  return currentUser !== null;
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initAuth,
    getCurrentUser,
    isLoggedIn,
    hasPermission,
    roleHasPermission,
    getPermissionsForRole
  };
}
