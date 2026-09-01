// User admin module: modal-based add/edit users, list rendering, cloud sync
(function(){
  function openUserModal(user) {
    const modal = document.getElementById('modal-user');
    if (!modal) return;
    // fill default values
    document.getElementById('user-username').value = user ? user.username : '';
    document.getElementById('user-displayname').value = user ? (user.name || '') : '';
    // normalize stored role (support legacy 'purchaser')
    document.getElementById('user-role').value = user ? normalizeRole(user.role || 'staff') : 'staff';
    document.getElementById('user-status').value = user ? (user.status || 'active') : 'active';
    document.getElementById('user-remark').value = user ? (user.remark || '') : '';
    // 显示注册时填写的需求说明
    const descEl = document.getElementById('user-description');
    if (descEl) {
      descEl.value = user ? (user.description || '') : '';
    }
    openModal('modal-user');
  }

  async function saveUserFromModal() {
    const username = document.getElementById('user-username').value.trim();
    const name = document.getElementById('user-displayname').value.trim();
    let role = document.getElementById('user-role').value;
    const status = document.getElementById('user-status').value;
    const remark = document.getElementById('user-remark').value.trim();

    // normalize role value (support legacy purchaser)
    role = normalizeRole(role);

    if (!username) { if (typeof showToast === 'function') showToast('请输入用户名','warning'); return; }

    showButtonLoading('save-user-btn', '保存中...');
    try {
      const existingUsers = (typeof _appCache !== 'undefined' && _appCache.users) ? _appCache.users : [];
      const existingUser = existingUsers.find(u => u.username === username);

      if (existingUser) {
        // update existing user directly via SupaDB
        await SupaDB.updateUser(username, { name, role, status, remark });
      } else {
        // create new user directly via SupaDB
        await SupaDB.createUser({
          id: Date.now(),
          username,
          name: name || username,
          role,
          status,
          remark
        });
      }

      // refresh _appCache from Supabase after write
      await refreshData('users');

      if (typeof loadUserList === 'function') loadUserList();
      closeModal();
      if (typeof showToast === 'function') showToast('账号已保存','success');
    } finally {
      if (typeof hideButtonLoading === 'function') hideButtonLoading('save-user-btn');
    }
  }

  const PERM_LABELS = {
    // 各模块「仅查看」权限（授权即可进入模块但不可增改）
    view_dashboard: '查看仪表盘',
    view_inventory: '查看库存',
    view_categories: '查看品类',
    view_purchase: '查看采购单',
    view_stockin: '查看入库',
    view_requisition: '查看领用单',
    view_stockout: '查看出库',
    view_monthly: '查看出入库明细',
    view_reports: '查看团期报表',
    view_analytics: '查看数据分析',
    view_history: '查看操作记录',
    view_users: '查看账号',
    view_roles: '查看角色权限',
    // 动作权限
    manage_inventory: '库存管理',
    edit_inventory: '编辑库存项',
    adjust_stock: '库存调整',
    supplement_info: '补充信息',
    manage_categories: '品类管理',
    create_purchase: '创建采购单',
    edit_purchase: '编辑采购单',
    delete_purchase: '删除采购单',
    confirm_stockin: '入库确认',
    create_requisition: '创建领用单',
    edit_requisition: '编辑领用单',
    withdraw_requisition: '撤回领用单',
    delete_requisition: '删除领用单',
    approve_requisition: '审核领用单',
    confirm_stockout: '出库确认',
    export_reports: '导出报表',
    admin_settings: '系统设置'
  };
  const ALL_PERMISSIONS = Object.keys(PERM_LABELS);

  // 权限按模块分组展示，便于「仅查看」授权一目了然
  const PERM_GROUPS = [
    { title: '仪表盘', perms: ['view_dashboard'] },
    { title: '库存管理', perms: ['view_inventory', 'manage_inventory', 'edit_inventory', 'adjust_stock', 'supplement_info'] },
    { title: '品类管理', perms: ['view_categories', 'manage_categories'] },
    { title: '采购单', perms: ['view_purchase', 'create_purchase', 'edit_purchase', 'delete_purchase'] },
    { title: '入库管理', perms: ['view_stockin', 'confirm_stockin'] },
    { title: '领用单', perms: ['view_requisition', 'create_requisition', 'edit_requisition', 'withdraw_requisition', 'delete_requisition', 'approve_requisition'] },
    { title: '出库管理', perms: ['view_stockout', 'confirm_stockout'] },
    { title: '报表与汇总', perms: ['view_reports', 'view_monthly', 'view_analytics', 'export_reports'] },
    { title: '操作记录', perms: ['view_history'] },
    { title: '系统管理', perms: ['view_users', 'view_roles', 'admin_settings'] }
  ];

  const ROLE_LABELS = {
    staff: '员工',
    purchase: '采购员',
    purchaser: '采购员', // legacy key mapping
    warehouse: '仓库管理员',
    finance: '财务',
    admin: '管理员'
  };

  function normalizeRole(role) {
    if (!role) return 'staff';
    if (role === 'purchaser') return 'purchase';
    return role;
  }

  function loadUserList() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    // 合并三源数据（Supabase + _appCache + localStorage），防止 Supabase 写入失败时用户丢失
    const users = (typeof mergeAllUserSources === 'function')
      ? mergeAllUserSources()
      : ((typeof _appCache !== 'undefined' && _appCache.users) ? _appCache.users : []);
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无用户数据</td></tr>';
      return;
    }

    const statusLabels = {
      pending: '<span style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:10px;font-size:12px;">待审核</span>',
      active: '<span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:10px;font-size:12px;">已启用</span>',
      disabled: '<span style="background:#f8d7da;color:#721c24;padding:2px 10px;border-radius:10px;font-size:12px;">已禁用</span>',
      rejected: '<span style="background:#f8d7da;color:#721c24;padding:2px 10px;border-radius:10px;font-size:12px;">已拒绝</span>'
    };

    tbody.innerHTML = users.map(u => {
      const roleName = ROLE_LABELS[normalizeRole(u.role)] || (u.role || '');
      const statusHtml = statusLabels[u.status] || u.status || '';
      const isPending = u.status === 'pending';
      const isRejected = u.status === 'rejected';

      let actions = '';
      if (isPending || isRejected) {
        actions = `
          <button class="btn btn-sm" style="background:#d4edda;border-color:#155724;color:#155724;" onclick="approveUser('${u.username}')">${isRejected ? '重新通过' : '通过'}</button>
          ${isPending ? `<button class="btn btn-sm" style="background:#f8d7da;border-color:#721c24;color:#721c24;margin-left:4px;" onclick="rejectUser('${u.username}')">拒绝</button>` : ''}
        `;
      } else {
        actions = `
          <button class="btn btn-sm edit-user-btn" data-username="${u.username}">编辑</button>
          <button class="btn btn-sm edit-user-perm-btn" data-username="${u.username}" style="margin-left:4px;">权限</button>
          ${u.status === 'active'
            ? `<button class="btn btn-sm" style="margin-left:4px;color:var(--warning);" onclick="toggleUserStatus('${u.username}','disabled')">禁用</button>`
            : `<button class="btn btn-sm" style="margin-left:4px;color:var(--success);" onclick="toggleUserStatus('${u.username}','active')">启用</button>`
          }
        `;
      }

      return `
      <tr>
        <td style="font-size:12px;color:var(--text-muted);font-family:monospace;">${u.id}</td>
        <td>${u.username}</td>
        <td>${u.name || ''}</td>
        <td>${roleName}</td>
        <td>${statusHtml}</td>
        <td style="font-size:12px;color:var(--text-muted);">${u.created_at ? u.created_at.slice(0,10) : '-'}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    // 绑定编辑按钮
    tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', (e) => {
        const username = btn.dataset.username;
        const users = (typeof _appCache !== 'undefined' && _appCache.users) ? _appCache.users : [];
        const user = users.find(x => x.username === username);
        openUserModal(user);
      });
    });
    // 绑定权限按钮
    tbody.querySelectorAll('.edit-user-perm-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', (e) => {
        const username = btn.dataset.username;
        const users = (typeof _appCache !== 'undefined' && _appCache.users) ? _appCache.users : [];
        const user = users.find(x => x.username === username);
        openUserPermsModal(user);
      });
    });
  }

  // 审核通过
  window.approveUser = function(username) {
    if (typeof showConfirm === 'function') {
      showConfirm('确认通过该用户的注册申请？', function() { _doApprove(username); }, { confirmText: '确认通过', danger: false, icon: '✅' });
    } else {
      _doApprove(username);
    }
  };
  async function _doApprove(username) {
    // 1. 先乐观更新本地缓存，立即反映 UI
    if (typeof _appCache !== 'undefined' && _appCache.users) {
      var u = _appCache.users.find(function(x) { return x.username === username; });
      if (u) { u.status = 'active'; u.is_active = true; }
    }
    loadUserList();
    showToast('用户 ' + username + ' 已通过审核', 'success');
    if (typeof checkNotifications === 'function') checkNotifications();
    // 2. 持久化到 Supabase
    try {
      await SupaDB.updateUser(username, { status: 'active' });
    } catch(e) {
      console.warn('[UserAdmin] Supabase approve failed:', e.message);
      showToast('云端同步失败，本地已生效', 'warning');
    }
    // 3. 后台刷新保持一致
    try { await refreshData('users'); } catch(e) {}
  }

  // 拒绝申请
  window.rejectUser = function(username) {
    if (typeof showConfirm === 'function') {
      showConfirm('确认拒绝该用户的注册申请？', function() { _doReject(username); }, { confirmText: '确认拒绝', danger: true, icon: '🚫' });
    } else {
      _doReject(username);
    }
  };
  async function _doReject(username) {
    // 拒绝申请：标记为rejected状态（不删除，保留数据完整性）
    try {
      await SupaDB.updateUser(username, { status: 'rejected', is_active: false });
    } catch(e) {
      console.warn('[UserAdmin] Supabase reject failed:', e.message);
      showToast('拒绝操作失败: ' + e.message, 'error');
      return;
    }
    // 写审计日志
    try {
      if (typeof SupaDB !== 'undefined' && typeof SupaDB.writeAuditLog === 'function') {
        await SupaDB.writeAuditLog('reject_user', 'user', username, null, { username: username });
      }
    } catch(e) {}
    // 更新本地缓存
    if (typeof _appCache !== 'undefined' && _appCache.users) {
      var u = _appCache.users.find(function(x) { return x.username === username; });
      if (u) { u.status = 'rejected'; u.is_active = false; }
    }
    await refreshData('users');
    loadUserList();
    if (typeof checkNotifications === 'function') checkNotifications();
    showToast('已拒绝 ' + username + ' 的注册申请', 'info');
  }

  // 启用/禁用
  window.toggleUserStatus = async function(username, newStatus) {
    // 1. 先乐观更新本地缓存
    if (typeof _appCache !== 'undefined' && _appCache.users) {
      var u = _appCache.users.find(function(x) { return x.username === username; });
      if (u) { u.status = newStatus; u.is_active = (newStatus === 'active'); }
    }
    loadUserList();
    const label = newStatus === 'active' ? '已启用' : '已禁用';
    showToast('用户 ' + username + ' ' + label, 'info');
    if (typeof checkNotifications === 'function') checkNotifications();
    // 2. 持久化到 Supabase
    try {
      await SupaDB.updateUser(username, { status: newStatus });
    } catch(e) {
      console.warn('[UserAdmin] Supabase status change failed:', e.message);
      showToast('云端同步失败，本地已生效', 'warning');
    }
    // 3. 后台刷新保持一致
    try { await refreshData('users'); } catch(e) {}
  };

  // 用户变更同步到 Supabase（保留为外部 fallback 入口）
  function _syncUserToCloud(username, data, mode) {
    mode = mode || 'update';
    try {
      if (typeof SupaDB !== 'undefined') {
        if (mode === 'delete') {
          SupaDB.deleteUser(username).catch(function(e) {
            console.warn('[UserAdmin] Supabase delete failed:', e.message);
          });
        } else {
          SupaDB.updateUser(username, data).catch(function(e) {
            console.warn('[UserAdmin] Supabase update failed:', e.message);
          });
        }
      }
    } catch(e) {
      console.warn('[UserAdmin] Supabase sync error:', e.message);
    }
  }

  function getDefaultPermsForRole(role) {
    const defs = {
      admin: ['all'],
      purchase: ['view_dashboard','view_inventory','view_categories','view_purchase','view_reports','view_analytics','create_purchase','edit_purchase','delete_purchase','supplement_info','manage_categories','export_reports'],
      warehouse: ['view_dashboard','view_inventory','view_categories','view_stockin','view_stockout','view_reports','view_analytics','edit_inventory','manage_inventory','adjust_stock','confirm_stockin','confirm_stockout','approve_requisition','supplement_info','manage_categories','export_reports'],
      finance: ['view_dashboard','view_inventory','view_categories','view_purchase','view_stockin','view_requisition','view_stockout','view_reports','view_analytics','view_history','view_monthly','export_reports'],
      staff: ['view_dashboard','view_inventory','view_requisition','view_stockout','create_requisition','edit_requisition','withdraw_requisition']
    };
    return defs[role] || defs['staff'];
  }

  function openUserPermsModal(user) {
    const modal = document.getElementById('modal-user-perms');
    if (!modal) return;
    document.getElementById('user-perms-modal-title').textContent = `编辑用户权限：${user.username}`;
    const roleSelect = document.getElementById('user-perms-role-select');
    const container = document.getElementById('user-permissions-list');

    // render checkboxes (grouped by module)
    function renderPerms(selectedPerms) {
      const groupsHtml = PERM_GROUPS.map(g => {
        const items = g.perms.filter(p => PERM_LABELS[p]).map(p =>
          `<label style="display:flex;align-items:center;gap:6px;margin:5px 0;font-size:13px;"><input type="checkbox" data-perm="${p}"> ${PERM_LABELS[p] || p}</label>`
        ).join('');
        return `<div style="margin:10px 0;"><div style="font-weight:600;font-size:12px;color:var(--text-muted);margin-bottom:4px;border-bottom:1px solid var(--border, #eee);padding-bottom:3px;">${g.title}</div>${items}</div>`;
      }).join('');
      container.innerHTML = groupsHtml;
      container.querySelectorAll('input[type=checkbox]').forEach(cb => { if (selectedPerms.includes(cb.dataset.perm)) cb.checked = true; });
    }

    // load existing user perms (async from Supabase)
    let existing = [];
    let hasCustomPerms = false;

    // render initial checkboxes with role defaults
    if (roleSelect) roleSelect.value = normalizeRole(user.role || 'staff');
    const base = getDefaultPermsForRole(roleSelect ? normalizeRole(roleSelect.value) : normalizeRole(user.role || 'staff'));
    renderPerms(base);

    // async fetch actual permissions from Supabase
    (async function() {
      try {
        const sb = typeof getSupabase === 'function' ? getSupabase() : null;
        if (sb) {
          var nid = user.id;
          if (typeof nid === 'string' && nid.charAt(0) === 'u') {
            var stripped = nid.substring(1);
            var num = Number(stripped);
            if (!isNaN(num)) nid = num;
          }
          const { data: permData } = await sb.from('user_permissions').select('permission').eq('user_id', nid);
          if (permData && permData.length > 0) {
            existing = permData.map(p => p.permission);
            hasCustomPerms = true;
            // 若管理员曾为该用户单独配置过权限，直接以个性化权限为准，
            // 不再合并角色默认，否则取消角色默认权限后重新打开会恢复。
            renderPerms(existing);
          }
        }
      } catch(e) {
        console.warn('[UserAdmin] Failed to load permissions:', e.message);
      }
    })();

    // role change -> use new role defaults (switching role resets to template)
    if (roleSelect && !roleSelect._boundRole) {
      roleSelect._boundRole = true;
      roleSelect.addEventListener('change', () => {
        const newBase = getDefaultPermsForRole(normalizeRole(roleSelect.value));
        existing = [];
        hasCustomPerms = false;
        renderPerms(newBase);
      });
    }

    // bind save - replace button to avoid duplicate handlers
    const saveBtn = document.getElementById('save-user-perms-btn');
    if (saveBtn) {
      const newSave = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSave, saveBtn);
      newSave.addEventListener('click', async () => {
        showButtonLoading('save-user-perms-btn', '保存中...');
        try {
          const permChecks = Array.from(container.querySelectorAll('input[type=checkbox]'));
          const perms = permChecks.filter(c=>c.checked).map(c=>c.dataset.perm);

          // update user role via SupaDB directly
          const newRole = normalizeRole(roleSelect ? roleSelect.value : (user.role || 'staff'));
          await SupaDB.updateUser(user.username, { role: newRole });

          // sync permissions via Supabase directly (no dedicated SupaDB method)
          const sb = typeof getSupabase === 'function' ? getSupabase() : null;
          if (sb) {
            // convert legacy 'u'-prefixed id to numeric
            var nid = user.id;
            if (typeof nid === 'string' && nid.charAt(0) === 'u') {
              var stripped = nid.substring(1);
              var num = Number(stripped);
              if (!isNaN(num)) nid = num;
            }
            // delete existing permissions for this user
            const { error: delErr } = await sb.from('user_permissions').delete().eq('user_id', nid);
            if (delErr) throw new Error('清空旧权限失败: ' + delErr.message);
            // insert new permissions
            if (perms.length > 0) {
              const permInserts = perms.map(p => ({ user_id: nid, permission: p }));
              const { error: insErr } = await sb.from('user_permissions').insert(permInserts);
              if (insErr) throw new Error('写入新权限失败: ' + insErr.message);
            }
          }

          // refresh _appCache and clear permission cache so target user picks up changes on next load
          await refreshData('users');
          if (typeof clearPermissionCache === 'function') clearPermissionCache();

          if (typeof showToast === 'function') showToast('用户权限已保存','success');
          if (typeof loadUserList === 'function') loadUserList();
          closeModal();
        } catch (e) {
          console.warn('保存用户权限失败', e);
          if (typeof showToast === 'function') showToast('保存失败','error');
        } finally {
          if (typeof hideButtonLoading === 'function') hideButtonLoading('save-user-perms-btn');
        }
      });
    }

    openModal('modal-user-perms');
  }

  function initUserAdmin() {
    // bind modal buttons
    const saveBtn = document.getElementById('save-user-btn');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', saveUserFromModal);
    }
    const cancelBtn = document.getElementById('cancel-user-btn');
    if (cancelBtn && !cancelBtn._bound) {
      cancelBtn._bound = true;
      cancelBtn.addEventListener('click', () => closeModal());
    }

    // ensure modal close button works (modal-close class)
    document.querySelectorAll('#modal-user .modal-close').forEach(btn => {
      if (!btn._bound) { btn._bound = true; btn.addEventListener('click', () => closeModal()); }
    });

    // initial load
    loadUserList();

    // expose openUserModal globally so other modules can call it
    window.openUserModal = openUserModal;
    window.loadUserList = loadUserList;
    window.openUserPermsModal = openUserPermsModal;
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initUserAdmin, 50);
  } else {
    document.addEventListener('DOMContentLoaded', initUserAdmin);
  }
})();