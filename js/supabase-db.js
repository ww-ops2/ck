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
    const { error } = await sb.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_code: entityCode || '',
      details: details ? JSON.stringify(details) : null,
      user_name: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : 'system',
      user_role: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : 'system'
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
    // 映射 status → is_active
    var cloudUpdates = {};
    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        if (key === 'status') {
          cloudUpdates.is_active = (updates[key] === 'active');
        } else {
          cloudUpdates[key] = updates[key];
        }
      }
    }
    const { data, error } = await sb
      .from('users')
      .update(cloudUpdates)
      .eq('username', username)
      .select();
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
    await writeAuditLog('UPDATE', 'categories', id, data.code, { name: newName });
    return data;
  },

  async deleteCategory(id) {
    const sb = getSupabase();
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) throw new Error('品类删除失败: ' + error.message);
    await writeAuditLog('DELETE', 'categories', id);
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
    const { data, error } = await sb
      .from('inventory_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error('库存更新失败: ' + error.message);
    await writeAuditLog('UPDATE', 'inventory_items', id, data.code, updates);
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
    if (!itemData.code) {
      itemData.code = await getNextCode('item_code', 'SKU', 5);
    }
    const { data, error } = await sb
      .from('inventory_items')
      .insert(itemData)
      .select()
      .single();
    if (error) throw new Error('物品创建失败: ' + error.message);
    await writeAuditLog('CREATE', 'inventory_items', data.id, data.code, itemData);
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

    const order = {
      code,
      purchase_date: orderData.purchase_date,
      purchaser: orderData.purchaser,
      suppliers: JSON.stringify(orderData.suppliers || []),
      total_amount: orderData.total_amount || 0,
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
    if (orderData.items && orderData.items.length > 0) {
      const items = orderData.items.map((item, idx) => ({
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
    const updateData = {
      purchase_date: orderData.purchase_date,
      purchaser: orderData.purchaser,
      suppliers: JSON.stringify(orderData.suppliers || []),
      total_amount: orderData.total_amount || 0,
      remark: orderData.remark || ''
    };

    const { error: orderError } = await sb
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id);

    if (orderError) throw new Error('采购单更新失败: ' + orderError.message);

    // 删除旧明细，插入新明细
    await sb.from('purchase_order_items').delete().eq('purchase_order_id', id);

    if (orderData.items && orderData.items.length > 0) {
      const items = orderData.items.map((item, idx) => ({
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

    // 插入入库明细并更新库存
    for (const item of (stockInData.items || [])) {
      await _sbQuery(sb.from('stock_in_items').insert({
        stock_in_record_id: insertedRecord.id,
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
        amount: (item.actual_quantity || 0) * (item.price || 0),
        sort_order: item.sort_order || 0
      }));

      // 更新库存: 找到对应物品增加库存
      const invItems = await _sbQuery(
        sb.from('inventory_items').select('*').eq('code', item.code).limit(1)
      );
      if (invItems.length > 0) {
        await sb.from('inventory_items')
          .update({
            stock: invItems[0].stock + (item.actual_quantity || 0),
            last_stockin_date: stockInData.stockin_date,
            last_stockin_batch: stockInData.batch_code
          })
          .eq('id', invItems[0].id);
      }
    }

    // 更新采购单状态
    await sb.from('purchase_orders')
      .update({ status: 'stockin_completed' })
      .eq('id', orderId);

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

    // 插入入库明细并更新库存
    for (const item of (stockInData.items || [])) {
      const actualQty = item.actual_quantity || 0;
      if (actualQty <= 0) continue;

      await _sbQuery(sb.from('stock_in_items').insert({
        stock_in_record_id: insertedRecord.id,
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
        amount: actualQty * (item.price || 0),
        sort_order: item.sort_order || 0
      }));

      // 更新库存: 找到对应物品增加库存
      const invItems = await _sbQuery(
        sb.from('inventory_items').select('*').eq('code', item.code).limit(1)
      );
      if (invItems.length > 0) {
        await sb.from('inventory_items')
          .update({
            stock: invItems[0].stock + actualQty,
            last_stockin_date: stockInData.stockin_date,
            last_stockin_batch: stockInData.batch_code
          })
          .eq('id', invItems[0].id);
      }
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

    // 更新采购单状态
    const newStatus = allCompleted ? 'stockin_completed' : 'partially_stockin';
    await sb.from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', orderId);

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
      status: 'pending_outbound',
      remark: reqData.remark || '',
      created_by_name: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : ''
    };

    const { data: insertedReq, error: reqError } = await sb
      .from('requisitions')
      .insert(req)
      .select()
      .single();

    if (reqError) throw new Error('领用申请创建失败: ' + reqError.message);

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

    for (const item of (stockOutData.items || [])) {
      await _sbQuery(sb.from('stock_out_items').insert({
        stock_out_record_id: insertedRecord.id,
        inventory_item_id: item.item_id || null,
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

      // 扣减库存
      if (item.item_id) {
        const invItem = await _sbQuery(
          sb.from('inventory_items').select('stock').eq('id', item.item_id).single()
        );
        if (invItem) {
          await sb.from('inventory_items')
            .update({ stock: Math.max(0, invItem.stock - (item.quantity || 0)) })
            .eq('id', item.item_id);
        }
      }
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
