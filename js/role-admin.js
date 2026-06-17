// Role admin: manage role-level permissions
(function(){
  const ALL_PERMISSIONS = [
    'create_purchase','edit_purchase','view_purchase','delete_purchase','confirm_stockin','confirm_stockout',
    'create_requisition','edit_requisition','withdraw_requisition','delete_requisition',
    'manage_inventory','adjust_stock','edit_inventory','manage_categories','view_inventory','export_reports','admin_settings'
  ];

  function openRoleModal(role) {
    const modal = document.getElementById('modal-role');
    if (!modal) return;
    document.getElementById('role-modal-title').textContent = `编辑角色权限：${role}`;
    const container = document.getElementById('role-permissions-list');
    container.innerHTML = ALL_PERMISSIONS.map(p => {
      return `<label style="display:block;margin:6px 0;"><input type=\"checkbox\" data-perm=\"${p}\"> ${p}</label>`;
    }).join('');
    // load existing
    let store = {};
    try { store = JSON.parse(localStorage.getItem('rolePermissions') || '{}'); } catch(e) { store = {}; }
    const existing = Array.isArray(store[role]) ? store[role] : [];
    container.querySelectorAll('input[type=checkbox]').forEach(cb => { if (existing.includes(cb.dataset.perm)) cb.checked = true; });

    // save handler
    const saveBtn = document.getElementById('save-role-perms-btn');
    if (saveBtn) {
      saveBtn._role = role;
      if (!saveBtn._bound) {
        saveBtn._bound = true;
        saveBtn.addEventListener('click', () => {
          const permChecks = Array.from(container.querySelectorAll('input[type=checkbox]'));
          const perms = permChecks.filter(c=>c.checked).map(c=>c.dataset.perm);
          try { const s = JSON.parse(localStorage.getItem('rolePermissions') || '{}'); s[saveBtn._role] = perms; localStorage.setItem('rolePermissions', JSON.stringify(s)); if (typeof showToast === 'function') showToast('角色权限已保存','success'); closeModal(); renderRoleCards(); } catch(e){ console.warn('保存角色权限失败', e); if (typeof showToast === 'function') showToast('保存失败','error'); }
        });
      }
    }

    openModal('modal-role');
  }

  function renderRoleCards() {
    const roleList = document.getElementById('role-list');
    if (!roleList) return;
    const cards = roleList.querySelectorAll('.role-card');
    cards.forEach(card => {
      const role = card.dataset.role;
      if (!role) return;
      // update permission list display
      const permContainer = card.querySelector('.role-permissions');
      const store = JSON.parse(localStorage.getItem('rolePermissions') || '{}');
      const perms = Array.isArray(store[role]) && store[role].length>0 ? store[role] : getDefaultPermsForRole(role);
      if (permContainer) {
        permContainer.innerHTML = perms.slice(0,4).map(p=>`<div class=\"permission-item\">✓ ${p}</div>`).join('') + (perms.length>4?`<div class=\"permission-item\">...等 ${perms.length} 项</div>`:'');
      }
      // show edit button
      let header = card.querySelector('.role-header');
      if (header && !header.querySelector('.role-edit-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm role-edit-btn';
        btn.textContent = '编辑';
        btn.style.marginLeft = '8px';
        btn.addEventListener('click', (e)=>{ e.stopPropagation(); openRoleModal(role); });
        header.appendChild(btn);
      }
    });
  }

  function getDefaultPermsForRole(role) {
    // mimic auth-fixed defaults
    const defs = {
      admin: ['all'],
      purchase: ['create_purchase','edit_purchase','view_purchase','view_inventory','manage_categories'],
      warehouse: ['view_purchase','confirm_stockin','confirm_stockout','adjust_stock','manage_inventory','view_inventory'],
      finance: ['view_purchase','view_inventory','export_reports'],
      staff: ['create_requisition','edit_requisition','view_inventory']
    };
    return defs[role] || defs['staff'];
  }

  function initRoleAdmin() {
    renderRoleCards();
    // expose
    window.openRoleModal = openRoleModal;
    // bind save user perms button (in modal user perms) if exists
    const saveUserPermsBtn = document.getElementById('save-user-perms-btn');
    if (saveUserPermsBtn && !saveUserPermsBtn._bound) {
      saveUserPermsBtn._bound = true;
      saveUserPermsBtn.addEventListener('click', () => {
        // handled by user-admin module via event listener attached to this button
      });
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(initRoleAdmin,50); else document.addEventListener('DOMContentLoaded', initRoleAdmin);
})();