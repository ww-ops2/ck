/**
 * Supabase 数据访问层
 * 替代 localStorage，所有数据持久化通过 Supabase PostgreSQL 完成
 * 依赖: @supabase/supabase-js (通过 CDN 加载)
 */

// ============================================================
// 配置
// ============================================================
const SUPABASE_URL = 'https://vhnvjaghlvoqdgssidjw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z06qPVHQAOHZuNiSxHXOyw_IL2-G7Bf';

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error('Supabase client not loaded. Check CDN script.');
      return null;
    }
  }
  return _supabase;
}

// ============================================================
// 通用辅助函数
// ============================================================

/** 安全调用 Supabase，统一错误处理 */
async function _sbQuery(promiseFn) {
  const { data, error } = await promiseFn;
  if (error) {
    console.error('Supabase error:', error.message, error.details);
    throw new Error(error.message);
  }
  return data;
}

/** 写审计日志 */
async function writeAuditLog(action, entityType, entityId, entityCode, details) {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const { error } = await sb.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: _numOrNull(entityId),
      entity_code: entityCode || '',
      details: details ? JSON.stringify(details) : null,
      // v5.43：补上 user_id，让「操作记录」能与「账号管理」真正勾稽
      user_id: u ? _numOrNull(u.id) : null,
      user_name: u ? u.name : 'system',
      user_role: u ? u.role : 'system'
    });
    if (error) console.warn('[Audit] 审计日志写入失败:', error.message);
  } catch (e) {
    console.warn('[Audit] 审计日志异常:', e.message);
  }
}

/** 获取下一个自增编码 */
async function getNextCode(seqType, prefix, padLen) {
  padLen = padLen || 5;
  const sb = getSupabase();
  const { data, error } = await sb.rpc('next_code', {
    seq_type: seqType, prefix: prefix, pad_len: padLen
  });
  if (error) throw new Error('编码生成失败: ' + error.message);
  return data;
}

// ============================================================
// v5.43 新增辅助：品类映射 / 入库同步 / 金额计算
// ============================================================

/**
 * 规范化明细金额：amount 缺失或为 0 时按 数量×单价 补算
 * 保证「单价 → 明细金额 → 表头合计」链路连贯
 */
function _normalizeAmounts(items) {
  if (!items || !items.length) return [];
  return items.map(function (it) {
    const o = Object.assign({}, it);
    const qty = Number(o.quantity) || 0;
    const price = Number(o.price) || 0;
    let amount = Number(o.amount) || 0;
    if (amount <= 0 && qty > 0 && price > 0) amount = Number((qty * price).toFixed(2));
    // 反向补：有金额有数量但无单价时，反推单价
    if (price <= 0 && amount > 0 && qty > 0) o.price = Number((amount / qty).toFixed(4));
    o.quantity = qty;
    o.amount = amount;
    return o;
  });
}

/** 转为数字主键，非法值返回 null（避免把 'admin' 这类字符串塞进 BIGINT 列） */
function _numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 汇总明细金额 */
function _sumAmount(items) {
  if (!items || !items.length) return 0;
  return Number(items.reduce(function (s, i) { return s + (Number(i.amount) || 0); }, 0).toFixed(2));
}

/** 品类名 → id 映射缓存 */
let _catMapCache = null;

/** 清空品类缓存（品类增删改后调用） */
function _invalidateCategoryCache() { _catMapCache = null; }

/** 按品类名取 category_id，找不到返回 null */
async function _getCategoryIdByName(name) {
  if (!name) return null;
  const sb = getSupabase();
  if (!sb) return null;
  if (!_catMapCache) {
    const { data } = await sb.from('categories').select('id, name');
    _catMapCache = {};
    (data || []).forEach(c => { _catMapCache[c.name] = c.id; });
  }
  return _catMapCache[name] || null;
}

/**
 * 入库时同步库存物品：更新或创建，并回写 category_id / unit_price
 * 单价采用移动加权平均，保证金额链路连贯
 * @returns {Promise<number|null>} 库存物品 id（供 stock_in_items 回写外键）
 */
async function _syncInventoryOnStockIn(item, stockInData) {
  const sb = getSupabase();
  const actualQty = Number(item.actual_quantity) || 0;
  const price = Number(item.price) || 0;
  const catId = await _getCategoryIdByName(item.category || item.category_name);

  let invItems = [];
  if (item.code) {
    invItems = await _sbQuery(
      sb.from('inventory_items').select('*').eq('code', item.code).limit(1)
    );
  }
  if (invItems.length === 0 && item.name) {
    invItems = await _sbQuery(
      sb.from('inventory_items').select('*').eq('name', item.name).limit(1)
    );
  }

  if (invItems.length > 0) {
    const inv = invItems[0];
    const oldStock = Number(inv.stock) || 0;
    const upd = {
      stock: oldStock + actualQty,
      last_stockin_date: stockInData.stockin_date,
      last_stockin_batch: stockInData.batch_code
    };
    // 补齐历史缺失的品类外键
    if (!inv.category_id && catId) upd.category_id = catId;
    // 金额链路：入库价有效时用移动加权平均更新单价
    if (price > 0) {
      const oldPrice = Number(inv.unit_price) || 0;
      const newTotal = oldStock + actualQty;
      upd.unit_price = (oldStock > 0 && oldPrice > 0 && newTotal > 0)
        ? Number((((oldStock * oldPrice) + (actualQty * price)) / newTotal).toFixed(4))
        : price;
    }
    const { error } = await sb.from('inventory_items').update(upd).eq('id', inv.id);
    if (error) console.warn('[StockIn] 库存更新失败:', error.message);
    return inv.id;
  }

  // 自动创建库存物品
  // 编号统一：与「库存物品新增」走同一序列 item_code / 同一前缀 SKU，避免撞号
  const autoCode = item.code || await getNextCode('item_code', 'SKU', 5);
  const { data: created, error: cErr } = await sb.from('inventory_items').insert({
    name: item.name,
    code: autoCode,
    category_id: catId,
    category_name: item.category || item.category_name || '未分类',
    brand: item.brand || '',
    model: item.model || '',
    unit: item.unit || '',
    stock: actualQty,
    safety_stock: 10,
    unit_price: price,
    last_stockin_date: stockInData.stockin_date,
    last_stockin_batch: stockInData.batch_code
  }).select().single();
  if (cErr) { console.warn('[StockIn] 自动建档失败:', cErr.message); return null; }
  console.log('[StockIn] 自动创建库存物品:', item.name, 'code=' + autoCode);
  return created ? created.id : null;
}

/**
 * 解析出库明细对应的库存物品 id
 * 优先用领用单带的 item_id，为空时按 code → name 反查，都找不到返回 null
 */
async function _resolveInventoryId(item) {
  if (item.item_id) return item.item_id;
  if (item.inventory_item_id) return item.inventory_item_id;
  const sb = getSupabase();
  if (!sb) return null;
  let r = [];
  if (item.code) {
    r = await _sbQuery(sb.from('inventory_items').select('id').eq('code', item.code).limit(1));
  }
  if ((!r || r.length === 0) && item.name) {
    r = await _sbQuery(sb.from('inventory_items').select('id').eq('name', item.name).limit(1));
  }
  return (r && r.length) ? r[0].id : null;
}

/**
 * 更新采购单状态，兼容线上 CHECK 约束尚未放宽的情况
 * 若 partially_stockin 被约束拒绝，自动降级为 pending_stockin 并给出提示
 */
async function _updatePOStatus(orderId, status) {
  const sb = getSupabase();
  const { error } = await sb.from('purchase_orders').update({ status }).eq('id', orderId);
  if (!error) return status;
  // 23514 = check_violation：线上约束未包含该状态，降级处理保证流程不中断
  if (status === 'partially_stockin') {
    console.warn('[StockIn] 数据库未接受 partially_stockin，降级为 pending_stockin。' +
      '请执行 database/migrations/20260806_v5.43_fullfix.sql 放宽约束。');
    window.__SCHEMA_OUTDATED = true;
    const { error: e2 } = await sb.from('purchase_orders')
      .update({ status: 'pending_stockin' }).eq('id', orderId);
    if (e2) throw new Error('采购单状态更新失败: ' + e2.message);
    return 'pending_stockin';
  }
  throw new Error('采购单状态更新失败: ' + error.message);
}

/**
 * 更新领用单状态，约束未放宽时降级到兼容值
 * @param {string} want 期望状态  @param {string} fallback 降级状态
 */
async function _updateReqStatus(reqId, want, fallback, extra) {
  const sb = getSupabase();
  const hasExtra = extra && Object.keys(extra).length > 0;

  // 依次尝试：期望状态+附加列 → 期望状态 → 降级状态+附加列 → 降级状态
  const attempts = [];
  attempts.push({ st: want, payload: Object.assign({ status: want }, extra || {}) });
  if (hasExtra) attempts.push({ st: want, payload: { status: want }, stripped: true });
  if (fallback && fallback !== want) {
    attempts.push({ st: fallback, payload: Object.assign({ status: fallback }, extra || {}), degraded: true });
    if (hasExtra) attempts.push({ st: fallback, payload: { status: fallback }, degraded: true, stripped: true });
  }

  let lastErr = null;
  for (const a of attempts) {
    const { error } = await sb.from('requisitions').update(a.payload).eq('id', reqId);
    if (!error) {
      if (a.stripped) {
        console.warn('[Requisition] 数据库缺少审核字段(approved_by/approved_at/reject_reason)，' +
          '本次仅更新状态。请执行 database/migrations/20260806_v5.43_fullfix.sql。');
        if (typeof window !== 'undefined') window.__SCHEMA_OUTDATED = true;
      }
      if (a.degraded) {
        console.warn('[Requisition] 数据库未接受状态 ' + want + '，降级为 ' + a.st +
          '。请执行 database/migrations/20260806_v5.43_fullfix.sql 放宽约束。');
        if (typeof window !== 'undefined') window.__SCHEMA_OUTDATED = true;
      }
      return a.st;
    }
    lastErr = error;
    // 只有「约束冲突 23514」和「列不存在 42703 / PGRST204」才值得继续降级重试
    const c = String(error.code || '');
    if (c !== '23514' && c !== '42703' && c !== 'PGRST204') break;
  }
  throw new Error('领用单状态更新失败: ' + (lastErr && lastErr.message));
}

// ============================================================
// 1. 用户 / 认证
// ============================================================
const SupaDB = {

  // ---- 认证 ----
  async signIn(role) {
    // 从 users 表查找对应角色的用户
    const sb = getSupabase();
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('role', role)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }
    return {
      id: data.id,
      username: data.username,
      name: data.name,
      role: data.role
    };
  },

  // ---- 权限（v5.43：权限体系接入数据库）----
  /**
   * 读取用户的有效权限清单
   * 优先级：user_permissions（管理员为该用户单独配置） > role_permissions（角色默认） > 空
   * @returns {Promise<{permissions: string[], source: 'user'|'role'|'none'}>}
   */
  async getEffectivePermissions(userId, role) {
    const sb = getSupabase();
    if (!sb) return { permissions: [], source: 'none' };

    // 1. 个性化权限优先（管理员在「账号管理」中为该用户单独勾选的）
    if (userId !== undefined && userId !== null && userId !== '') {
      let uid = userId;
      if (typeof uid === 'string' && /^\d+$/.test(uid)) uid = parseInt(uid, 10);
      if (typeof uid === 'number' && !isNaN(uid)) {
        const { data: up, error: upErr } = await sb
          .from('user_permissions').select('permission').eq('user_id', uid);
        if (!upErr && up && up.length > 0) {
          return { permissions: up.map(r => r.permission), source: 'user' };
        }
      }
    }

    // 2. 角色默认权限
    if (role) {
      const { data: rp, error: rpErr } = await sb
        .from('role_permissions').select('permission').eq('role', role);
      if (!rpErr && rp && rp.length > 0) {
        return { permissions: rp.map(r => r.permission), source: 'role' };
      }
    }

    return { permissions: [], source: 'none' };
  },

  /** 按用户名精确查询单个用户（登录时取真实 id，供权限查询用） */
  async getUserByUsername(username) {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('users').select('*').eq('username', username).limit(1);
    if (error || !data || !data.length) return null;
    const u = data[0];
    if (u.status === undefined || u.status === null) {
      u.status = u.is_active ? 'active' : 'pending';
    }
    return u;
  },

  /** 读取全部角色默认权限，返回 { role: [perm...] } */
  async getRolePermissionMap() {
    const sb = getSupabase();
    if (!sb) return {};
    const { data, error } = await sb.from('role_permissions').select('*');
    if (error || !data) return {};
    const map = {};
    data.forEach(r => {
      if (!map[r.role]) map[r.role] = [];
      map[r.role].push(r.permission);
    });
    return map;
  },

  // ---- 用户管理 ----
  async createUser(userData) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');
    // 云端 users 表仅有基础字段 + is_active，status 映射为 is_active
    // 兼容旧 'u' 前缀 ID → 纯数字
    var safeId = userData.id;
    if (typeof safeId === 'string' && safeId.charAt(0) === 'u') {
      var n = Number(safeId.substring(1));
      if (!isNaN(n)) safeId = n;
    }
    const { data, error } = await sb
      .from('users')
      .upsert({
        id: safeId,
        username: userData.username,
        name: userData.name || userData.username,
        role: userData.role || 'staff',
        is_active: userData.status === 'active'
      }, { onConflict: 'username' })
      .select()
      .single();
    if (error) throw new Error('用户创建失败: ' + error.message);
    // 创建成功后再尝试写入扩展信息（如表结构不支持则静默跳过）
    const { error: extError } = await sb.from('users').update({
      description: userData.description || '',
      created_at: userData.created_at || new Date().toISOString()
    }).eq('id', data.id);
    if (extError) console.warn('[Supabase] 用户扩展列更新跳过:', extError.message);
    await writeAuditLog('CREATE', 'users', data.id, data.username, userData);
    return data;
  },

  async getUsers() {
    const sb = getSupabase();
    const data = await _sbQuery(
      sb.from('users').select('*').order('id', { ascending: true })
    );
    // 转换 is_active → status，兼容本地 localStorage 格式
    return (data || []).map(function(u) {
      if (u.status === undefined || u.status === null) {
        u.status = u.is_active ? 'active' : 'pending';
      }
      return u;
    });
  },

  async updateUser(username, updates) {
    const sb = getSupabase();
    // 映射 status → is_active，同时保留 status 字段
    var cloudUpdates = {};
    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        if (key === 'status') {
          cloudUpdates.is_active = (updates[key] === 'active');
          cloudUpdates.status = updates[key]; // 也存储原始 status
        } else {
          cloudUpdates[key] = updates[key];
        }
      }
    }

    // 先尝试批量更新（含 status 列）
    var { data, error } = await sb
      .from('users')
      .update(cloudUpdates)
      .eq('username', username)
      .select();

    // 如果 status 列不存在导致失败，去掉 status 重试
    if (error && error.message && error.message.indexOf('status') >= 0) {
      delete cloudUpdates.status;
      var retry = await sb
        .from('users')
        .update(cloudUpdates)
        .eq('username', username)
        .select();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw new Error('用户更新失败: ' + error.message);
    var updatedId = (data && data.length > 0) ? data[0].id : null;
    await writeAuditLog('UPDATE', 'users', updatedId, username, updates);
    return data;
  },

  async deleteUser(username) {
    const sb = getSupabase();
    const { error } = await sb.from('users').delete().eq('username', username);
    if (error) throw new Error('用户删除失败: ' + error.message);
    await writeAuditLog('DELETE', 'users', null, username);
  },

  // ---- 品类管理 ----
  async getCategories() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('categories').select('*').order('id', { ascending: true })
    );
  },

  async createCategory(name) {
    const sb = getSupabase();
    const code = await getNextCode('category_code', 'CAT', 3);
    const { data, error } = await sb
      .from('categories')
      .insert({ code, name, remark: '' })
      .select()
      .single();
    if (error) throw new Error('品类创建失败: ' + error.message);
    _invalidateCategoryCache();
    await writeAuditLog('CREATE', 'categories', data.id, data.code, { name });
    return data;
  },

  async updateCategory(id, newName) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('categories')
      .update({ name: newName })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error('品类更新失败: ' + error.message);
    _invalidateCategoryCache();
    await writeAuditLog('UPDATE', 'categories', id, data.code, { name: newName });
    return data;
  },

  async deleteCategory(id) {
    const sb = getSupabase();
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) throw new Error('品类删除失败: ' + error.message);
    _invalidateCategoryCache();
    await writeAuditLog('DELETE', 'categories', id);
  },

  // ---- 团期名称主数据 ----
  async getTourNames() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('tour_names').select('*').order('name')
    );
  },

  async createTourName(name) {
    const sb = getSupabase();
    const code = 'TN' + String(Date.now()).slice(-6);
    const { data, error } = await sb
      .from('tour_names')
      .insert({ code, name: name, remark: '', created_by: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.name || '') : '' })
      .select()
      .single();
    if (error) throw new Error('团期名称创建失败: ' + error.message);
    await writeAuditLog('CREATE', 'tour_names', data.id, data.code, { name });
    return data;
  },

  async deleteTourName(id) {
    const sb = getSupabase();
    const { error } = await sb.from('tour_names').delete().eq('id', id);
    if (error) throw new Error('团期名称删除失败: ' + error.message);
    await writeAuditLog('DELETE', 'tour_names', id);
  },

  // ---- 库存物品 ----
  async getInventory(filters) {
    filters = filters || {};
    const sb = getSupabase();
    let query = sb.from('inventory_items').select('*');

    if (filters.category) query = query.eq('category_name', filters.category);
    if (filters.status) {
      // status: 'normal', 'low', 'out' — 在应用层过滤
    }

    const items = await _sbQuery(query.order('category_name').order('name'));

    if (filters.status) {
      return items.filter(item => {
        const s = item.stock;
        const ss = item.safety_stock || 10;
        if (filters.status === 'out') return s === 0;
        if (filters.status === 'low') return s > 0 && s < ss;
        if (filters.status === 'normal') return s >= ss;
        return true;
      });
    }
    return items;
  },

  async getInventoryItem(id) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('inventory_items').select('*').eq('id', id).single()
    );
  },

  async updateInventoryItem(id, updates) {
    const sb = getSupabase();
    // 安全列白名单：过滤掉数据库中不存在的列（如 unit_price），避免整个更新失败
    const SAFE_COLS = ['name','code','brand','model','category_name','stock','unit',
                       'safety_stock','last_stockin_date','last_stockin_batch','source',
                       'unit_price'];
    var safeUpdates = {};
    Object.keys(updates).forEach(function(k) {
      if (SAFE_COLS.indexOf(k) >= 0) safeUpdates[k] = updates[k];
    });
    if (Object.keys(safeUpdates).length === 0) {
      console.warn('[SupaDB] updateInventoryItem: 无有效列可更新, id=' + id);
      return null;
    }
    // 先尝试完整更新，如果失败则逐个列重试（跳过不存在的列）
    var data = null;
    try {
      const result = await sb
        .from('inventory_items')
        .update(safeUpdates)
        .eq('id', id)
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      data = result.data;
    } catch (e) {
      // 如果批量更新失败，可能是某些列不存在，逐个重试
      console.warn('[SupaDB] 批量更新失败，尝试逐列更新:', e.message);
      var keys = Object.keys(safeUpdates);
      for (var i = 0; i < keys.length; i++) {
        try {
          var single = {};
          single[keys[i]] = safeUpdates[keys[i]];
          var r = await sb.from('inventory_items').update(single).eq('id', id).select().single();
          if (r.error) {
            console.warn('[SupaDB] 列 ' + keys[i] + ' 不存在，已跳过');
          } else if (!data) {
            data = r.data;
          }
        } catch (e2) { /* skip column */ }
      }
      if (!data) {
        // 重新读取最新记录
        data = await _sbQuery(sb.from('inventory_items').select('*').eq('id', id).single());
      }
    }
    if (data) await writeAuditLog('UPDATE', 'inventory_items', id, data.code, safeUpdates);
    return data;
  },

  async bulkUpdateSafetyStock(items) {
    // items: [{ id, safety_stock }]
    const sb = getSupabase();
    for (const item of items) {
      await sb.from('inventory_items')
        .update({ safety_stock: item.safety_stock })
        .eq('id', item.id);
    }
    await writeAuditLog('BULK_UPDATE', 'inventory_items', null, null, {
      count: items.length,
      items: items.map(i => ({ id: i.id, safety_stock: i.safety_stock }))
    });
  },

  async createInventoryItem(itemData) {
    const sb = getSupabase();
    // 安全列白名单：线上 inventory_items 无 `category` 列，防止 UI/旧数据传错字段导致 400
    const SAFE_COLS = ['code','name','brand','model','category_id','category_name','unit',
                       'stock','safety_stock','unit_price','source',
                       'last_stockin_date','last_stockin_batch'];
    var safeItem = {};
    Object.keys(itemData).forEach(function(k) {
      if (SAFE_COLS.indexOf(k) >= 0) safeItem[k] = itemData[k];
    });
    if (!safeItem.code) {
      safeItem.code = await getNextCode('item_code', 'SKU', 5);
    }
    const { data, error } = await sb
      .from('inventory_items')
      .insert(safeItem)
      .select()
      .single();
    if (error) throw new Error('物品创建失败: ' + error.message);
    await writeAuditLog('CREATE', 'inventory_items', data.id, data.code, safeItem);
    return data;
  },

  // ---- 采购单 ----
  async getPurchaseOrders(filters) {
    filters = filters || {};
    const sb = getSupabase();
    let query = sb.from('purchase_orders').select('*, purchase_order_items(*)');

    if (filters.status) query = query.eq('status', filters.status);
    const data = await _sbQuery(query.order('created_at', { ascending: false }));
    return data;
  },

  async getPurchaseOrder(id) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('id', id)
        .single()
    );
  },

  async getPurchaseOrderByCode(code) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('code', code)
        .single()
    );
  },

  async getPendingPurchaseOrders() {
    return await this.getPurchaseOrders({ status: 'pending_stockin' });
  },

  async createPurchaseOrder(orderData) {
    const sb = getSupabase();
    const code = await getNextCode('purchase_order', 'PO', 3);

    // v5.43 金额链路：明细金额缺失时按 数量×单价 兜底，表头合计由明细汇总
    const _normItems = _normalizeAmounts(orderData.items);
    const _total = (orderData.total_amount && Number(orderData.total_amount) > 0)
      ? Number(orderData.total_amount)
      : _sumAmount(_normItems);

    const order = {
      code,
      purchase_date: orderData.purchase_date,
      purchaser: orderData.purchaser,
      suppliers: JSON.stringify(orderData.suppliers || []),
      total_amount: _total,
      status: 'pending_stockin',
      remark: orderData.remark || '',
      created_by_name: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : ''
    };

    const { data: insertedOrder, error: orderError } = await sb
      .from('purchase_orders')
      .insert(order)
      .select()
      .single();

    if (orderError) throw new Error('采购单创建失败: ' + orderError.message);

    // 插入明细行
    if (_normItems.length > 0) {
      const items = _normItems.map((item, idx) => ({
        purchase_order_id: insertedOrder.id,
        supplier: item.supplier || '',
        category_name: item.category || '',
        item_code: item.code || '',
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity || 0,
        unit: item.unit || '',
        price: item.price || 0,
        amount: item.amount || 0,
        sort_order: idx
      }));
      await _sbQuery(sb.from('purchase_order_items').insert(items));
    }

    await writeAuditLog('CREATE', 'purchase_orders', insertedOrder.id, code, orderData);

    // 重新查询完整数据返回
    return await this.getPurchaseOrder(insertedOrder.id);
  },

  async updatePurchaseOrder(id, orderData) {
    const sb = getSupabase();
    // v5.43 金额链路：与新建保持一致的兜底计算
    const _normItems = _normalizeAmounts(orderData.items);
    const _total = (orderData.total_amount && Number(orderData.total_amount) > 0)
      ? Number(orderData.total_amount)
      : _sumAmount(_normItems);

    const updateData = {
      purchase_date: orderData.purchase_date,
      purchaser: orderData.purchaser,
      suppliers: JSON.stringify(orderData.suppliers || []),
      total_amount: _total,
      remark: orderData.remark || ''
    };

    const { error: orderError } = await sb
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id);

    if (orderError) throw new Error('采购单更新失败: ' + orderError.message);

    // 删除旧明细，插入新明细
    await sb.from('purchase_order_items').delete().eq('purchase_order_id', id);

    if (_normItems.length > 0) {
      const items = _normItems.map((item, idx) => ({
        purchase_order_id: id,
        supplier: item.supplier || '',
        category_name: item.category || '',
        item_code: item.code || '',
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity || 0,
        unit: item.unit || '',
        price: item.price || 0,
        amount: item.amount || 0,
        sort_order: idx
      }));
      await _sbQuery(sb.from('purchase_order_items').insert(items));
    }

    await writeAuditLog('UPDATE', 'purchase_orders', id, null, orderData);
    return await this.getPurchaseOrder(id);
  },

  /**
   * 设置采购单「入库锁定」状态（与入库进度正交）。
   * locked=true 表示仓库已确认单据无误、准备入库，采购员不再可编辑；
   * locked=false 表示仓库退回，采购员可继续修改。
   * 依赖迁移 database/migrations/20260821_po_locked.sql（新增 is_locked 列）。
   */
  async setPurchaseOrderLocked(id, locked) {
    const sb = getSupabase();
    const { error } = await sb
      .from('purchase_orders')
      .update({ is_locked: !!locked })
      .eq('id', id);
    if (error) {
      // 列不存在（迁移未执行）时给出明确提示
      if (String(error.code || '') === '42703') {
        throw new Error('数据库尚未启用「入库锁定」：请先在 Supabase SQL Editor 执行 database/migrations/20260821_po_locked.sql');
      }
      throw new Error('锁定状态更新失败: ' + error.message);
    }
    await writeAuditLog(locked ? 'LOCK' : 'UNLOCK', 'purchase_orders', id, null, { is_locked: !!locked });
    return await this.getPurchaseOrder(id);
  },

  async deletePurchaseOrder(id) {
    const sb = getSupabase();
    // 先删除明细行（避免依赖外键级联，兼容线上未配置 ON DELETE CASCADE 的表）
    const { error: itemErr } = await sb
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', id);
    if (itemErr) throw new Error('删除采购单明细失败: ' + itemErr.message);

    const { error: orderErr } = await sb
      .from('purchase_orders')
      .delete()
      .eq('id', id);
    if (orderErr) throw new Error('删除采购单失败: ' + orderErr.message);

    if (typeof writeAuditLog === 'function') {
      try { await writeAuditLog('DELETE', 'purchase_orders', id, null, null); } catch (e) {}
    }
    return true;
  },

  async confirmStockIn(orderId, stockInData) {
    const sb = getSupabase();
    const order = await this.getPurchaseOrder(orderId);
    if (!order) throw new Error('采购单不存在');

    const siCode = await getNextCode('stock_in', 'SI', 5);

    // 创建入库记录
    const record = {
      code: siCode,
      purchase_order_id: order.id,
      purchase_order_code: order.code,
      stockin_date: stockInData.stockin_date,
      batch_code: stockInData.batch_code,
      total_quantity: stockInData.total_quantity,
      total_amount: stockInData.total_amount,
      status: 'completed',
      confirmed_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '',
      confirmed_at: new Date().toISOString(),
      remark: stockInData.remark || ''
    };

    const { data: insertedRecord, error: recError } = await sb
      .from('stock_in_records')
      .insert(record)
      .select()
      .single();

    if (recError) throw new Error('入库记录创建失败: ' + recError.message);

    // 同步库存 → 再写入库明细（明细带上库存外键，建立真正的关联）
    for (const item of (stockInData.items || [])) {
      const invId = await _syncInventoryOnStockIn(item, stockInData);

      await _sbQuery(sb.from('stock_in_items').insert({
        stock_in_record_id: insertedRecord.id,
        inventory_item_id: invId,
        supplier: item.supplier || '',
        category_name: item.category || '',
        item_code: item.code || '',
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity || 0,
        actual_quantity: item.actual_quantity || 0,
        unit: item.unit || '',
        price: item.price || 0,
        amount: Number(((item.actual_quantity || 0) * (item.price || 0)).toFixed(2)),
        sort_order: item.sort_order || 0
      }));
    }

    // 更新采购单状态
    await _updatePOStatus(orderId, 'stockin_completed');

    await writeAuditLog('STOCK_IN', 'purchase_orders', orderId, order.code, stockInData);

    return insertedRecord;
  },

  // ---- 分批/部分入库 ----
  async partialConfirmStockIn(orderId, stockInData) {
    const sb = getSupabase();
    const order = await this.getPurchaseOrder(orderId);
    if (!order) throw new Error('采购单不存在');

    const siCode = await getNextCode('stock_in', 'SI', 5);

    // 计算本次入库总数量和总金额
    const totalQty = (stockInData.items || []).reduce((s, i) => s + (i.actual_quantity || 0), 0);
    const totalAmt = (stockInData.items || []).reduce((s, i) => s + ((i.actual_quantity || 0) * (i.price || 0)), 0);

    // 创建入库记录
    const record = {
      code: siCode,
      purchase_order_id: order.id,
      purchase_order_code: order.code,
      stockin_date: stockInData.stockin_date,
      batch_code: stockInData.batch_code,
      total_quantity: totalQty,
      total_amount: totalAmt,
      status: 'completed',
      confirmed_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '',
      confirmed_at: new Date().toISOString(),
      remark: stockInData.remark || ''
    };

    const { data: insertedRecord, error: recError } = await sb
      .from('stock_in_records')
      .insert(record)
      .select()
      .single();

    if (recError) throw new Error('入库记录创建失败: ' + recError.message);

    // 同步库存 → 再写入库明细（明细带上库存外键）
    for (const item of (stockInData.items || [])) {
      const actualQty = Number(item.actual_quantity) || 0;
      if (actualQty <= 0) continue;

      const invId = await _syncInventoryOnStockIn(item, stockInData);

      await _sbQuery(sb.from('stock_in_items').insert({
        stock_in_record_id: insertedRecord.id,
        inventory_item_id: invId,
        supplier: item.supplier || '',
        category_name: item.category || '',
        item_code: item.code || '',
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity || 0,
        actual_quantity: actualQty,
        unit: item.unit || '',
        price: item.price || 0,
        amount: Number((actualQty * (item.price || 0)).toFixed(2)),
        sort_order: item.sort_order || 0
      }));
    }

    // 判断采购单是否全部入库完成
    // 获取该采购单所有已入库的 actual_quantity
    const allSiRecords = await _sbQuery(
      sb.from('stock_in_records')
        .select('*, stock_in_items(*)')
        .eq('purchase_order_id', order.id)
    );
    const receivedMap = {};
    for (const si of allSiRecords) {
      for (const siItem of (si.stock_in_items || [])) {
        const key = siItem.item_code || siItem.name;
        receivedMap[key] = (receivedMap[key] || 0) + (siItem.actual_quantity || 0);
      }
    }
    let allCompleted = true;
    for (const poItem of (order.purchase_order_items || [])) {
      const key = poItem.item_code || poItem.name;
      const received = receivedMap[key] || 0;
      if (received < (poItem.quantity || 0)) {
        allCompleted = false;
        break;
      }
    }

    // 更新采购单状态（约束未放宽时自动降级，保证分批入库不中断）
    const wantStatus = allCompleted ? 'stockin_completed' : 'partially_stockin';
    const newStatus = await _updatePOStatus(orderId, wantStatus);

    await writeAuditLog('STOCK_IN', 'purchase_orders', orderId, order.code, { ...stockInData, partial: true, finalStatus: newStatus });

    return insertedRecord;
  },

  // ---- 入库记录 ----
  async getStockInRecords() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('stock_in_records').select('*, stock_in_items(*)').order('created_at', { ascending: false })
    );
  },

  async getStockInRecord(code) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('stock_in_records')
        .select('*, stock_in_items(*)')
        .eq('code', code)
        .single()
    );
  },

  // ---- 领用申请 ----
  async getRequisitions(filters) {
    filters = filters || {};
    const sb = getSupabase();
    let query = sb.from('requisitions').select('*, requisition_items(*)');

    if (filters.status) query = query.eq('status', filters.status);
    return await _sbQuery(query.order('created_at', { ascending: false }));
  },

  async getRequisition(id) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('requisitions')
        .select('*, requisition_items(*)')
        .eq('id', id)
        .single()
    );
  },

  async getPendingRequisitions() {
    return await this.getRequisitions({ status: 'pending_outbound' });
  },

  async createRequisition(reqData) {
    const sb = getSupabase();
    const code = await getNextCode('requisition', 'RQ', 5);

    const req = {
      code,
      tour_date: reqData.tour_date,
      tour_name: reqData.tour_name,
      scenario: reqData.scenario || '',
      applicant: reqData.applicant,
      apply_date: reqData.apply_date,
      total_quantity: reqData.total_quantity || 0,
      status: 'pending_approval',
      remark: reqData.remark || '',
      created_by_name: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : ''
    };

    // 优先创建为「待审核」；线上约束未放宽时降级为「待出库」，保证流程不中断
    let insertedReq = null, reqError = null;
    for (const st of ['pending_approval', 'pending_outbound']) {
      req.status = st;
      const r = await sb.from('requisitions').insert(req).select().single();
      if (!r.error) { insertedReq = r.data; break; }
      reqError = r.error;
      if (String(r.error.code) !== '23514') break; // 非约束冲突，不再重试
      window.__SCHEMA_OUTDATED = true;
    }
    if (!insertedReq) throw new Error('领用申请创建失败: ' + (reqError && reqError.message));

    if (reqData.items && reqData.items.length > 0) {
      const items = reqData.items.map((item, idx) => ({
        requisition_id: insertedReq.id,
        inventory_item_id: item.item_id || null,
        name: item.name,
        code: item.code || '',
        category: item.category || '',
        unit: item.unit || '',
        quantity: item.quantity || 0,
        brand: item.brand || '',
        model: item.model || '',
        sort_order: idx
      }));
      await _sbQuery(sb.from('requisition_items').insert(items));
    }

    await writeAuditLog('CREATE', 'requisitions', insertedReq.id, code, reqData);
    return await this.getRequisition(insertedReq.id);
  },

  async updateRequisition(id, reqData) {
    const sb = getSupabase();
    const { error } = await sb.from('requisitions').update({
      tour_date: reqData.tour_date,
      tour_name: reqData.tour_name,
      scenario: reqData.scenario || '',
      applicant: reqData.applicant,
      apply_date: reqData.apply_date,
      total_quantity: reqData.total_quantity || 0,
      remark: reqData.remark || ''
    }).eq('id', id);

    if (error) throw new Error('领用申请更新失败: ' + error.message);

    await sb.from('requisition_items').delete().eq('requisition_id', id);
    if (reqData.items && reqData.items.length > 0) {
      const items = reqData.items.map((item, idx) => ({
        requisition_id: id,
        inventory_item_id: item.item_id || null,
        name: item.name,
        code: item.code || '',
        category: item.category || '',
        unit: item.unit || '',
        quantity: item.quantity || 0,
        brand: item.brand || '',
        model: item.model || '',
        sort_order: idx
      }));
      await _sbQuery(sb.from('requisition_items').insert(items));
    }

    await writeAuditLog('UPDATE', 'requisitions', id, null, reqData);
    return await this.getRequisition(id);
  },

  async withdrawRequisition(id) {
    const sb = getSupabase();
    await _sbQuery(
      sb.from('requisitions').update({ status: 'withdrawn' }).eq('id', id)
    );
    await writeAuditLog('WITHDRAW', 'requisitions', id);
  },

  // ---- 领用审核（v5.43 新增）----
  /** 审核通过：待审核 → 已审核（约束未放宽时降级为 pending_outbound） */
  async approveRequisition(id, remark) {
    const req = await this.getRequisition(id);
    if (!req) throw new Error('领用单不存在');
    if (req.status === 'outbound_completed') throw new Error('该领用单已出库，无法再审核');
    if (req.status === 'withdrawn') throw new Error('该领用单已撤回，无法审核');
    if (req.status === 'rejected') throw new Error('该领用单已驳回，如需恢复请由申请人重新提交');

    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const st = await _updateReqStatus(id, 'approved', 'pending_outbound', {
      approved_by: _numOrNull(u && u.id),   // BIGINT，非法值置空避免类型错误
      approved_by_name: u ? u.name : '',
      approved_at: new Date().toISOString()
    });
    await writeAuditLog('APPROVE', 'requisitions', id, req.code,
      { remark: remark || '', by: u ? u.name : '', result: st });
    return st;
  },

  /** 审核驳回：待审核 → 已驳回（约束未放宽时降级为 withdrawn） */
  async rejectRequisition(id, reason) {
    const req = await this.getRequisition(id);
    if (!req) throw new Error('领用单不存在');
    if (req.status === 'outbound_completed') throw new Error('该领用单已出库，无法驳回');
    if (req.status === 'withdrawn') throw new Error('该领用单已撤回，无需驳回');

    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const st = await _updateReqStatus(id, 'rejected', 'withdrawn', {
      approved_by: _numOrNull(u && u.id),
      approved_by_name: u ? u.name : '',
      approved_at: new Date().toISOString(),
      reject_reason: reason || ''
    });
    await writeAuditLog('REJECT', 'requisitions', id, req.code,
      { reason: reason || '', by: u ? u.name : '', result: st });
    return st;
  },

  /** 待审核列表 */
  async getPendingApprovalRequisitions() {
    return await this.getRequisitions({ status: 'pending_approval' });
  },

  // ---- 非采购入库（退库/调拨/盘盈等，需仓库管理员审核）----
  async createNonPurchaseStockIn(payload) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase 未连接');
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const code = await getNextCode('nonpurchase', 'NPS', 5);
    const qty = Number(payload.qty) || 0;
    const price = Number(payload.price) || 0;
    const row = {
      code,
      item_code: payload.code || '',
      name: payload.name || '',
      category: payload.category || '',
      unit: payload.unit || '',
      qty,
      tour_id: payload.tour_id ? _numOrNull(Number(payload.tour_id)) : null,
      tour_name: payload.tour_name || '',
      price,
      amount: Number((qty * price).toFixed(2)),
      reason: payload.reason || '',
      status: 'pending',
      applicant_id: _numOrNull(u && u.id),
      applicant_name: u ? u.name : ''
    };
    const { data, error } = await sb.from('non_purchase_stock_in').insert(row).select().single();
    if (error) throw new Error('非采购入库创建失败: ' + error.message);
    await writeAuditLog('NONPURCHASE_CREATE', 'non_purchase_stock_in', data.id, data.code, { qty, price });
    return data;
  },

  async getNonPurchaseStockIns(filter) {
    const sb = getSupabase();
    if (!sb) return [];
    let q = sb.from('non_purchase_stock_in').select('*').order('created_at', { ascending: false });
    if (filter && filter.status) q = q.eq('status', filter.status);
    const { data, error } = await q;
    if (error) { console.warn('[NonPurchase] 查询失败:', error.message); return []; }
    return data || [];
  },

  async approveNonPurchaseStockIn(id, remark) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase 未连接');
    const list = await this.getNonPurchaseStockIns({});
    const r = (list || []).find(x => x.id === id);
    if (!r) throw new Error('非采购入库单不存在');
    if (r.status !== 'pending') throw new Error('该单已处理，无法重复审核');

    // 入库价取物品当前加权均价 → 均价保持不变（退库语义：物品按结存成本回收）
    const invRows = await _sbQuery(sb.from('inventory_items').select('*').eq('code', r.item_code).limit(1));
    const inv = (invRows && invRows[0]) ? invRows[0] : null;
    const curPrice = inv ? (Number(inv.unit_price) || 0) : (Number(r.price) || 0);
    const item = {
      code: r.item_code, name: r.name, category: r.category, brand: '', model: '', unit: r.unit,
      actual_quantity: Number(r.qty) || 0, price: curPrice
    };
    const stockInData = { stockin_date: new Date().toISOString().slice(0, 10), batch_code: 'NPS-' + (r.code || '') };
    await _syncInventoryOnStockIn(item, stockInData);

    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const { error } = await sb.from('non_purchase_stock_in').update({
      status: 'approved',
      reviewer_id: _numOrNull(u && u.id),
      reviewer_name: u ? u.name : '',
      reviewed_at: new Date().toISOString(),
      approved_price: curPrice,
      remark: remark || ''
    }).eq('id', id);
    if (error) throw new Error('审核更新失败: ' + error.message);
    await writeAuditLog('NONPURCHASE_APPROVE', 'non_purchase_stock_in', id, r.code, { by: u ? u.name : '' });
  },

  async rejectNonPurchaseStockIn(id, reason) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase 未连接');
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const { error } = await sb.from('non_purchase_stock_in').update({
      status: 'rejected',
      reviewer_id: _numOrNull(u && u.id),
      reviewer_name: u ? u.name : '',
      reviewed_at: new Date().toISOString(),
      reject_reason: reason || ''
    }).eq('id', id);
    if (error) throw new Error('驳回失败: ' + error.message);
    await writeAuditLog('NONPURCHASE_REJECT', 'non_purchase_stock_in', id, '', { reason: reason || '' });
  },

  // ---- 异常报损（不审核，必填原因；损失金额 = 当前加权均价 × 数量）----
  async createLossRecord(payload) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase 未连接');
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const qty = Number(payload.qty) || 0;
    if (qty <= 0) throw new Error('报损数量必须大于 0');

    const invRows = await _sbQuery(sb.from('inventory_items').select('*').eq('code', payload.code).limit(1));
    const inv = (invRows && invRows[0]) ? invRows[0] : null;
    const curPrice = inv ? (Number(inv.unit_price) || 0) : 0;
    const curStock = inv ? (Number(inv.stock) || 0) : 0;
    if (curStock < qty) {
      throw new Error('库存不足，无法报损：' + (inv ? inv.name : payload.name) + '（现有 ' + curStock + '，报损 ' + qty + '）');
    }
    const lossAmount = Number((qty * curPrice).toFixed(2));

    const code = await getNextCode('loss', 'LOSS', 5);
    const row = {
      code,
      item_code: payload.code || '',
      name: payload.name || '',
      category: payload.category || (inv ? inv.category_name : ''),
      unit: payload.unit || (inv ? inv.unit : ''),
      qty,
      tour_id: payload.tour_id ? _numOrNull(Number(payload.tour_id)) : null,
      tour_name: payload.tour_name || '',
      unit_price: curPrice,
      loss_amount: lossAmount,
      reason: payload.reason || '',
      applicant_id: _numOrNull(u && u.id),
      applicant_name: u ? u.name : ''
    };
    const { data, error } = await sb.from('loss_records').insert(row).select().single();
    if (error) throw new Error('报损创建失败: ' + error.message);

    // 扣减库存（单价不变，仅减数量与总价值）
    if (inv) {
      const { error: updErr } = await sb.from('inventory_items').update({ stock: curStock - qty }).eq('id', inv.id);
      if (updErr) throw new Error('库存扣减失败: ' + updErr.message);
    }
    await writeAuditLog('LOSS_CREATE', 'loss_records', data.id, data.code, { qty, lossAmount });
    return data;
  },

  async getLossRecords(filter) {
    const sb = getSupabase();
    if (!sb) return [];
    let q = sb.from('loss_records').select('*').order('created_at', { ascending: false });
    if (filter && filter.tour_name) q = q.eq('tour_name', filter.tour_name);
    const { data, error } = await q;
    if (error) { console.warn('[Loss] 查询失败:', error.message); return []; }
    return data || [];
  },

  async deleteRequisition(id) {
    const sb = getSupabase();
    await _sbQuery(sb.from('requisitions').delete().eq('id', id));
    await writeAuditLog('DELETE', 'requisitions', id);
  },

  // ---- 出库确认 ----
  async confirmStockOut(reqId, stockOutData) {
    const sb = getSupabase();
    const req = await this.getRequisition(reqId);
    if (!req) throw new Error('领用单不存在');

    // ===== v5.43 出库门禁：未审核 / 已终结的单据不得出库 =====
    if (req.status === 'pending_approval') {
      throw new Error('该领用单尚未审核通过，请先由管理员在「领用管理」中审核');
    }
    if (req.status === 'rejected') throw new Error('该领用单已被驳回，无法出库');
    if (req.status === 'withdrawn') throw new Error('该领用单已撤回，无法出库');
    if (req.status === 'outbound_completed') throw new Error('该领用单已完成出库，请勿重复操作');

    // ===== v5.43 出库预检：先全部校验，再落库，杜绝静默丢数据 =====
    const outItems = stockOutData.items || [];
    if (outItems.length === 0) throw new Error('出库明细为空，无法确认出库');

    const notFound = [];
    const notEnough = [];
    for (const item of outItems) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const invId = await _resolveInventoryId(item);
      if (!invId) {
        notFound.push(item.name || item.code || '(未命名)');
        continue;
      }
      item.__resolvedInvId = invId;
      const inv = await _sbQuery(
        sb.from('inventory_items').select('id, name, stock').eq('id', invId).single()
      );
      const cur = Number(inv && inv.stock) || 0;
      if (cur < qty) {
        notEnough.push(`${inv ? inv.name : item.name}（现有 ${cur}，需出 ${qty}）`);
      }
    }
    if (notFound.length > 0) {
      throw new Error(
        '以下物品在库存中不存在，无法出库：' + notFound.join('、') +
        '。请先在「库存管理」建档，或在领用单中从库存列表选择物品。'
      );
    }
    if (notEnough.length > 0) {
      throw new Error('库存不足，无法出库：' + notEnough.join('；'));
    }
    // ===== 预检通过，开始写入 =====

    const soCode = await getNextCode('stock_out', 'SO', 5);

    const record = {
      code: soCode,
      requisition_id: req.id,
      requisition_code: req.code,
      tour_date: req.tour_date,
      tour_name: req.tour_name,
      scenario: req.scenario,
      stockout_date: stockOutData.stockout_date,
      total_quantity: stockOutData.total_quantity,
      status: 'completed',
      confirmed_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '',
      confirmed_at: new Date().toISOString()
    };

    const { data: insertedRecord, error: recError } = await sb
      .from('stock_out_records')
      .insert(record)
      .select()
      .single();

    if (recError) throw new Error('出库记录创建失败: ' + recError.message);

    for (const item of outItems) {
      const invId = item.__resolvedInvId || item.item_id || null;
      await _sbQuery(sb.from('stock_out_items').insert({
        stock_out_record_id: insertedRecord.id,
        inventory_item_id: invId,
        name: item.name,
        code: item.code || '',
        category: item.category || '',
        unit: item.unit || '',
        quantity: item.quantity || 0,
        requested_quantity: item.requested_quantity || item.quantity || 0,
        brand: item.brand || '',
        model: item.model || '',
        sort_order: item.sort_order || 0
      }));

      // 扣减库存（invId 已在预检阶段确保有效）
      const qty = Number(item.quantity) || 0;
      if (invId && qty > 0) {
        const invItem = await _sbQuery(
          sb.from('inventory_items').select('stock').eq('id', invId).single()
        );
        const newStock = (Number(invItem && invItem.stock) || 0) - qty;
        const { error: decErr } = await sb.from('inventory_items')
          .update({ stock: newStock < 0 ? 0 : newStock })
          .eq('id', invId);
        if (decErr) throw new Error('库存扣减失败: ' + decErr.message);
      }
      delete item.__resolvedInvId;
    }

    // 更新领用单状态
    await sb.from('requisitions')
      .update({ status: 'outbound_completed' })
      .eq('id', reqId);

    await writeAuditLog('STOCK_OUT', 'requisitions', reqId, req.code, stockOutData);
    return insertedRecord;
  },

  // ---- 出库记录 ----
  async getStockOutRecords() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('stock_out_records').select('*, stock_out_items(*)').order('created_at', { ascending: false })
    );
  },

  async getStockOutRecord(code) {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('stock_out_records')
        .select('*, stock_out_items(*)')
        .eq('code', code)
        .single()
    );
  },

  // ---- 品牌/型号历史 ----
  async getBrandHistory(itemName) {
    const sb = getSupabase();
    const data = await _sbQuery(
      sb.from('item_history')
        .select('value, use_count')
        .eq('item_name', itemName)
        .eq('type', 'brand')
        .order('use_count', { ascending: false })
    );
    return data.map(d => d.value);
  },

  async getModelHistory(itemName) {
    const sb = getSupabase();
    const data = await _sbQuery(
      sb.from('item_history')
        .select('value, use_count')
        .eq('item_name', itemName)
        .eq('type', 'model')
        .order('use_count', { ascending: false })
    );
    return data.map(d => d.value);
  },

  async addBrandHistory(itemName, brand) {
    if (!brand) return;
    const sb = getSupabase();
    await sb.from('item_history').upsert({
      item_name: itemName,
      type: 'brand',
      value: brand,
      use_count: 1
    }, { onConflict: 'item_name,type,value' });

    // 增加使用次数
    await sb.rpc('increment_history_count', {
      p_item_name: itemName, p_type: 'brand', p_value: brand
    }).catch(() => { /* 函数可能不存在，忽略 */ });
  },

  async addModelHistory(itemName, model) {
    if (!model) return;
    const sb = getSupabase();
    await sb.from('item_history').upsert({
      item_name: itemName,
      type: 'model',
      value: model,
      use_count: 1
    }, { onConflict: 'item_name,type,value' });
  },

  // ---- 统计查询 ----
  async getDashboardStats() {
    const sb = getSupabase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [
      inventoryItems,
      monthInRecords,
      monthOutRecords,
      pendingPO,
      pendingReq
    ] = await Promise.all([
      _sbQuery(sb.from('inventory_items').select('id, stock, safety_stock')),
      _sbQuery(sb.from('stock_in_records').select('id').gte('stockin_date', monthStart).lte('stockin_date', monthEnd)),
      _sbQuery(sb.from('stock_out_records').select('id').gte('stockout_date', monthStart).lte('stockout_date', monthEnd)),
      _sbQuery(sb.from('purchase_orders').select('id').eq('status', 'pending_stockin')),
      _sbQuery(sb.from('requisitions').select('id').eq('status', 'pending_outbound'))
    ]);

    const totalItems = inventoryItems.length;
    const lowStock = inventoryItems.filter(i => i.stock < (i.safety_stock || 10)).length;
    const outOfStock = inventoryItems.filter(i => i.stock === 0).length;

    return {
      totalItems,
      monthInCount: monthInRecords.length,
      monthOutCount: monthOutRecords.length,
      pendingPurchase: pendingPO.length,
      pendingOutbound: pendingReq.length,
      lowStock,
      outOfStock
    };
  },

  // ---- 审计日志查询 ----
  async getAuditLogs(filters) {
    filters = filters || {};
    const sb = getSupabase();
    let query = sb.from('audit_logs').select('*');

    if (filters.entity_type) query = query.eq('entity_type', filters.entity_type);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.start_date) query = query.gte('created_at', filters.start_date);
    if (filters.end_date) query = query.lte('created_at', filters.end_date);

    return await _sbQuery(query.order('created_at', { ascending: false }).limit(filters.limit || 100));
  },

  // ---- 删除库存物品 ----
  async deleteInventoryItem(id) {
    const sb = getSupabase();
    // 先解除外键关联，否则会被 stock_in_items / requisition_items / stock_out_items 拦截
    await sb.from('stock_in_items').delete().eq('inventory_item_id', id);
    await sb.from('requisition_items').delete().eq('inventory_item_id', id);
    await sb.from('stock_out_items').delete().eq('inventory_item_id', id);
    const { error } = await sb.from('inventory_items').delete().eq('id', id);
    if (error) throw new Error('物品删除失败: ' + error.message);
    await writeAuditLog('DELETE', 'inventory_items', id);
  },

  // ---- 库存调整记录 ----
  async getInventoryAdjustments() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('inventory_adjustments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
    );
  },

  async createInventoryAdjustment(data) {
    const sb = getSupabase();
    const { data: result, error } = await sb
      .from('inventory_adjustments')
      .insert({
        inventory_item_id: data.inventory_item_id,
        item_code: data.item_code || '',
        delta: data.delta || 0,
        new_stock: data.new_stock || 0,
        reason: data.reason || '手工调整',
        created_by: data.created_by || 'system'
      })
      .select()
      .single();
    if (error) throw new Error('调整记录创建失败: ' + error.message);
    // v5.43.1：库存调整也写入操作记录，保证「入库/出库/调整」全程可追溯
    await writeAuditLog('ADJUST', 'inventory_items', data.inventory_item_id, data.item_code, {
      delta: data.delta || 0,
      new_stock: data.new_stock || 0,
      reason: data.reason || '手工调整'
    });
    return result;
  },

  // ---- 领用标准 ----
  async getConsumptionStandards() {
    const sb = getSupabase();
    return await _sbQuery(
      sb.from('consumption_standards').select('*').order('id')
    );
  },

  async upsertConsumptionStandard(data) {
    const sb = getSupabase();
    // 先按 item_name + scenario 查找是否存在
    const { data: existing } = await sb
      .from('consumption_standards')
      .select('id')
      .eq('item_name', data.item_name)
      .eq('scenario', data.scenario)
      .maybeSingle();

    if (existing) {
      const { error } = await sb
        .from('consumption_standards')
        .update({ max_per_tour: data.max_per_tour, category: data.category || '' })
        .eq('id', existing.id);
      if (error) throw new Error('领用标准更新失败: ' + error.message);
      return { id: existing.id, ...data };
    } else {
      const { data: result, error } = await sb
        .from('consumption_standards')
        .insert({
          item_name: data.item_name,
          scenario: data.scenario || '通用',
          max_per_tour: data.max_per_tour || 0,
          category: data.category || ''
        })
        .select()
        .single();
      if (error) throw new Error('领用标准创建失败: ' + error.message);
      return result;
    }
  },

  async deleteConsumptionStandard(id) {
    const sb = getSupabase();
    const { error } = await sb.from('consumption_standards').delete().eq('id', id);
    if (error) throw new Error('领用标准删除失败: ' + error.message);
    await writeAuditLog('DELETE', 'consumption_standards', id);
  },

  // ---- 系统设置 ----
  async getSettings() {
    const sb = getSupabase();
    return await _sbQuery(sb.from('settings').select('*'));
  },

  async upsertSetting(key, value) {
    const sb = getSupabase();
    const { error } = await sb
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    if (error) throw new Error('设置保存失败: ' + error.message);
  }
};

// ============================================================
// 辅助：localStorage 兼容层（渐进迁移用）
// ============================================================
// 在完全迁移前，保留 localStorage 读写作为 fallback
// 迁移完成后移除
function isSupabaseReady() {
  return SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' && typeof supabase !== 'undefined';
}
