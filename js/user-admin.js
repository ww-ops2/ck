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

    let users = JSON.parse(localStorage.getItem('users') || '[]');
    // check duplicate username
    if (users.find(u => u.username === username)) {
      // update existing
      users = users.map(u => u.username === username ? Object.assign({}, u, { name, role, status, remark }) : u);
    } else {
      users.push({ id: Date.now(), username, name: name || username, role, status, remark });
    }
    localStorage.setItem('users', JSON.stringify(users));

    // try cloud sync (non-blocking)
    try {
      const sb = typeof getSupabase === 'function' ? getSupabase() : (typeof SupaDB !== 'undefined' ? SupaDB.getClient && SupaDB.getClient() : null);
      if (sb) {
        // 逐条同步，避免单条失败导致整个批次失败
        for (var ui = 0; ui < users.length; ui++) {
          var uu = users[ui];
          await sb.from('users').upsert({
            id: uu.id, username: uu.username, name: uu.name, role: uu.role,
            is_active: (uu.status === 'active' || uu.status === undefined)
          }, { onConflict: 'username' });
        }
        // 再尝试同步扩展字段（逐条，如表结构不支持则跳过）
        for (var uj = 0; uj < users.length; uj++) {
          var uuj = users[uj];
          var { error: extErr } = await sb.from('users').upsert({
            id: uuj.id, username: uuj.username, name: uuj.name, role: uuj.role,
            status: uuj.status || 'active', remark: uuj.remark || '',
            description: uuj.description || '',
            created_at: uuj.created_at || new Date().toISOString()
          }, { onConflict: 'username' });
          if (extErr) {
            // 扩展列不存在则静默跳过，不阻塞后续用户
          }
        }
        console.log('[UserAdmin] Synced users to Supabase');
      }
    } catch (e) { console.warn('[UserAdmin] Supabase sync failed', e.message || e); }

    if (typeof loadUserList === 'function') loadUserList();
    closeModal();
    if (typeof showToast === 'function') showToast('账号已保存','success');
  }

  const PERM_LABELS = {
    create_purchase: '创建采购单',
    edit_purchase: '编辑采购单',
    view_purchase: '查看采购单',
    delete_purchase: '删除采购单',
    confirm_stockin: '入库确认',
    confirm_stockout: '出库确认',
    create_requisition: '创建领用单',
    edit_requisition: '编辑领用单',
    withdraw_requisition: '撤回领用单',
    delete_requisition: '删除领用单',
    manage_inventory: '库存管理',
    adjust_stock: '库存调整',
    edit_inventory: '编辑库存项',
    manage_categories: '品类管理',
    view_inventory: '查看库存',
    export_reports: '导出报表',
    admin_settings: '系统设置',
    supplement_info: '补充信息'
  };
  const ALL_PERMISSIONS = Object.keys(PERM_LABELS);

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
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无用户数据</td></tr>';
      return;
    }

    const statusLabels = {
      pending: '<span style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:10px;font-size:12px;">待审核</span>',
      active: '<span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:10px;font-size:12px;">已启用</span>',
      disabled: '<span style="background:#f8d7da;color:#721c24;padding:2px 10px;border-radius:10px;font-size:12px;">已禁用</span>'
    };

    tbody.innerHTML = users.map(u => {
      const roleName = ROLE_LABELS[normalizeRole(u.role)] || (u.role || '');
      const statusHtml = statusLabels[u.status] || u.status || '';
      const isPending = u.status === 'pending';

      let actions = '';
      if (isPending) {
        actions = `
          <button class="btn btn-sm" style="background:#d4edda;border-color:#155724;color:#155724;" onclick="approveUser('${u.username}')">通过</button>
          <button class="btn btn-sm" style="background:#f8d7da;border-color:#721c24;color:#721c24;margin-left:4px;" onclick="rejectUser('${u.username}')">拒绝</button>
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
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(x => x.username === username);
        openUserModal(user);
      });
    });
    // 绑定权限按钮
    tbody.querySelectorAll('.edit-user-perm-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', (e) => {
        const username = btn.dataset.username;
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(x => x.username === username);
        openUserPermsModal(user);
      });
    });
  }

  // 审核通过
  window.approveUser = function(username) {
    if (typeof showConfirm === 'function') {
      showConfirm('确认通过该用户的注册申请？', function() { _doApprove(username); });
    } else {
      _doApprove(username);
    }
  };
  function _doApprove(username) {
    let users = JSON.parse(localStorage.getItem('users') || '[]');
    users = users.map(u => u.username === username ? Object.assign({}, u, { status: 'active' }) : u);
    localStorage.setItem('users', JSON.stringify(users));

    // 同步到 Supabase
    _syncUserToCloud(username, { status: 'active' });

    loadUserList();
    if (typeof checkNotifications === 'function') checkNotifications();
    showToast('用户 ' + username + ' 已通过审核', 'success');
  }

  // 拒绝申请
  window.rejectUser = function(username) {
    if (typeof showConfirm === 'function') {
      showConfirm('确认拒绝该用户的注册申请？\n（该账号将被删除）', function() { _doReject(username); });
    } else {
      _doReject(username);
    }
  };
  function _doReject(username) {
    let users = JSON.parse(localStorage.getItem('users') || '[]');
    users = users.filter(u => u.username !== username);
    localStorage.setItem('users', JSON.stringify(users));

    // 从 Supabase 删除
    _syncUserToCloud(username, null, 'delete');

    loadUserList();
    if (typeof checkNotifications === 'function') checkNotifications();
    showToast('已拒绝 ' + username + ' 的注册申请', 'info');
  }

  // 启用/禁用
  window.toggleUserStatus = function(username, newStatus) {
    let users = JSON.parse(localStorage.getItem('users') || '[]');
    users = users.map(u => u.username === username ? Object.assign({}, u, { status: newStatus }) : u);
    localStorage.setItem('users', JSON.stringify(users));

    // 同步到 Supabase
    _syncUserToCloud(username, { status: newStatus });

    loadUserList();
    if (typeof checkNotifications === 'function') checkNotifications();
    const label = newStatus === 'active' ? '已启用' : '已禁用';
    showToast('用户 ' + username + ' ' + label, 'info');
  };

  // 用户变更同步到 Supabase（统一入口）
  // mode: 'update' (默认) 或 'delete'
  function _syncUserToCloud(username, data, mode) {
    mode = mode || 'update';
    try {
      if (typeof SupaDB !== 'undefined' && SupaDB.updateUser) {
        if (mode === 'delete') {
          SupaDB.deleteUser(username).catch(function(e) {
            console.warn('[UserAdmin] Supabase delete failed:', e.message);
          });
        } else {
          SupaDB.updateUser(username, data).catch(function(e) {
            console.warn('[UserAdmin] Supabase update failed:', e.message);
          });
        }
      } else {
        // 兜底：直接调用 supabase client
        var sb = typeof getSupabase === 'function' ? getSupabase() : null;
        if (sb) {
          if (mode === 'delete') {
            sb.from('users').delete().eq('username', username).then(function() {
              console.log('[UserAdmin] Deleted from Supabase:', username);
            });
          } else {
            // 映射 status → is_active
            var fbUpdate = {};
            for (var fbKey in data) {
              if (data.hasOwnProperty(fbKey)) {
                if (fbKey === 'status') {
                  fbUpdate.is_active = (data[fbKey] === 'active');
                } else {
                  fbUpdate[fbKey] = data[fbKey];
                }
              }
            }
            sb.from('users').update(fbUpdate).eq('username', username).then(function() {
              console.log('[UserAdmin] Updated in Supabase:', username);
            });
          }
        }
      }
    } catch(e) {
      console.warn('[UserAdmin] Supabase sync error:', e.message);
    }
  }

  function getDefaultPermsForRole(role) {
    const defs = {
      admin: ['admin_settings','manage_inventory','view_inventory','export_reports','create_purchase','edit_purchase','delete_purchase','confirm_stockin','confirm_stockout','manage_categories','adjust_stock','edit_inventory','create_requisition','edit_requisition'],
      purchase: ['create_purchase','edit_purchase','view_purchase','view_inventory','manage_categories','supplement_info'],
      warehouse: ['view_purchase','confirm_stockin','confirm_stockout','adjust_stock','manage_inventory','view_inventory','supplement_info'],
      finance: ['view_purchase','view_inventory','export_reports'],
      staff: ['create_requisition','edit_requisition','view_inventory']
    };
    return defs[role] || defs['staff'];
  }

  function openUserPermsModal(user) {
    const modal = document.getElementById('modal-user-perms');
    if (!modal) return;
    document.getElementById('user-perms-modal-title').textContent = `编辑用户权限：${user.username}`;
    const roleSelect = document.getElementById('user-perms-role-select');
    const container = document.getElementById('user-permissions-list');

    // render checkboxes
    function renderPerms(selectedPerms) {
      container.innerHTML = ALL_PERMISSIONS.map(p => `<label style="display:block;margin:6px 0;"><input type="checkbox" data-perm="${p}"> ${PERM_LABELS[p] || p}</label>`).join('');
      container.querySelectorAll('input[type=checkbox]').forEach(cb => { if (selectedPerms.includes(cb.dataset.perm)) cb.checked = true; });
    }

    // load existing user perms and role
    let userPermStore = {};
    try { userPermStore = JSON.parse(localStorage.getItem('userPermissions') || '{}'); } catch(e){ userPermStore = {}; }
    const existing = Array.isArray(userPermStore[user.id]) ? userPermStore[user.id] : [];

    if (roleSelect) roleSelect.value = normalizeRole(user.role || 'staff');
    const base = getDefaultPermsForRole(roleSelect ? normalizeRole(roleSelect.value) : normalizeRole(user.role || 'staff'));
    const merged = Array.from(new Set([...(base||[]), ...(existing||[])]));
    renderPerms(merged);

    // role change -> update checkboxes to role defaults + existing
    if (roleSelect && !roleSelect._boundRole) {
      roleSelect._boundRole = true;
      roleSelect.addEventListener('change', () => {
        const newBase = getDefaultPermsForRole(normalizeRole(roleSelect.value));
        const newMerged = Array.from(new Set([...(newBase||[]), ...(existing||[])]));
        renderPerms(newMerged);
      });
    }

    // bind save - replace button to avoid duplicate handlers
    const saveBtn = document.getElementById('save-user-perms-btn');
    if (saveBtn) {
      const newSave = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSave, saveBtn);
      newSave.addEventListener('click', async () => {
        const permChecks = Array.from(container.querySelectorAll('input[type=checkbox]'));
        const perms = permChecks.filter(c=>c.checked).map(c=>c.dataset.perm);
        try {
          // persist userPermissions
          const s = JSON.parse(localStorage.getItem('userPermissions') || '{}');
          s[user.id] = perms;
          localStorage.setItem('userPermissions', JSON.stringify(s));
          // update user's role in users storage
          const users = JSON.parse(localStorage.getItem('users') || '[]');
          const updated = users.map(u => u.id === user.id ? Object.assign({}, u, { role: normalizeRole(roleSelect ? roleSelect.value : (user.role || 'staff')) }) : u);
          localStorage.setItem('users', JSON.stringify(updated));

          // try cloud sync (non-blocking)
          try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : (typeof SupaDB !== 'undefined' ? SupaDB.getClient && SupaDB.getClient() : null);
            if (sb) {
              // 兼容旧格式ID：将 'u' + 时间戳 转为纯数字
              function toNumericId(id) {
                var n = Number(id);
                if (!isNaN(n) && String(n) === String(id)) return n;
                if (typeof id === 'string' && id.charAt(0) === 'u') {
                  var stripped = id.substring(1);
                  var num = Number(stripped);
                  if (!isNaN(num)) return num;
                }
                return id;
              }
              // 逐条同步用户（避免批量时类型不匹配导致失败）
              for (var ui = 0; ui < updated.length; ui++) {
                var uu = updated[ui];
                await sb.from('users').upsert({
                  id: toNumericId(uu.id), username: uu.username, name: uu.name, role: uu.role,
                  is_active: (uu.status === 'active')
                }, { onConflict: 'username' });
              }
              // 逐条同步用户权限（每行一个 permission，非数组）
              for (var uid in s) {
                if (!Object.prototype.hasOwnProperty.call(s, uid)) continue;
                var perms_arr = s[uid] || [];
                for (var pj = 0; pj < perms_arr.length; pj++) {
                  var { error: permErr } = await sb.from('user_permissions').upsert({
                    user_id: toNumericId(uid), permission: perms_arr[pj]
                  }, { onConflict: 'user_id,permission' });
                  if (permErr) console.warn('[UserAdmin] 权限同步跳过:', permErr.message);
                }
              }
              console.log('[UserAdmin] Synced user permissions to Supabase');
            }
          } catch (e) { console.warn('[UserAdmin] Supabase sync failed', e.message || e); }

          if (typeof showToast === 'function') showToast('用户权限已保存','success');
          if (typeof loadUserList === 'function') loadUserList();
          closeModal();
        } catch (e) {
          console.warn('保存用户权限失败', e);
          if (typeof showToast === 'function') showToast('保存失败','error');
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