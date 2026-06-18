/**
 * 认证模块 v2.0
 * - 管理员：用户名 admin，密码 ww
 * - 普通用户：通过手机号注册，管理员审核后激活
 */

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'ww';

let currentUserFallback = null;

// 全局 currentUser 别名
Object.defineProperty(window, 'currentUser', {
  get() { return currentUserFallback; },
  set(v) { currentUserFallback = v; },
  configurable: true,
  enumerable: true
});

function initAuth() {
  // 恢复已登录用户
  try {
    const s = localStorage.getItem('currentUser');
    if (s) currentUserFallback = JSON.parse(s);
  } catch (e) { currentUserFallback = null; }

  // 绑定登录表单
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // 手机号输入 → 管理员时显示密码框
  const phoneInput = document.getElementById('login-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function() {
      const pwdGroup = document.getElementById('login-password-group');
      if (pwdGroup) {
        const isAdmin = (this.value.trim() === ADMIN_USERNAME);
        pwdGroup.style.display = isAdmin ? 'block' : 'none';
        if (!isAdmin) document.getElementById('login-password').value = '';
      }
    });
  }

  // 注册链接
  const regBtn = document.getElementById('register-btn');
  if (regBtn) regBtn.addEventListener('click', openRegisterModal);

  // 已有登录会话
  if (currentUserFallback) {
    showApp();
  } else {
    showLoginPage();
  }
}

/** 登录处理 */
async function handleLogin(e) {
  if (e) e.preventDefault();
  const phone = document.getElementById('login-phone').value.trim();
  if (!phone) { showToast('请输入手机号码/账号', 'warning'); return; }

  if (phone === ADMIN_USERNAME) {
    const password = document.getElementById('login-password').value;
    if (password !== ADMIN_PASSWORD) {
      showToast('管理员密码错误', 'error');
      return;
    }
    currentUserFallback = { id: 'admin', username: 'admin', name: '系统管理员', role: 'admin', status: 'active' };
    localStorage.setItem('currentUser', JSON.stringify(currentUserFallback));
    showApp();
    return;
  }

  // 普通用户登录 — 优先从 SupaDB 获取，然后 _appCache，最后 localStorage 兜底
  let users = [];
  let user = null;

  // 1. 尝试 SupaDB.getUsers()
  try {
    if (typeof SupaDB !== 'undefined' && SupaDB.getUsers) {
      const cloudUsers = await SupaDB.getUsers();
      if (cloudUsers && cloudUsers.length > 0) {
        users = cloudUsers;
      }
    }
  } catch (e) {
    console.warn('[Auth] SupaDB.getUsers() failed:', e.message);
  }

  // 2. 如果 SupaDB 未返回数据，尝试 _appCache.users
  if (users.length === 0 && typeof _appCache !== 'undefined' && _appCache.users && _appCache.users.length > 0) {
    users = _appCache.users;
  }

  // 3. 最后兜底到 localStorage
  if (users.length === 0) {
    users = JSON.parse(localStorage.getItem('users') || '[]');
  }

  user = users.find(u => u.username === phone);

  if (!user) {
    showToast('该账号未注册，请先注册', 'warning');
    return;
  }
  if (user.status !== 'active') {
    showToast('您的账号正在等待管理员审核，请稍后再试', 'warning');
    return;
  }
  currentUserFallback = {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    role: user.role || 'staff',
    status: 'active'
  };
  localStorage.setItem('currentUser', JSON.stringify(currentUserFallback));
  showApp();
}

/** 打开注册弹窗 */
function openRegisterModal() {
  const modal = document.getElementById('modal-register');
  if (!modal) { showToast('注册功能暂不可用', 'error'); return; }
  const form = document.getElementById('register-form');
  if (form) form.reset();
  openModal('modal-register');

  // 绑定提交按钮（移除旧事件）
  const saveBtn = document.getElementById('register-submit-btn');
  if (!saveBtn) return;
  const newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', submitRegistration);
}

/** 提交注册 */
function submitRegistration() {
  const phone = document.getElementById('reg-phone').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const role = document.getElementById('reg-role').value;
  let description = document.getElementById('reg-description').value.trim();

  if (!phone) { showToast('请输入手机号码', 'warning'); return; }
  if (phone.length < 5) { showToast('请输入有效的手机号码', 'warning'); return; }
  if (!name) { showToast('请输入姓名', 'warning'); return; }
  if (!role) { showToast('请选择角色', 'warning'); return; }
  if (!description) description = '';

  // 检查重复（localStorage）
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  if (users.find(u => u.username === phone)) {
    showToast('该手机号已注册', 'warning');
    return;
  }
  if (phone === ADMIN_USERNAME) {
    showToast('该账号为系统保留账号', 'warning');
    return;
  }

  const newUser = {
    id: Date.now(),
    username: phone,
    name: name,
    role: role,
    description: description,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  // 1. 更新 _appCache 缓存
  if (typeof _appCache !== 'undefined') {
    if (!_appCache.users) _appCache.users = [];
    _appCache.users.push(newUser);
  }

  // 2. 写入 SupaDB 作为主要存储
  if (typeof SupaDB !== 'undefined' && SupaDB.createUser) {
    SupaDB.createUser(newUser).catch(function(e) {
      console.warn('[Auth] SupaDB.createUser() failed:', e.message);
    });
  }

  closeModal();
  checkNotifications();
  showToast('注册成功！请等待管理员审核授权', 'success');
}

function handleLogout() {
  const doLogout = function() {
    currentUserFallback = null;
    localStorage.removeItem('currentUser');
    showLoginPage();
  };
  if (typeof showConfirm === 'function') {
    showConfirm('确定要退出登录吗？', doLogout);
  } else {
    doLogout();
  }
}

async function showApp() {
  const lp = document.getElementById('login-page');
  const ac = document.getElementById('app-container');
  if (lp) lp.style.display = 'none';
  if (ac) ac.style.display = 'flex';
  updateUserDisplay();
  updateMenuByRole();
  checkNotifications();
  if (typeof initNavigation === 'function') initNavigation();

  // 等待 Supabase 数据同步完成（最多 6 秒），参考 V3 数据看板模式
  if (typeof syncFromSupabase === 'function') {
    try {
      await Promise.race([
        syncFromSupabase(),
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error('Sync timeout 6s')); }, 6000); })
      ]);
      console.log('[Auth] Supabase 数据同步完成');
    } catch(e) {
      console.warn('[Auth] Supabase 同步超时或失败，使用本地缓存:', e.message);
    }
  }

  if (typeof loadDashboard === 'function') loadDashboard();
}

function showLoginPage() {
  const lp = document.getElementById('login-page');
  const ac = document.getElementById('app-container');
  if (lp) lp.style.display = 'grid';
  if (ac) ac.style.display = 'none';
  const phoneInput = document.getElementById('login-phone');
  if (phoneInput) phoneInput.value = '';
  const pwdGroup = document.getElementById('login-password-group');
  if (pwdGroup) { pwdGroup.style.display = 'none'; document.getElementById('login-password').value = ''; }
}

function updateUserDisplay() {
  const u = currentUserFallback;
  if (!u) return;
  const nameEl = document.getElementById('user-name'); if (nameEl) nameEl.textContent = u.name;
  const roleEl = document.getElementById('user-role'); if (roleEl) roleEl.textContent = (getRoleName(u.role) || u.role);
  // Avatar: keep default SVG, no emoji replacement
}

function getRoleName(role) {
  const names = { admin:'管理员', purchase:'采购员', warehouse:'仓库管理员', finance:'财务', staff:'员工' };
  return names[role] || role;
}

function getPermissionsForRole(role) {
  const permissions = {
    admin: ['all'],
    purchase: ['create_purchase','view_inventory','supplement_info'],
    warehouse: ['confirm_stockin','confirm_stockout','adjust_stock','view_inventory','supplement_info'],
    finance: ['view_purchase','view_inventory'],
    staff: ['view_inventory','create_requisition']
  };
  return permissions[role] || permissions['staff'];
}

function hasPermission(permission) {
  if (!currentUserFallback) return false;
  if (currentUserFallback.role === 'admin') return true;
  const perms = getPermissionsForRole(currentUserFallback.role || 'staff');
  return perms.includes(permission) || perms.includes('all');
}

function getCurrentUser() { return currentUserFallback; }
function isLoggedIn() { return currentUserFallback !== null; }

/**
 * 检查待审核注册用户数量，更新通知铃铛
 */
function checkNotifications() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  try {
    // 优先使用 _appCache.users，然后 localStorage 兜底
    let users = [];
    if (typeof _appCache !== 'undefined' && _appCache.users && _appCache.users.length > 0) {
      users = _appCache.users;
    } else {
      users = JSON.parse(localStorage.getItem('users') || '[]');
    }
    const pendingCount = users.filter(u => u.status === 'pending').length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) { badge.style.display = 'none'; }
}

// 通知铃铛点击 → 管理员跳转到账号管理
document.addEventListener('DOMContentLoaded', function() {
  const notifBtn = document.getElementById('notification-btn');
  if (notifBtn) {
    notifBtn.addEventListener('click', function() {
      if (typeof switchModule === 'function' && currentUserFallback && currentUserFallback.role === 'admin') {
        switchModule('admin-users');
      } else {
        showToast('暂无新通知', 'info');
      }
    });
  }
});

// 导出
window.initAuth = initAuth;
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
window.hasPermission = hasPermission;
window.getPermissionsForRole = getPermissionsForRole;
window.handleLogin = handleLogin;
window.showApp = showApp;
window.showLoginPage = showLoginPage;
window.updateUserDisplay = updateUserDisplay;
window.updateMenuByRole = function(){
  try {
    const u = currentUserFallback; if (!u) return;
    const roleMenuAccess = {
      admin: ['dashboard','inventory','categories','purchase','stock-in','requisition','stock-out','reports','analytics','history','admin-users','admin-roles','admin-settings'],
      purchase: ['dashboard','inventory','categories','purchase','reports','analytics'],
      warehouse: ['dashboard','inventory','categories','stock-in','stock-out','reports','analytics'],
      finance: ['dashboard','inventory','categories','purchase','stock-in','requisition','stock-out','reports','analytics','history'],
      staff: ['dashboard','inventory','requisition','stock-out']
    };
    const accessible = roleMenuAccess[u.role] || roleMenuAccess['staff'];
    document.querySelectorAll('.nav-item').forEach(item => { const m = item.dataset.module; if (m && !accessible.includes(m)) item.style.display='none'; else item.style.display='flex'; });
    document.querySelectorAll('.admin-only').forEach(s=> s.style.display = (u.role==='admin') ? 'block' : 'none');
  } catch(e){}
};
