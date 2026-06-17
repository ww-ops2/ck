// 管理/调试快捷绑定：新增物品、新增账号等（本地测试用）
(function(){
  // 依赖全局函数：openModal, closeModal, loadInventory, mockData, showToast
  window.initAdminBindings = function() {
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn && !addItemBtn._bound) {
      addItemBtn._bound = true;
      addItemBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openNewItemModal();
      });
    }

    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn && !addUserBtn._bound) {
      addUserBtn._bound = true;
      addUserBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof openUserModal === 'function') openUserModal(); else addUserPrompt();
      });
    }

    // 角色卡片点击绑定：使用事件委托，让角色卡片可点击并使用统一提示/模态
    const roleList = document.getElementById('role-list');
    if (roleList && !roleList._bound) {
      roleList._bound = true;
      roleList.addEventListener('click', (ev) => {
        const card = ev.target.closest('.role-card');
        if (!card) return;
        ev.preventDefault();
        // 优先打开角色编辑模态（由 role-admin.js 提供），若不存在则使用原生编辑名称流程
        const roleKey = card.dataset.role;
        if (typeof openRoleModal === 'function' && roleKey) {
          openRoleModal(roleKey);
        } else {
          const h3 = card.querySelector('.role-header h3');
          const currentName = h3 ? h3.textContent.replace(/^\s+|\s+$/g, '') : '';
          if (typeof showPrompt === 'function') {
            showPrompt('编辑角色名称：', currentName, function(newName) {
              if (!newName) return;
              if (h3) h3.textContent = newName.trim();
              if (typeof showToast === 'function') showToast('角色名称已更新','success');
            });
          } else {
            const nn = prompt('编辑角色名称：', currentName);
            if (nn && h3) {
              h3.textContent = nn.trim();
              if (typeof showToast === 'function') showToast('角色名称已更新','success');
            }
          }
        }
      });
      // 视觉提示：光标样式
      roleList.querySelectorAll('.role-card').forEach(rc => rc.style.cursor = 'pointer');
    }
  };

  window.openNewItemModal = function() {
    const form = document.getElementById('item-form');
    if (!form) return;
    document.getElementById('modal-item-title').textContent = '新增物品';
    form.reset();
    form.elements['stock'].value = 0;
    form.elements['safety_stock'].value = 10;
    // 隐藏删除按钮（新增模式）
    var delBtn = document.getElementById('modal-item-delete-btn');
    if (delBtn) delBtn.style.display = 'none';
    // 填充品类下拉
    if (typeof _populateCategorySelect === 'function') {
      _populateCategorySelect(form.elements['category']);
    }
    openModal('modal-item');

    const saveBtn = document.querySelector('#modal-item .modal-save');
    if (!saveBtn) return;
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.addEventListener('click', async () => {
      if (typeof showButtonLoading === 'function') showButtonLoading(newSave, '保存中...');
      try {
        const name = form.elements['name'].value.trim();
        if (!name) { if (typeof showToast === 'function') showToast('请填写物品名称','warning'); else alert('请填写物品名称'); if (typeof hideButtonLoading === 'function') hideButtonLoading(newSave); return; }
        const code = form.elements['code'].value.trim() || null;
        const category = form.elements['category'].value || '未分类';
        const unit = form.elements['unit'].value || '';
        const stock = Number(form.elements['stock'].value || 0);
        const safety = Number(form.elements['safety_stock'].value || 0);
        const unitPrice = Number(form.elements['unit_price']?.value || 0);

        const newItem = {
          code: code,
          name: name,
          category_name: category,
          category: category,  // 兼容前端
          unit: unit,
          stock: stock,
          safety_stock: safety,
          unit_price: unitPrice,
          created_at: new Date().toISOString()
        };

        // 优先写入云端（SupaDB 提供的接口）
        if (typeof SupaDB !== 'undefined' && SupaDB.createInventoryItem) {
          try {
            const created = await SupaDB.createInventoryItem(newItem);
            // 更新本地缓存与 UI（乐观更新）
            try {
              const items = JSON.parse(localStorage.getItem('inventory') || '[]');
              items.unshift(created);
              localStorage.setItem('inventory', JSON.stringify(items));
            } catch(e) { console.warn('更新本地 inventory 缓存失败', e.message); }
            if (typeof loadInventory === 'function') loadInventory();
            closeModal();
            if (typeof showToast === 'function') showToast('新增物品已同步至云端','success');
            return;
          } catch (e) {
            console.warn('云端写入失败，回退到本地保存：', e.message);
            // 回退到本地存储
          }
        }

        // 若 SupaDB 不可用或云端写入失败，保存到本地（保证不丢失）
        const maxId = window.mockData && Array.isArray(window.mockData.items) ? window.mockData.items.reduce((m, it) => Math.max(m, it.id || 0), 0) : Date.now();
        const localItem = Object.assign({ id: maxId + 1, code: code || ('ITEM' + Date.now()) }, newItem);
        if (!window.mockData) window.mockData = { items: [] };
        window.mockData.items = window.mockData.items || [];
        window.mockData.items.push(localItem);
        try { localStorage.setItem('inventory', JSON.stringify(window.mockData.items)); } catch(e){console.warn('保存本地 inventory 失败', e.message)}
        if (typeof loadInventory === 'function') loadInventory();
        closeModal();
        if (typeof showToast === 'function') showToast('新增物品已保存（本地）','success');
      } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('新增失败：' + e.message, 'error'); else alert('新增失败：' + e.message);
      } finally {
        if (typeof hideButtonLoading === 'function') hideButtonLoading(newSave);
      }
    });
  };

  window.addUserPrompt = function() {
    // 使用统一的 UI 提示（showPrompt），回退到原生 prompt 仅在 showPrompt 不可用时使用。
    const askUsername = (cb) => {
      if (typeof showPrompt === 'function') return showPrompt('请输入用户名 (login id)：', '', cb);
      const u = prompt('请输入用户名 (login id)：'); if (u) cb(u); return;
    };

    askUsername(function(username){
      if (!username) return;
      const askDisplay = (cb2) => {
        if (typeof showPrompt === 'function') return showPrompt('请输入显示名称（可选）：', username, cb2);
        const d = prompt('请输入显示名称（可选）：', username); if (d!==null) cb2(d); return;
      };

      askDisplay(function(displayName){
        const askRole = (cb3) => {
          if (typeof showPrompt === 'function') return showPrompt('请输入角色 (admin/staff/purchaser)，默认 staff：', 'staff', cb3);
          const r = prompt('请输入角色 (admin/staff/purchaser)，默认 staff：', 'staff'); if (r!==null) cb3(r); return;
        };

        askRole(function(role){
          role = role || 'staff';
          const users = JSON.parse(localStorage.getItem('users') || '[]');
          const newUser = {
            id: Date.now(),
            username: username,
            name: displayName || username,
            role: role
          };
          users.push(newUser);
          localStorage.setItem('users', JSON.stringify(users));

          // 异步同步到 Supabase（若可用）
          try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (sb) {
              sb.from('users').upsert({ id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, is_active: true }, { onConflict: 'username' })
                .then(() => { console.log('[Admin] 用户已同步至 Supabase'); })
                .catch(err => { console.warn('[Admin] 用户同步失败：', err.message); });
            }
          } catch (e) { console.warn('同步用户到 Supabase 时出错', e.message); }

          if (typeof showToast === 'function') showToast('账号已创建（本地存储）','success');
          if (typeof loadUserList === 'function') loadUserList();
        });
      });
    });
  };

  // 自动初始化（如果 app.js 已就绪会在 DOMContentLoaded 后调用 initAdminBindings）
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => { if (typeof initAdminBindings === 'function') initAdminBindings(); }, 50);
  } else {
    document.addEventListener('DOMContentLoaded', () => { if (typeof initAdminBindings === 'function') initAdminBindings(); });
  }
})();
