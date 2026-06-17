/**
 * 认证模块（修复版）- 处理用户登录、登出和权限管理
 * 说明：保持原有行为，清理语法问题；长期应迁移到 Supabase auth 与用户表。
 */

// 模拟用户数据库（实际项目中应连接Supabase）
const mockUsers = [
  { id: 1, username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' },
  { id: 2, username: 'purchase', password: 'purchase123', name: '采购员张三', role: 'purchase' },
  { id: 3, username: 'warehouse', password: 'warehouse123', name: '仓管李四', role: 'warehouse' },
  { id: 4, username: 'finance', password: 'finance123', name: '财务王五', role: 'finance' },
  { id: 5, username: 'staff', password: 'staff123', name: '员工赵六', role: 'staff' }
];

let currentUser = null;

function initAuth() {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    try { currentUser = JSON.parse(savedUser); } catch(e) { currentUser = null; }
    if (currentUser) showApp();
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

function handleLogin(e) {
  e.preventDefault();
  const roleSelect = document.getElementById('login-role');
  const role = roleSelect ? roleSelect.value : '';
  if (!role) { showToast('请选择一个角色', 'warning'); return; }

  const user = mockUsers.find(u => u.role === role);
  if (user) {
    currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch(e) {}
    showApp();
    console.log('登录成功:', currentUser);
  } else {
    showToast('未找到该角色对应的用户', 'error');
  }
}

function handleLogout() {
  showConfirm('确定要退出登录吗？', function() {
    currentUser = null;
    try { localStorage.removeItem('currentUser'); } catch(e) {}
    showLoginPage();
  });
}

async function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  updateUserDisplay();
  updateMenuByRole();
  if (typeof initNavigation === 'function') initNavigation();
  if (typeof syncFromSupabase === 'function') {
    try { await syncFromSupabase(); console.log('[Auth] Supabase 数据同步完成'); } catch(e) { console.warn('[Auth] Supabase 同步失败，使用本地缓存:', e.message); }
  }
  if (typeof loadDashboard === 'function') loadDashboard();
}

function showLoginPage() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  const roleSelect = document.getElementById('login-role'); if (roleSelect) roleSelect.value = '';
}

function updateUserDisplay() {
  if (!currentUser) return;
  document.getElementById('user-name').textContent = currentUser.name || '';
  document.getElementById('user-role').textContent = getRoleName(currentUser.role);
  const roleEmojis = { admin: '👑', purchase: '🛒', warehouse: '📦', finance: '💰', staff: '👤' };
  const avatar = document.getElementById('user-avatar'); if (avatar) avatar.textContent = roleEmojis[currentUser.role] || '👤';
}

function updateMenuByRole() {
  if (!currentUser) return;
  const role = currentUser.role;
  const roleMenuAccess = {
    admin: ['dashboard','inventory','categories','purchase','stock-in','requisition','stock-out','reports','analytics','history','admin-users','admin-roles','admin-settings'],
    purchase: ['dashboard','inventory','categories','purchase','reports','analytics'],
    warehouse: ['dashboard','inventory','categories','stock-in','stock-out','reports','analytics'],
    finance: ['dashboard','inventory','categories','purchase','stock-in','requisition','stock-out','reports','analytics','history'],
    staff: ['dashboard','inventory','requisition','stock-out']
  };
  const accessibleModules = roleMenuAccess[role] || roleMenuAccess['staff'];
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => { const module = item.dataset.module; if (module && !accessibleModules.includes(module)) item.style.display = 'none'; else item.style.display = 'flex'; });
  const adminSections = document.querySelectorAll('.admin-only'); adminSections.forEach(s => { s.style.display = role === 'admin' ? 'block' : 'none'; });
  window.currentRolePermissions = getPermissionsForRole(role);
}

function getPermissionsForRole(role) {
  var permissions = {
    admin: ['create_purchase','edit_purchase','view_purchase','delete_purchase','confirm_stockin','confirm_stockout','create_requisition','edit_requisition','withdraw_requisition','delete_requisition','manage_inventory','adjust_stock','edit_inventory','manage_categories','view_inventory','export_reports','admin_settings'],
    purchase: ['create_purchase','edit_purchase','view_purchase','view_inventory','manage_categories'],
    warehouse: ['view_purchase','confirm_stockin','confirm_stockout','adjust_stock','manage_inventory','view_inventory'],
    finance: ['view_purchase','view_inventory','export_reports'],
    staff: ['create_requisition','edit_requisition','view_inventory']
  };
  return permissions[role] || permissions['staff'];
}

function roleHasPermission(role, permission) {
  if (role === 'admin') return true;
  var perms = getPermissionsForRole(role);
  return perms.includes(permission);
}

function hasPermission(permission) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  var defaultPerms = getPermissionsForRole(currentUser.role || 'staff');
  var rolePermStore = {};
  var userPermStore = {};
  try { rolePermStore = JSON.parse(localStorage.getItem('rolePermissions') || '{}'); } catch(e) { rolePermStore = {}; }
  try { userPermStore = JSON.parse(localStorage.getItem('userPermissions') || '{}'); } catch(e) { userPermStore = {}; }
  var perms = Array.isArray(defaultPerms) ? defaultPerms.slice() : [];
  if (rolePermStore[currentUser.role] && Array.isArray(rolePermStore[currentUser.role])) perms = Array.from(new Set(perms.concat(rolePermStore[currentUser.role])));
  if (userPermStore[currentUser.id] && Array.isArray(userPermStore[currentUser.id])) perms = Array.from(new Set(perms.concat(userPermStore[currentUser.id])));
  return perms.includes('all') || perms.includes(permission);
}

function setRolePermissions(role, perms) {
  try { var store = JSON.parse(localStorage.getItem('rolePermissions') || '{}'); store[role] = perms; localStorage.setItem('rolePermissions', JSON.stringify(store)); return true; } catch(e) { return false; }
}

function setUserPermissions(userId, perms) {
  try { var store = JSON.parse(localStorage.getItem('userPermissions') || '{}'); store[userId] = perms; localStorage.setItem('userPermissions', JSON.stringify(store)); return true; } catch(e) { return false; }
}

function getCurrentUser() { return currentUser; }
function isLoggedIn() { return currentUser !== null; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initAuth, getCurrentUser, isLoggedIn, hasPermission, roleHasPermission, getPermissionsForRole };
}
