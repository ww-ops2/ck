/**
 * Supabase ↔ localStorage 同步层 (v2.0 性能优化版)
 *
 * 核心策略：
 * 1. 页面加载：从 Supabase 并行拉取全部数据 → 写入 localStorage（本地缓存）
 * 2. 数据写入：先写 localStorage → 批量防抖 300ms → 仅推送变更记录到 Supabase
 * 3. 手动刷新：强制从 Supabase 重新拉取 → 刷新当前模块
 * 4. 初始加载保护：syncFromSupabase 期间不触发回推
 *
 * 依赖：supabase-db.js（必须先加载）
 */

// ============================================================
// 全局同步状态
// ============================================================
let _isSyncing = false;           // 初始拉取中，禁止回推
let _syncBatchTimer = null;       // 批量防抖计时器
let _pendingSyncKeys = new Set(); // 待同步的 key 集合

const SYNCABLE_KEYS = [
  'categories', 'inventory', 'purchaseOrders',
  'stockInRecords', 'requisitions', 'stockOutRecords',
  'brandHistory', 'modelHistory', 'inventoryCategories',
  'inventoryAdjustments', 'users', 'rolePermissions', 'userPermissions', 'settings',
  'consumptionStandards'
];

// 保存原始 setItem（在覆写前绑定）
const _originalSetItem = localStorage.setItem.bind(localStorage);

// ============================================================
// 1. syncFromSupabase — 从 Supabase 拉取全部数据到 localStorage
//    支持 { force: true } 强制重新拉取（刷新按钮用）
// ============================================================
async function syncFromSupabase(options) {
  options = options || {};
  if (!isSupabaseReady()) {
    console.log('[Sync] Supabase 未就绪，使用 localStorage 本地数据');
    return;
  }

  const sb = getSupabase();
  if (!sb) return;

  const isForce = options.force === true;
  const label = isForce ? '🔄 强制刷新数据...' : '🔄 从 Supabase 同步数据...';
  console.log('[Sync] ' + label);
  const startTime = Date.now();

  _isSyncing = true; // 拉取期间禁止回推

  try {
    // 并行拉取所有数据
    const [
      categoriesData,
      inventoryData,
      purchaseOrdersData,
      stockInData,
      requisitionsData,
      stockOutData,
      inventoryAdjustmentsData, usersData, rolePermsData, userPermsData, settingsData,
      consumptionStandardsData
    ] = await Promise.all([
      sb.from('categories').select('*').order('id'),
      sb.from('inventory_items').select('*').order('id'),
      sb.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false }),
      sb.from('stock_in_records').select('*, stock_in_items(*)').order('created_at', { ascending: false }),
      sb.from('requisitions').select('*, requisition_items(*)').order('created_at', { ascending: false }),
      sb.from('stock_out_records').select('*, stock_out_items(*)').order('created_at', { ascending: false }),
      sb.from('inventory_adjustments').select('*').order('created_at', { ascending: false }),
      // 可选：users 表（若已存在）
      sb.from('users').select('*').order('id'),
      // 角色权限表
      sb.from('role_permissions').select('*'),
      sb.from('user_permissions').select('*'),
      // 系统设置（可选）
      sb.from('settings').select('*'),
      // 领用标准
      sb.from('consumption_standards').select('*').order('id')
    ]);

    // 写入 localStorage（_isSyncing=true 期间不会触发回推）
    if (categoriesData.data) {
      _silentSet('categories', JSON.stringify(categoriesData.data));
      _silentSet('inventoryCategories', JSON.stringify(
        categoriesData.data.map(c => ({ code: c.code, name: c.name, created_at: c.created_at }))
      ));
      console.log('  \u2705 categories: ' + categoriesData.data.length + ' 条');
    }

    if (inventoryData.data) {
      _silentSet('inventory', JSON.stringify(inventoryData.data));
      console.log('  \u2705 inventory: ' + inventoryData.data.length + ' 条');
    }

    if (purchaseOrdersData.data) {
      const pos = purchaseOrdersData.data.map(po => ({
        ...po,
        suppliers: typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]') : (po.suppliers || []),
        items: (po.purchase_order_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(function(item) {
          return {
            id: item.id, supplier: item.supplier, category: item.category_name,
            code: item.item_code, name: item.name, brand: item.brand, model: item.model,
            quantity: Number(item.quantity), unit: item.unit,
            price: Number(item.price), amount: Number(item.amount)
          };
        })
      }));
      _silentSet('purchaseOrders', JSON.stringify(pos));
      console.log('  \u2705 purchaseOrders: ' + pos.length + ' 条');
    }

    if (stockInData.data) {
      var records = stockInData.data.map(function(rec) {
        return Object.assign({}, rec, {
          items: (rec.stock_in_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(function(item) {
            return {
              id: item.id, supplier: item.supplier, category: item.category_name,
              code: item.item_code, name: item.name, brand: item.brand, model: item.model,
              quantity: Number(item.quantity), actual_quantity: Number(item.actual_quantity),
              unit: item.unit, price: Number(item.price), amount: Number(item.amount),
              inventory_item_id: item.inventory_item_id
            };
          })
        });
      });
      _silentSet('stockInRecords', JSON.stringify(records));
      console.log('  \u2705 stockInRecords: ' + records.length + ' 条');
    }

    if (requisitionsData.data) {
      var reqs = requisitionsData.data.map(function(req) {
        return Object.assign({}, req, {
          items: (req.requisition_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(function(item) {
            return {
              id: item.id, item_id: item.inventory_item_id, name: item.name,
              code: item.code, category: item.category, unit: item.unit,
              quantity: Number(item.quantity), brand: item.brand, model: item.model
            };
          })
        });
      });
      _silentSet('requisitions', JSON.stringify(reqs));
      console.log('  \u2705 requisitions: ' + reqs.length + ' 条');
    }

    if (stockOutData.data) {
      var soRecords = stockOutData.data.map(function(rec) {
        return Object.assign({}, rec, {
          items: (rec.stock_out_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(function(item) {
            return {
              id: item.id, item_id: item.inventory_item_id, name: item.name,
              code: item.code, category: item.category, unit: item.unit,
              quantity: Number(item.quantity), requested_quantity: Number(item.requested_quantity),
              brand: item.brand, model: item.model
            };
          })
        });
      });
      _silentSet('stockOutRecords', JSON.stringify(soRecords));
      console.log('  \u2705 stockOutRecords: ' + soRecords.length + ' 条');
    }

    // ---- 库存调整：历史/手工录入 ----
    if (typeof inventoryAdjustmentsData !== 'undefined' && inventoryAdjustmentsData && inventoryAdjustmentsData.data) {
      _silentSet('inventoryAdjustments', JSON.stringify(inventoryAdjustmentsData.data));
      console.log('  \u2705 inventoryAdjustments: ' + inventoryAdjustmentsData.data.length + ' 条');
    }

    // 品牌/型号历史
    const { data: brandData } = await sb.from('item_history')
      .select('item_name, type, value')
      .eq('type', 'brand')
      .order('use_count', { ascending: false });
    const { data: modelData } = await sb.from('item_history')
      .select('item_name, type, value')
      .eq('type', 'model')
      .order('use_count', { ascending: false });

    if (brandData) {
      var brandHist = {};
      brandData.forEach(function(d) {
        if (!brandHist[d.item_name]) brandHist[d.item_name] = [];
        if (!brandHist[d.item_name].includes(d.value)) brandHist[d.item_name].push(d.value);
      });
      _silentSet('brandHistory', JSON.stringify(brandHist));
    }
    if (modelData) {
      var modelHist = {};
      modelData.forEach(function(d) {
        if (!modelHist[d.item_name]) modelHist[d.item_name] = [];
        if (!modelHist[d.item_name].includes(d.value)) modelHist[d.item_name].push(d.value);
      });
      _silentSet('modelHistory', JSON.stringify(modelHist));
    }

    // ---- 可选：用户与权限 ----
    if (usersData && usersData.data) {
      // 将云端 is_active 映射为本地 status 格式
      var mappedUsers = usersData.data.map(function(u) {
        if (u.status === undefined || u.status === null) {
          u.status = u.is_active ? 'active' : 'pending';
        }
        return u;
      });
      // 合并本地用户（尚未同步到云端的本地用户不丢失）
      try {
        var localUsers = JSON.parse(_originalGetItem('users') || '[]');
        var cloudUsernames = mappedUsers.map(function(u) { return u.username; });
        var localOnly = localUsers.filter(function(u) {
          return cloudUsernames.indexOf(u.username) === -1;
        });
        if (localOnly.length > 0) {
          mappedUsers = mappedUsers.concat(localOnly);
          console.log('  \uD83D\uDD00 合并 ' + localOnly.length + ' 条本地用户（云端未同步）');
        }
      } catch(e) { /* 合并失败则使用云端数据 */ }
      _silentSet('users', JSON.stringify(mappedUsers));
      console.log('  \u2705 users: ' + mappedUsers.length + ' 条');
    }

    if (rolePermsData && rolePermsData.data) {
      // 将 role_permissions 转换为 rolePermissions 对象 { role: [perm,...] }
      var rp = {};
      rolePermsData.data.forEach(function(r) { if (!rp[r.role]) rp[r.role] = []; rp[r.role].push(r.permission); });
      _silentSet('rolePermissions', JSON.stringify(rp));
      console.log('  \u2705 role_permissions: ' + rolePermsData.data.length + ' 条');
    }

    if (userPermsData && userPermsData.data) {
      var up = {};
      userPermsData.data.forEach(function(u) { if (!up[u.user_id]) up[u.user_id] = []; up[u.user_id].push(u.permission); });
      _silentSet('userPermissions', JSON.stringify(up));
      console.log('  \u2705 user_permissions: ' + userPermsData.data.length + ' 条');
    }

    if (settingsData && settingsData.data) {
      _silentSet('settings', JSON.stringify(settingsData.data));
      console.log('  \u2705 settings: ' + settingsData.data.length + ' 条');
    }

    if (consumptionStandardsData && consumptionStandardsData.data) {
      _silentSet('consumptionStandards', JSON.stringify(consumptionStandardsData.data));
      console.log('  \u2705 consumptionStandards: ' + consumptionStandardsData.data.length + ' 条');
    }

    var elapsed = Date.now() - startTime;
    console.log('[Sync] \u2705 同步完成 (' + elapsed + 'ms)');

    // 同步完成后刷新通知徽章
    try { if (typeof checkNotifications === 'function') checkNotifications(); } catch(e) {}

  } catch (err) {
    console.error('[Sync] \u274c 同步失败:', err.message);
    console.log('[Sync] 回退到 localStorage 本地数据');
  } finally {
    _isSyncing = false; // 恢复回推
  }
}

/** 内部：静默写入 localStorage，不触发同步 */
function _silentSet(key, value) {
  _originalSetItem(key, value);
}

// ============================================================
// 2. localStorage.setItem 覆写 — 批量防抖 + 初始加载保护
// ============================================================
localStorage.setItem = function(key, value) {
  _originalSetItem(key, value);

  // 初始拉取期间 → 不回推（_isSyncing 为 true 时静默跳过）
  if (_isSyncing) return;
  if (!SYNCABLE_KEYS.includes(key)) return;

  _pendingSyncKeys.add(key);

  // 300ms 防抖：合并同一次操作内的多次写入
  if (_syncBatchTimer) clearTimeout(_syncBatchTimer);
  _syncBatchTimer = setTimeout(function() {
    var keys = Array.from(_pendingSyncKeys);
    _pendingSyncKeys.clear();
    _syncBatchTimer = null;
    _batchSyncToSupabase(keys);
  }, 100);  // 100ms 防抖，接近实时同步
};

// ============================================================
// 3. 批量推送 — 一次操作只触发一轮同步
// ============================================================
async function _batchSyncToSupabase(keys) {
  var sb = getSupabase();
  if (!sb) return;

  var t0 = Date.now();
  try {
    for (var i = 0; i < keys.length; i++) {
      await syncToSupabase(keys[i]);
    }
    var elapsed = Date.now() - t0;
    console.log('[Sync] 📦 批量同步 ' + keys.join(', ') + ' → Supabase ✅ (' + elapsed + 'ms)');
    // 静默成功，仅关键操作弹提示
    if (typeof showToast === 'function') {
      var userKeys = keys.filter(function(k) {
        return ['users', 'purchaseOrders', 'requisitions', 'stockInRecords', 'stockOutRecords', 'inventory'].indexOf(k) !== -1;
      });
      if (userKeys.length > 0 && elapsed > 200) {
        showToast('数据已同步至云端', 'success');
      }
    }
  } catch (err) {
    console.warn('[Sync] 📦 批量同步失败:', err.message);
    if (typeof showToast === 'function') {
      showToast('部分数据同步异常，请稍后刷新重试', 'warning');
    }
  }
}

// ============================================================
// 4. syncToSupabase — 增量同步（只推送变更记录）
// ============================================================
async function syncToSupabase(key) {
  var sb = getSupabase();
  if (!sb) return;

  try {
    var raw = _originalGetItem(key);
    if (!raw) return;
    var data = JSON.parse(raw);

    switch (key) {

      // ---- 品类：数据量小，全量 upsert ----
      case 'categories':
        for (var c = 0; c < data.length; c++) {
          await sb.from('categories').upsert(
            { code: data[c].code, name: data[c].name, remark: data[c].remark || '' },
            { onConflict: 'code' }
          );
        }
        break;

      // ---- 库存物品：全量 upsert（upsert 自动处理新增/更新）----
      case 'inventory':
        for (var j = 0; j < data.length; j++) {
          var item = data[j];
          await sb.from('inventory_items').upsert({
            code: item.code, name: item.name, brand: item.brand || '',
            model: item.model || '', category_name: item.category || '未分类',
            stock: item.stock || 0, unit: item.unit || '',
            safety_stock: item.safety_stock || 10,
            last_stockin_date: item.last_stockin_date || null,
            last_stockin_batch: item.last_stockin_batch || null,
            source: item.source || null
          }, { onConflict: 'code' });
        }
        break;

      // ---- 采购单：增量检测 — 只同步新增/变更的记录 ----
      case 'purchaseOrders':
        var poSnapshotKey = '_syncSnapshot_purchaseOrders';
        var oldPOs = _getSnapshot(poSnapshotKey);
        var changedPOs = _detectChanges(data, oldPOs, 'code');
        if (changedPOs.length === 0 && oldPOs !== null) {
          console.log('[Sync]   purchaseOrders: 无变更，跳过');
          break;
        }
        var poToSync = (oldPOs !== null && changedPOs.length < data.length) ? changedPOs : data;
        for (var p = 0; p < poToSync.length; p++) {
          await _upsertPurchaseOrder(sb, poToSync[p]);
        }
        _saveSnapshot(poSnapshotKey, data);
        break;

      // ---- 入库记录：仅插入新记录（不可变） ----
      case 'stockInRecords':
        for (var s = 0; s < data.length; s++) {
          await _insertIfNewStockIn(sb, data[s]);
        }
        break;

      // ---- 领用单：增量检测 ----
      case 'requisitions':
        var reqSnapshotKey = '_syncSnapshot_requisitions';
        var oldReqs = _getSnapshot(reqSnapshotKey);
        var changedReqs = _detectChanges(data, oldReqs, 'code');
        if (changedReqs.length === 0 && oldReqs !== null) {
          console.log('[Sync]   requisitions: 无变更，跳过');
          break;
        }
        var reqToSync = (oldReqs !== null && changedReqs.length < data.length) ? changedReqs : data;
        for (var r = 0; r < reqToSync.length; r++) {
          await _upsertRequisition(sb, reqToSync[r]);
        }
        _saveSnapshot(reqSnapshotKey, data);
        break;

      // ---- 出库记录：仅插入新记录（不可变） ----
      case 'stockOutRecords':
        for (var o = 0; o < data.length; o++) {
          await _insertIfNewStockOut(sb, data[o]);
        }
        break;

      // ---- 库存调整（历史/手工） ----
      case 'inventoryAdjustments':
        // 插入或 upsert 调整记录（按 id 唯一）
        for (var a = 0; a < data.length; a++) {
          try {
            await sb.from('inventory_adjustments').upsert(data[a], { onConflict: 'id' });
          } catch (e) {
            try { await sb.from('inventory_adjustments').insert(data[a]); } catch (e2) { /* 忽略 */ }
          }
        }
        break;

      // ---- 品牌/型号历史 ----
      case 'brandHistory':
      case 'modelHistory':
        var histType = key === 'brandHistory' ? 'brand' : 'model';
        var entries = Object.entries(data);
        for (var h = 0; h < entries.length; h++) {
          var itemName = entries[h][0];
          var values = entries[h][1];
          for (var v = 0; v < values.length; v++) {
            await sb.from('item_history').upsert(
              { item_name: itemName, type: histType, value: values[v], use_count: 1 },
              { onConflict: 'item_name,type,value' }
            );
          }
        }
        break;

      // ---- 角色权限 ----
      case 'rolePermissions':
        var rpObj = data || {};
        for (var role in rpObj) {
          if (!Object.prototype.hasOwnProperty.call(rpObj, role)) continue;
          var perms = rpObj[role] || [];
          for (var i = 0; i < perms.length; i++) {
            await sb.from('role_permissions').upsert({ role: role, permission: perms[i] }, { onConflict: 'role,permission' });
          }
        }
        break;

      // ---- 用户权限 ----
      case 'userPermissions':
        var upObj = data || {};
        for (var uid in upObj) {
          if (!Object.prototype.hasOwnProperty.call(upObj, uid)) continue;
          var perms = upObj[uid] || [];
          for (var j = 0; j < perms.length; j++) {
            var nuid = parseInt(uid, 10);
            if (isNaN(nuid) && typeof uid === 'string' && uid.charAt(0) === 'u') nuid = Number(uid.substring(1));
            await sb.from('user_permissions').upsert({ user_id: isNaN(nuid) ? uid : nuid, permission: perms[j] }, { onConflict: 'user_id,permission' });
          }
        }
        break;

      // ---- 用户表 — 仅同步基础字段 + is_active ----
      case 'users':
        for (var u = 0; u < data.length; u++) {
          var uu = data[u];
          await sb.from('users').upsert({
            id: typeof uu.id === 'string' && uu.id.charAt(0) === 'u' ? Number(uu.id.substring(1)) : uu.id,
            username: uu.username,
            name: uu.name,
            role: uu.role,
            is_active: (uu.status === 'active')
          }, { onConflict: 'username' });
        }
        break;

      // ---- 系统设置 ----
      case 'settings':
        if (Array.isArray(data)) {
          for (var s = 0; s < data.length; s++) {
            var it = data[s];
            if (it && it.key) {
              await sb.from('settings').upsert({ key: it.key, value: it.value }, { onConflict: 'key' });
            }
          }
        }
        break;

      // ---- 领用标准 ----
      case 'consumptionStandards':
        if (Array.isArray(data)) {
          for (var cs = 0; cs < data.length; cs++) {
            var std = data[cs];
            await sb.from('consumption_standards').upsert({
              id: std.id,
              item_name: std.item_name,
              scenario: std.scenario || '通用',
              max_per_tour: std.max_per_tour || 0,
              category: std.category || ''
            }, { onConflict: 'id' });
          }
        }
        break;
    }

    console.log('[Sync]   ' + key + ' \u2192 Supabase \u2705');
  } catch (err) {
    console.warn('[Sync]   ' + key + ' \u2192 Supabase \u274c', err.message);
  }
}

// ============================================================
// 5. 增量检测辅助函数
// ============================================================

/** 从内存快照获取旧数据 */
function _getSnapshot(snapshotKey) {
  try {
    var raw = window[snapshotKey];
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** 保存快照到内存 */
function _saveSnapshot(snapshotKey, data) {
  try { window[snapshotKey] = JSON.stringify(data); } catch (e) {}
}

/** 检测新增或变更的记录（通过 code 匹配 + JSON 比较） */
function _detectChanges(newArr, oldArr, keyField) {
  if (!oldArr || oldArr.length === 0) return newArr;
  var oldMap = {};
  for (var i = 0; i < oldArr.length; i++) {
    oldMap[oldArr[i][keyField]] = JSON.stringify(oldArr[i]);
  }
  var changed = [];
  for (var j = 0; j < newArr.length; j++) {
    var k = newArr[j][keyField];
    if (!oldMap[k] || oldMap[k] !== JSON.stringify(newArr[j])) {
      changed.push(newArr[j]);
    }
  }
  return changed;
}

/** 安全读取 localStorage（绕过覆写） */
function _originalGetItem(key) {
  return localStorage.getItem(key);
}

// ============================================================
// 6. 单记录操作封装
// ============================================================

/** 采购单 upsert */
async function _upsertPurchaseOrder(sb, po) {
  var existing = await sb.from('purchase_orders').select('id').eq('code', po.code).single();
  if (existing.data) {
    await sb.from('purchase_orders').update({
      purchase_date: po.purchase_date, purchaser: po.purchaser,
      suppliers: JSON.stringify(po.suppliers || []),
      total_amount: po.total_amount || 0,
      status: po.status, remark: po.remark || ''
    }).eq('id', existing.data.id);
    await sb.from('purchase_order_items').delete().eq('purchase_order_id', existing.data.id);
    if (po.items && po.items.length > 0) {
      await sb.from('purchase_order_items').insert(
        po.items.map(function(item, idx) {
          return {
            purchase_order_id: existing.data.id,
            supplier: item.supplier || '', category_name: item.category || '',
            item_code: item.code || '', name: item.name,
            brand: item.brand || '', model: item.model || '',
            quantity: item.quantity || 0, unit: item.unit || '',
            price: item.price || 0, amount: item.amount || 0,
            sort_order: idx
          };
        })
      );
    }
  } else {
    var result = await sb.from('purchase_orders').insert({
      code: po.code, purchase_date: po.purchase_date,
      purchaser: po.purchaser,
      suppliers: JSON.stringify(po.suppliers || []),
      total_amount: po.total_amount || 0,
      status: po.status || 'pending_stockin',
      remark: po.remark || '',
      created_by_name: po.purchaser || '',
      created_at: po.created_at
    }).select().single();
    if (result.data && po.items && po.items.length > 0) {
      await sb.from('purchase_order_items').insert(
        po.items.map(function(item, idx) {
          return {
            purchase_order_id: result.data.id,
            supplier: item.supplier || '', category_name: item.category || '',
            item_code: item.code || '', name: item.name,
            brand: item.brand || '', model: item.model || '',
            quantity: item.quantity || 0, unit: item.unit || '',
            price: item.price || 0, amount: item.amount || 0,
            sort_order: idx
          };
        })
      );
    }
  }
}

/** 入库记录：仅插入新记录 */
async function _insertIfNewStockIn(sb, rec) {
  var existing = await sb.from('stock_in_records').select('id').eq('code', rec.code).single();
  if (existing.data) return; // 已存在，跳过
  var result = await sb.from('stock_in_records').insert({
    code: rec.code,
    purchase_order_code: rec.purchase_order_code || '',
    stockin_date: rec.stockin_date,
    batch_code: rec.batch_code || '',
    total_quantity: rec.total_quantity || 0,
    total_amount: rec.total_amount || 0,
    status: rec.status || 'completed',
    confirmed_by: rec.confirmed_by || '',
    confirmed_at: rec.confirmed_at || null,
    remark: rec.remark || '',
    created_at: rec.created_at
  }).select().single();
  if (result.data && rec.items && rec.items.length > 0) {
    await sb.from('stock_in_items').insert(
      rec.items.map(function(item, idx) {
        return {
          stock_in_record_id: result.data.id,
          supplier: item.supplier || '', category_name: item.category || '',
          item_code: item.code || '', name: item.name,
          brand: item.brand || '', model: item.model || '',
          quantity: item.quantity || 0,
          actual_quantity: item.actual_quantity || 0,
          unit: item.unit || '',
          price: item.price || 0,
          amount: (item.actual_quantity || 0) * (item.price || 0),
          sort_order: idx
        };
      })
    );
  }
}

/** 领用单 upsert */
async function _upsertRequisition(sb, req) {
  var existing = await sb.from('requisitions').select('id').eq('code', req.code).single();
  if (existing.data) {
    await sb.from('requisitions').update({
      tour_date: req.tour_date, tour_name: req.tour_name,
      scenario: req.scenario || '', applicant: req.applicant,
      apply_date: req.apply_date,
      total_quantity: req.total_quantity || 0,
      status: req.status, remark: req.remark || ''
    }).eq('id', existing.data.id);
    await sb.from('requisition_items').delete().eq('requisition_id', existing.data.id);
    if (req.items && req.items.length > 0) {
      await sb.from('requisition_items').insert(
        req.items.map(function(item, idx) {
          return {
            requisition_id: existing.data.id,
            inventory_item_id: item.item_id || null,
            name: item.name, code: item.code || '',
            category: item.category || '', unit: item.unit || '',
            quantity: item.quantity || 0,
            brand: item.brand || '', model: item.model || '',
            sort_order: idx
          };
        })
      );
    }
  } else {
    var result = await sb.from('requisitions').insert({
      code: req.code, tour_date: req.tour_date,
      tour_name: req.tour_name, scenario: req.scenario || '',
      applicant: req.applicant, apply_date: req.apply_date,
      total_quantity: req.total_quantity || 0,
      status: req.status || 'pending_outbound',
      remark: req.remark || '',
      created_by_name: req.applicant || '',
      created_at: req.created_at
    }).select().single();
    if (result.data && req.items && req.items.length > 0) {
      await sb.from('requisition_items').insert(
        req.items.map(function(item, idx) {
          return {
            requisition_id: result.data.id,
            inventory_item_id: item.item_id || null,
            name: item.name, code: item.code || '',
            category: item.category || '', unit: item.unit || '',
            quantity: item.quantity || 0,
            brand: item.brand || '', model: item.model || '',
            sort_order: idx
          };
        })
      );
    }
  }
}

/** 出库记录：仅插入新记录 */
async function _insertIfNewStockOut(sb, rec) {
  var existing = await sb.from('stock_out_records').select('id').eq('code', rec.code).single();
  if (existing.data) return;
  var result = await sb.from('stock_out_records').insert({
    code: rec.code,
    requisition_code: rec.requisition_code || '',
    tour_date: rec.tour_date || null,
    tour_name: rec.tour_name || '',
    scenario: rec.scenario || '',
    stockout_date: rec.stockout_date,
    total_quantity: rec.total_quantity || 0,
    status: rec.status || 'completed',
    confirmed_by: rec.confirmed_by || '',
    confirmed_at: rec.confirmed_at || null,
    created_at: rec.created_at
  }).select().single();
  if (result.data && rec.items && rec.items.length > 0) {
    await sb.from('stock_out_items').insert(
      rec.items.map(function(item, idx) {
        return {
          stock_out_record_id: result.data.id,
          inventory_item_id: item.item_id || null,
          name: item.name, code: item.code || '',
          category: item.category || '', unit: item.unit || '',
          quantity: item.quantity || 0,
          requested_quantity: item.requested_quantity || item.quantity || 0,
          brand: item.brand || '', model: item.model || '',
          sort_order: idx
        };
      })
    );
  }
}

// ============================================================
// 7. 辅助函数
// ============================================================

/** 等待同步完成 */
function waitForSupabaseSync() {
  return Promise.resolve();
}
