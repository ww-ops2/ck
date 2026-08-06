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
    // 先用 localStorage 权限缓存渲染，再异步向数据库核对
    loadPermissions(currentUserFallback)
      .catch(function (e) { console.warn('[Auth] 恢复会话时加载权限失败:', e.message); })
      .finally(function () { showApp(); });
  } else {
    showLoginPage();
  }
}

/**
 * 合并三源用户数据（Supabase → _appCache → localStorage）
 * 解决注册写入 Supabase 静默失败时用户只存在于 localStorage 的问题
 */
function mergeAllUserSources() {
  var userMap = {};

  // 1. localStorage（最低优先级）
  try {
    var ls = JSON.parse(localStorage.getItem('users') || '[]');
    ls.forEach(function(u) { if (u && u.username) userMap[u.username] = u; });
  } catch(e) {}

  // 2. _appCache（中优先级，覆盖 localStorage）
  if (typeof _appCache !== 'undefined' && _appCache.users) {
    _appCache.users.forEach(function(u) { if (u && u.username) userMap[u.username] = u; });
  }

  return Object.values(userMap);
}
window.mergeAllUserSources = mergeAllUserSources;

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
    // 管理员固定 id=1，与数据库 users 表对齐（否则审计日志 user_id 写不进去）
    currentUserFallback = { id: 1, username: 'admin', name: '系统管理员', role: 'admin', status: 'active' };
    localStorage.setItem('currentUser', JSON.stringify(currentUserFallback));
    await loadPermissions(currentUserFallback);
    showApp();
    return;
  }

  // 普通用户登录 — 合并三源数据（Supabase + _appCache + localStorage）
  let users = mergeAllUserSources();

  // 额外尝试 SupaDB.getUsers() 补充云端数据
  try {
    if (typeof SupaDB !== 'undefined' && SupaDB.getUsers) {
      const cloudUsers = await SupaDB.getUsers();
      if (cloudUsers && cloudUsers.length > 0) {
        var existNames = {};
        users.forEach(function(u) { existNames[u.username] = true; });
        cloudUsers.forEach(function(u) {
          if (u && u.username && !existNames[u.username]) {
            users.push(u);
            existNames[u.username] = true;
          }
        });
      }
    }
  } catch (e) {
    console.warn('[Auth] SupaDB.getUsers() failed:', e.message);
  }

  var user = users.find(function(u) { return u.username === phone; });

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
  // 权限必须在渲染前就绪，否则首帧按钮显隐会用兜底映射
  await loadPermissions(currentUserFallback);
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
async function submitRegistration() {
  const phone = document.getElementById('reg-phone').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  const role = document.getElementById('reg-role').value;
  let description = document.getElementById('reg-description').value.trim();

  if (!phone) { showToast('请输入手机号码', 'warning'); return; }
  if (phone.length < 5) { showToast('请输入有效的手机号码', 'warning'); return; }
  if (!name) { showToast('请输入姓名', 'warning'); return; }
  if (!role) { showToast('请选择角色', 'warning'); return; }
  if (!description) description = '';

  // 检查重复（三源合并检查，包含 Supabase 防止跨设备重复注册）
  var allUsers = (typeof mergeAllUserSources === 'function')
    ? mergeAllUserSources()
    : JSON.parse(localStorage.getItem('users') || '[]');
  if (allUsers.find(u => u.username === phone)) {
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

  // 1. 云端优先：写入 Supabase 作为权威存储，确保多设备/多人可见
  let cloudOk = false;
  if (typeof SupaDB !== 'undefined' && SupaDB.createUser) {
    try {
      await SupaDB.createUser(newUser);
      cloudOk = true;
      console.log('[Auth] 用户注册已同步到 Supabase:', phone);
    } catch (e) {
      console.warn('[Auth] SupaDB.createUser() failed:', e.message);
    }
  }

  // 2. 本地仅作会话级缓存，不作为数据来源
  var lsUsers = JSON.parse(localStorage.getItem('users') || '[]');
  if (!lsUsers.find(u => u.username === phone)) lsUsers.push(newUser);
  localStorage.setItem('users', JSON.stringify(lsUsers));
  if (typeof _appCache !== 'undefined') {
    if (!_appCache.users) _appCache.users = [];
    if (!_appCache.users.find(u => u.username === phone)) _appCache.users.push(newUser);
  }

  closeModal();
  checkNotifications();
  if (cloudOk) {
    showToast('注册成功！已保存至云端，请等待管理员审核授权', 'success');
  } else {
    showToast('注册信息已暂存本地，但未能写入云端（网络异常），其他设备暂不可见，请联网后重试。', 'warning', 5000);
  }
}

function handleLogout() {
  const doLogout = function() {
    currentUserFallback = null;
    localStorage.removeItem('currentUser');
    clearPermissionCache();
    showLoginPage();
  };
  if (typeof showConfirm === 'function') {
    showConfirm('确定要退出登录吗？', doLogout, { confirmText: '确认退出', danger: false, icon: '🚪' });
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

// ============================================================
// 权限系统 v5.43
// 数据库为唯一权威：user_permissions（个人授权，优先）> role_permissions（角色授权）
// 内置映射仅作为「数据库不可达」时的兜底
// ============================================================

/** 兜底角色权限（与数据库 role_permissions 默认值保持一致） */
function getPermissionsForRole(role) {
  const permissions = {
    admin: ['all'],
    purchase: ['view_dashboard','view_inventory','view_categories','view_purchase','view_reports','view_analytics',
               'create_purchase','edit_purchase','delete_purchase','supplement_info','manage_categories','export_reports'],
    warehouse: ['view_dashboard','view_inventory','view_categories','view_stockin','view_stockout','view_reports','view_analytics',
                'edit_inventory','manage_inventory','adjust_stock','confirm_stockin','confirm_stockout',
                'approve_requisition','supplement_info','manage_categories','export_reports'],
    finance: ['view_dashboard','view_inventory','view_categories','view_purchase','view_stockin','view_requisition','view_stockout',
              'view_reports','view_analytics','view_history','view_monthly','export_reports'],
    staff: ['view_dashboard','view_inventory','view_requisition','view_stockout',
            'create_requisition','edit_requisition','withdraw_requisition']
  };
  return permissions[role] || permissions['staff'];
}

/** 已加载的有效权限集合（Set），null 表示尚未从数据库加载 */
let _permSet = null;
let _permOwner = null;   // 权限集合归属的用户标识
let _permSource = 'none'; // 'db' | 'cache' | 'fallback' | 'none'

/** 生成用户标识（兼容 id 为数字/字符串/undefined 的情况） */
function _permKeyOf(u) {
  if (!u) return null;
  return String(u.id != null ? u.id : u.username) + '|' + (u.role || '');
}

/**
 * 从数据库加载当前用户的有效权限
 * 成功后写入内存 + localStorage，供刷新后首帧同步使用
 */
async function loadPermissions(user) {
  user = user || currentUserFallback;
  if (!user) return null;
  const key = _permKeyOf(user);

  // 管理员固定全权，无需查库
  if (user.role === 'admin') {
    _permSet = new Set(['all']);
    _permOwner = key; _permSource = 'db';
    return _permSet;
  }

  // 1) 先用 localStorage 里的上次结果，保证首帧渲染不丢权限
  try {
    const cached = JSON.parse(localStorage.getItem('permCache') || 'null');
    if (cached && cached.key === key && Array.isArray(cached.perms)) {
      _permSet = new Set(cached.perms);
      _permOwner = key; _permSource = 'cache';
    }
  } catch (e) { /* ignore */ }

  // 2) 再查数据库刷新
  try {
    if (typeof SupaDB !== 'undefined' && SupaDB.getEffectivePermissions) {
      const res = await SupaDB.getEffectivePermissions(user.id, user.role);
      // 兼容两种返回：{permissions,source} 或 直接数组
      const perms = Array.isArray(res) ? res : (res && res.permissions) || null;
      const src = (res && res.source) || 'db';
      if (perms && perms.length > 0) {
        _permSet = new Set(perms);
        _permOwner = key; _permSource = 'db:' + src;
        localStorage.setItem('permCache', JSON.stringify({ key: key, perms: perms }));
        console.log('[Auth] 权限已加载 [' + src + '] (' + perms.length + '):', perms.join(', '));
        return _permSet;
      }
      console.warn('[Auth] 数据库未配置该角色权限(' + user.role + ')，使用兜底映射');
    }
  } catch (e) {
    console.warn('[Auth] 权限加载失败，使用兜底映射:', e.message);
  }

  // 3) 数据库不可达且无缓存 → 兜底
  if (!_permSet || _permOwner !== key) {
    _permSet = new Set(getPermissionsForRole(user.role || 'staff'));
    _permOwner = key; _permSource = 'fallback';
  }
  return _permSet;
}

/** 清空权限缓存（退出登录 / 管理员改权限后调用） */
function clearPermissionCache() {
  _permSet = null; _permOwner = null; _permSource = 'none';
  try { localStorage.removeItem('permCache'); } catch (e) { /* ignore */ }
}

/** 管理员修改权限后，刷新当前用户权限并重绘界面 */
async function refreshPermissions() {
  clearPermissionCache();
  await loadPermissions(currentUserFallback);
  if (typeof updateMenuByRole === 'function') updateMenuByRole();
  if (typeof refreshCurrentModule === 'function') refreshCurrentModule();
}

function hasPermission(permission) {
  if (!currentUserFallback) return false;
  if (currentUserFallback.role === 'admin') return true;

  const key = _permKeyOf(currentUserFallback);

  // 权限集合未加载或不属于当前用户 → 临时用兜底映射，并异步补加载
  if (!_permSet || _permOwner !== key) {
    loadPermissions(currentUserFallback);
    const fb = getPermissionsForRole(currentUserFallback.role || 'staff');
    return fb.indexOf(permission) !== -1 || fb.indexOf('all') !== -1;
  }

  if (_permSet.has('all')) return true;
  if (_permSet.has(permission)) return true;

  // 兼容历史点号写法：inventory.adjust ↔ adjust_stock
  const alias = {
    'inventory.adjust': 'adjust_stock',
    'inventory.edit': 'edit_inventory',
    'create_category': 'manage_categories',
    'purchase.create': 'create_purchase'
  };
  if (alias[permission] && _permSet.has(alias[permission])) return true;

  return false;
}

/** 当前权限来源，供调试与自检 */
function getPermissionInfo() {
  return {
    user: currentUserFallback ? currentUserFallback.username : null,
    role: currentUserFallback ? currentUserFallback.role : null,
    source: _permSource,
    permissions: _permSet ? Array.from(_permSet) : []
  };
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
    // 合并三源用户数据，确保不遗漏任何注册
    let users = mergeAllUserSources();
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
window.loadPermissions = loadPermissions;
window.refreshPermissions = refreshPermissions;
window.clearPermissionCache = clearPermissionCache;
window.getPermissionInfo = getPermissionInfo;
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
    // 各模块对应的「仅查看」权限：持有即可进入模块（配合模块内动作权限实现只读）
    const moduleViewPerm = {
      'dashboard': 'view_dashboard',
      'inventory': 'view_inventory',
      'categories': 'view_categories',
      'purchase': 'view_purchase',
      'stock-in': 'view_stockin',
      'requisition': 'view_requisition',
      'stock-out': 'view_stockout',
      'monthly-summary': 'view_monthly',
      'reports': 'view_reports',
      'analytics': 'view_analytics',
      'history': 'view_history',
      'admin-users': 'view_users',
      'admin-roles': 'view_roles',
      'admin-settings': 'admin_settings'
    };
    const accessible = roleMenuAccess[u.role] || roleMenuAccess['staff'];
    // 角色默认可见 + 单独授权的「仅查看」权限可见（管理员因含 all 始终可见）
    document.querySelectorAll('.nav-item').forEach(item => {
      const m = item.dataset.module;
      if (!m) return;
      let show = accessible.includes(m);
      if (!show && moduleViewPerm[m] && typeof hasPermission === 'function' && hasPermission(moduleViewPerm[m])) show = true;
      item.style.display = show ? 'flex' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(s=> s.style.display = (u.role==='admin') ? 'block' : 'none');
    // 登录后按角色/权限显隐「新建领用单」等动作按钮（DOMContentLoaded 阶段 currentUser 为空会误隐藏）
    if (typeof updateRequisitionCreateBtnVisibility === 'function') updateRequisitionCreateBtnVisibility();
  } catch(e){}
};
