/**
 * 认证模块 - 处理用户登录、登出和权限管理
 */

// 模拟用户数据库（实际项目中应连接Supabase）
const mockUsers = [
  { id: 1, username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' },
  { id: 2, username: 'purchase', password: 'purchase123', name: '采购员张三', role: 'purchase' },
  { id: 3, username: 'warehouse', password: 'warehouse123', name: '仓管李四', role: 'warehouse' },
  { id: 4, username: 'finance', password: 'finance123', name: '财务王五', role: 'finance' }
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
 * 处理登录
 */
function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  
  if (!username || !password) {
    alert('请输入用户名和密码');
    return;
  }
  
  // 查找用户（实际项目中应调用Supabase Auth API）
  const user = mockUsers.find(u => u.username === username && u.password === password);
  
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
    alert('用户名或密码错误');
  }
}

/**
 * 处理登出
 */
function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLoginPage();
  }
}

/**
 * 显示应用主界面
 */
function showApp() {
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
  
  // 加载仪表盘数据
  if (typeof loadDashboard === 'function') {
    loadDashboard();
  }
}

/**
 * 显示登录页面
 */
function showLoginPage() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  
  // 清空登录表单
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
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
    finance: '💰'
  };
  document.getElementById('user-avatar').textContent = roleEmojis[currentUser.role] || '👤';
}

/**
 * 根据角色更新菜单显示
 */
function updateMenuByRole() {
  const adminSections = document.querySelectorAll('.admin-only');
  
  // 只有管理员可以看到后台管理模块
  if (currentUser && currentUser.role === 'admin') {
    adminSections.forEach(section => {
      section.style.display = 'block';
    });
  } else {
    adminSections.forEach(section => {
      section.style.display = 'none';
    });
  }
  
  // 根据不同角色可以进一步控制菜单项的显示
  // 例如：采购员不能看到出库管理等
}

/**
 * 获取角色中文名
 */
function getRoleName(role) {
  const roleNames = {
    admin: '管理员',
    purchase: '采购员',
    warehouse: '仓库管理员',
    finance: '财务'
  };
  return roleNames[role] || '未知角色';
}

/**
 * 检查当前用户是否有指定权限
 */
function hasPermission(permission) {
  if (!currentUser) return false;
  
  const permissions = {
    admin: ['all'],
    purchase: ['create_purchase', 'view_inventory'],
    warehouse: ['confirm_stockin', 'confirm_stockout', 'manage_inventory'],
    finance: ['view_all', 'export_reports']
  };
  
  const userPerms = permissions[currentUser.role] || [];
  return userPerms.includes('all') || userPerms.includes(permission);
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
    hasPermission
  };
}
