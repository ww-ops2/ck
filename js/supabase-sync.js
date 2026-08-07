/**
 * Supabase 内存数据加载层 (v3.0)
 *
 * 移除 localStorage 数据缓存，所有数据直接从 Supabase 加载到内存。
 * 本地仅保存系统代码框架 + currentUser（登录会话）。
 *
 * 核心策略：
 * 1. 页面加载：从 Supabase 并行拉取全部数据 → 存储到 window._appCache
 * 2. 数据写入：各个模块直接调用 SupaDB.xxx() 方法，成功后更新 _appCache
 * 3. 手动刷新：提供 refreshData() 按需从 Supabase 重新拉取
 *
 * 依赖：supabase-db.js（必须先加载）
 */

// ============================================================
// 全局数据缓存（所有模块从此读取，不从 localStorage 读取）
// ============================================================
window._appCache = {
  categories: [],
  inventory: [],
  purchaseOrders: [],
  stockInRecords: [],
  stockOutRecords: [],
  requisitions: [],
  brandHistory: {},
  modelHistory: {},
  consumptionStandards: [],
  inventoryAdjustments: [],
  tourNames: [],
  users: [],
  settings: []
};

let _isInitialLoading = false;

// ============================================================
// syncFromSupabase — 从 Supabase 拉取全部数据到内存
// ============================================================
async function syncFromSupabase(options) {
  options = options || {};
  if (!isSupabaseReady()) {
    console.log('[Sync] Supabase 未就绪，使用本地 mock 数据');
    return;
  }

  const sb = getSupabase();
  if (!sb) return;

  const isForce = options.force === true;
  console.log('[Sync] ' + (isForce ? '强制刷新数据...' : '从 Supabase 同步数据...'));
  const startTime = Date.now();

  _isInitialLoading = true;

  try {
    // 逐个查询每个表，失败互不影响（Promise.all 一个失败全部丢失）
    var tableQueries = {
      categories: sb.from('categories').select('*').order('id'),
      inventory: sb.from('inventory_items').select('*').order('id'),
      purchaseOrders: sb.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false }).limit(500),
      stockIn: sb.from('stock_in_records').select('*, stock_in_items(*)').order('created_at', { ascending: false }).limit(800),
      requisitions: sb.from('requisitions').select('*, requisition_items(*)').order('created_at', { ascending: false }).limit(800),
      stockOut: sb.from('stock_out_records').select('*, stock_out_items(*)').order('created_at', { ascending: false }).limit(800),
      adjustments: sb.from('inventory_adjustments').select('*').order('created_at', { ascending: false }).limit(500),
      users: sb.from('users').select('*').order('id'),
      consumption: sb.from('consumption_standards').select('*').order('id'),
      tourNames: sb.from('tour_names').select('*').order('name'),
      settings: sb.from('settings').select('*')
    };
  
    // 用 allSettled 替代 all，失败的表不影响其他表
    var settledResults = await Promise.allSettled(
      Object.values(tableQueries).map(function(q) { return q; })
    );
    var queryKeys = Object.keys(tableQueries);
    var results = {};
    settledResults.forEach(function(r, i) {
      var key = queryKeys[i];
      if (r.status === 'fulfilled') {
        results[key] = r.value;
      } else {
        console.warn('[Sync] 表 ' + key + ' 查询失败:', r.reason?.message || '未知错误');
        results[key] = { data: null, error: r.reason };
      }
    });
  
    var categoriesResult = results.categories;
    var inventoryResult = results.inventory;
    var purchaseOrdersResult = results.purchaseOrders;
    var stockInResult = results.stockIn;
    var requisitionsResult = results.requisitions;
    var stockOutResult = results.stockOut;
    var adjustmentsResult = results.adjustments;
    var usersResult = results.users;
    var consumptionResult = results.consumption;
    var tourNamesResult = results.tourNames;
    var settingsResult = results.settings;

    // ---- 品类 ----
    if (categoriesResult.data) {
      _appCache.categories = categoriesResult.data;
      _appCache.inventoryCategories = categoriesResult.data.map(c => ({
        code: c.code, name: c.name, created_at: c.created_at
      }));
    }

    // ---- 库存物品 ----
    if (inventoryResult.data) {
      _appCache.inventory = inventoryResult.data;
    }

    // ---- 采购单 ----
    if (purchaseOrdersResult.data) {
      _appCache.purchaseOrders = purchaseOrdersResult.data.map(po => ({
        ...po,
        suppliers: typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]') : (po.suppliers || []),
        items: (po.purchase_order_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, supplier: item.supplier, category: item.category_name,
          code: item.item_code, name: item.name, brand: item.brand, model: item.model,
          quantity: Number(item.quantity), unit: item.unit,
          price: Number(item.price), amount: Number(item.amount)
        }))
      }));
    }

    // ---- 入库记录 ----
    if (stockInResult.data) {
      _appCache.stockInRecords = stockInResult.data.map(rec => ({
        ...rec,
        items: (rec.stock_in_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, supplier: item.supplier, category: item.category_name,
          code: item.item_code, name: item.name, brand: item.brand, model: item.model,
          quantity: Number(item.quantity), actual_quantity: Number(item.actual_quantity),
          unit: item.unit, price: Number(item.price), amount: Number(item.amount),
          inventory_item_id: item.inventory_item_id
        }))
      }));
    }

    // ---- 领用单 ----
    if (requisitionsResult.data) {
      _appCache.requisitions = requisitionsResult.data.map(req => ({
        ...req,
        items: (req.requisition_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, item_id: item.inventory_item_id, name: item.name,
          code: item.code, category: item.category, unit: item.unit,
          quantity: Number(item.quantity), brand: item.brand, model: item.model
        }))
      }));
    }

    // ---- 出库记录 ----
    if (stockOutResult.data) {
      _appCache.stockOutRecords = stockOutResult.data.map(rec => ({
        ...rec,
        items: (rec.stock_out_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, item_id: item.inventory_item_id, name: item.name,
          code: item.code, category: item.category, unit: item.unit,
          quantity: Number(item.quantity), requested_quantity: Number(item.requested_quantity),
          brand: item.brand, model: item.model
        }))
      }));
    }

    // ---- 库存调整 ----
    if (adjustmentsResult && adjustmentsResult.data) {
      _appCache.inventoryAdjustments = adjustmentsResult.data;
    }

    // ---- 用户 ----
    if (usersResult && usersResult.data) {
      _appCache.users = usersResult.data.map(u => ({
        ...u,
        status: (u.status === undefined || u.status === null)
          ? (u.is_active ? 'active' : 'pending') : u.status
      }));
    }

    // ---- 品牌/型号历史 ----
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
      brandData.forEach(d => {
        if (!brandHist[d.item_name]) brandHist[d.item_name] = [];
        if (!brandHist[d.item_name].includes(d.value)) brandHist[d.item_name].push(d.value);
      });
      _appCache.brandHistory = brandHist;
    }
    if (modelData) {
      var modelHist = {};
      modelData.forEach(d => {
        if (!modelHist[d.item_name]) modelHist[d.item_name] = [];
        if (!modelHist[d.item_name].includes(d.value)) modelHist[d.item_name].push(d.value);
      });
      _appCache.modelHistory = modelHist;
    }

    // ---- 领用标准 ----
    if (consumptionResult && consumptionResult.data) {
      _appCache.consumptionStandards = consumptionResult.data;
    }

    // ---- 团期名称主数据 ----
    if (tourNamesResult && tourNamesResult.data) {
      _appCache.tourNames = tourNamesResult.data;
    }

    // ---- 系统设置 ----
    if (settingsResult && settingsResult.data) {
      _appCache.settings = settingsResult.data;
    }

    var elapsed = Date.now() - startTime;
    console.log('[Sync] 同步完成 (' + elapsed + 'ms)');
    console.log('[Sync] 数据概览:', {
      categories: _appCache.categories.length,
      inventory: _appCache.inventory.length,
      purchaseOrders: _appCache.purchaseOrders.length,
      stockInRecords: _appCache.stockInRecords.length,
      requisitions: _appCache.requisitions.length,
      stockOutRecords: _appCache.stockOutRecords.length,
      users: _appCache.users.length,
      consumptionStandards: _appCache.consumptionStandards.length
    });

    // 同步完成后刷新通知徽章
    try { if (typeof checkNotifications === 'function') checkNotifications(); } catch(e) {}

  } catch (err) {
    console.error('[Sync] 同步失败:', err.message);
  } finally {
    _isInitialLoading = false;
  }
}

// ============================================================
// 按模块增量同步（轻量同频）
// 只拉当前模块需要的 1~4 张表，用于：① 定时轮询 ② 标签页聚焦 ③ 保存后局部刷新
// 相比 syncFromSupabase 的 11 表全量，这里只动相关表 + 加 limit，更快，
// 且保证多用户同频（A 改完，B 在轮询间隔内自动看到最新）。
// ============================================================
const MODULE_TABLE_PLAN = {
  'dashboard':        ['inventory', 'stockIn', 'stockOut', 'requisitions'],
  'inventory':        ['inventory', 'stockIn', 'stockOut', 'categories'],
  'categories':       ['categories', 'inventory'],
  'purchase':         ['purchaseOrders'],
  'stock-in':         ['stockIn'],
  'requisition':      ['requisitions'],
  'stock-out':        ['stockOut'],
  'monthly-summary':  ['stockIn', 'stockOut', 'requisitions', 'inventory', 'purchaseOrders'],
  'reports':          ['stockOut', 'requisitions', 'tourNames', 'inventory'],
  'analytics':        ['stockIn', 'stockOut'],
  'history':          ['adjustments'],
  'admin-users':      ['users'],
  'admin-roles':      ['users']
};

async function syncModuleTables(module) {
  if (!isSupabaseReady()) return;
  const sb = getSupabase();
  if (!sb) return;
  const keys = MODULE_TABLE_PLAN[module] || ['inventory'];
  const qb = {
    categories:     () => sb.from('categories').select('*').order('id'),
    inventory:      () => sb.from('inventory_items').select('*').order('id'),
    purchaseOrders: () => sb.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false }).limit(500),
    stockIn:        () => sb.from('stock_in_records').select('*, stock_in_items(*)').order('created_at', { ascending: false }).limit(800),
    requisitions:   () => sb.from('requisitions').select('*, requisition_items(*)').order('created_at', { ascending: false }).limit(800),
    stockOut:       () => sb.from('stock_out_records').select('*, stock_out_items(*)').order('created_at', { ascending: false }).limit(800),
    adjustments:    () => sb.from('inventory_adjustments').select('*').order('created_at', { ascending: false }).limit(500),
    users:          () => sb.from('users').select('*').order('id'),
    tourNames:      () => sb.from('tour_names').select('*').order('name')
  };
  const picked = keys.filter(k => qb[k]).map(k => qb[k]());
  if (picked.length === 0) return;
  console.log('[Sync] 模块增量同步: ' + module + ' (' + keys.join(',') + ')');
  try {
    const settled = await Promise.allSettled(picked);
    const results = {};
    keys.forEach((k, i) => {
      const r = settled[i];
      results[k] = (r && r.status === 'fulfilled') ? r.value : { data: null, error: (r && r.reason) };
    });
    // 写入缓存（与全量同步一致的数据结构）
    if (results.categories && results.categories.data) {
      _appCache.categories = results.categories.data;
      _appCache.inventoryCategories = results.categories.data.map(c => ({ code: c.code, name: c.name, created_at: c.created_at }));
    }
    if (results.inventory && results.inventory.data) _appCache.inventory = results.inventory.data;
    if (results.purchaseOrders && results.purchaseOrders.data) {
      _appCache.purchaseOrders = results.purchaseOrders.data.map(po => ({
        ...po,
        suppliers: typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]') : (po.suppliers || []),
        items: (po.purchase_order_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, supplier: item.supplier, category: item.category_name, code: item.item_code, name: item.name,
          brand: item.brand, model: item.model, quantity: Number(item.quantity), unit: item.unit,
          price: Number(item.price), amount: Number(item.amount)
        }))
      }));
    }
    if (results.stockIn && results.stockIn.data) {
      _appCache.stockInRecords = results.stockIn.data.map(rec => ({
        ...rec,
        items: (rec.stock_in_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, supplier: item.supplier, category: item.category_name, code: item.item_code, name: item.name,
          brand: item.brand, model: item.model, quantity: Number(item.quantity), actual_quantity: Number(item.actual_quantity),
          unit: item.unit, price: Number(item.price), amount: Number(item.amount), inventory_item_id: item.inventory_item_id
        }))
      }));
    }
    if (results.requisitions && results.requisitions.data) {
      _appCache.requisitions = results.requisitions.data.map(req => ({
        ...req,
        items: (req.requisition_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, item_id: item.inventory_item_id, name: item.name, code: item.code, category: item.category,
          unit: item.unit, quantity: Number(item.quantity), brand: item.brand, model: item.model
        }))
      }));
    }
    if (results.stockOut && results.stockOut.data) {
      _appCache.stockOutRecords = results.stockOut.data.map(rec => ({
        ...rec,
        items: (rec.stock_out_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
          id: item.id, item_id: item.inventory_item_id, name: item.name, code: item.code, category: item.category,
          unit: item.unit, quantity: Number(item.quantity), requested_quantity: Number(item.requested_quantity),
          brand: item.brand, model: item.model
        }))
      }));
    }
    if (results.adjustments && results.adjustments.data) _appCache.inventoryAdjustments = results.adjustments.data;
    if (results.users && results.users.data) {
      _appCache.users = results.users.data.map(u => ({
        ...u,
        status: (u.status === undefined || u.status === null) ? (u.is_active ? 'active' : 'pending') : u.status
      }));
    }
    if (results.tourNames && results.tourNames.data) _appCache.tourNames = results.tourNames.data;
  } catch (e) {
    console.warn('[Sync] 模块增量同步失败 ' + module + ': ' + e.message);
  }
}

// ============================================================
// refreshData — 按分类刷新单种数据（用于写入后的局部刷新）
// ============================================================
async function refreshData(dataType) {
  if (!isSupabaseReady()) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    switch (dataType) {
      case 'inventory': {
        const { data } = await sb.from('inventory_items').select('*').order('id');
        if (data) _appCache.inventory = data;
        break;
      }
      case 'purchaseOrders': {
        const { data } = await sb.from('purchase_orders')
          .select('*, purchase_order_items(*)')
          .order('created_at', { ascending: false });
        if (data) {
          _appCache.purchaseOrders = data.map(po => ({
            ...po,
            suppliers: typeof po.suppliers === 'string' ? JSON.parse(po.suppliers || '[]') : (po.suppliers || []),
            items: (po.purchase_order_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
              id: item.id, supplier: item.supplier, category: item.category_name,
              code: item.item_code, name: item.name, brand: item.brand, model: item.model,
              quantity: Number(item.quantity), unit: item.unit,
              price: Number(item.price), amount: Number(item.amount)
            }))
          }));
        }
        break;
      }
      case 'categories': {
        const { data } = await sb.from('categories').select('*').order('id');
        if (data) {
          _appCache.categories = data;
          _appCache.inventoryCategories = data.map(c => ({ code: c.code, name: c.name, created_at: c.created_at }));
        }
        break;
      }
      case 'requisitions': {
        const { data } = await sb.from('requisitions')
          .select('*, requisition_items(*)')
          .order('created_at', { ascending: false });
        if (data) {
          _appCache.requisitions = data.map(req => ({
            ...req,
            items: (req.requisition_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
              id: item.id, item_id: item.inventory_item_id, name: item.name,
              code: item.code, category: item.category, unit: item.unit,
              quantity: Number(item.quantity), brand: item.brand, model: item.model
            }))
          }));
        }
        break;
      }
      case 'stockInRecords': {
        const { data } = await sb.from('stock_in_records')
          .select('*, stock_in_items(*)')
          .order('created_at', { ascending: false });
        if (data) {
          _appCache.stockInRecords = data.map(rec => ({
            ...rec,
            items: (rec.stock_in_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
              id: item.id, supplier: item.supplier, category: item.category_name,
              code: item.item_code, name: item.name, brand: item.brand, model: item.model,
              quantity: Number(item.quantity), actual_quantity: Number(item.actual_quantity),
              unit: item.unit, price: Number(item.price), amount: Number(item.amount),
              inventory_item_id: item.inventory_item_id
            }))
          }));
        }
        break;
      }
      case 'stockOutRecords': {
        const { data } = await sb.from('stock_out_records')
          .select('*, stock_out_items(*)')
          .order('created_at', { ascending: false });
        if (data) {
          _appCache.stockOutRecords = data.map(rec => ({
            ...rec,
            items: (rec.stock_out_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
              id: item.id, item_id: item.inventory_item_id, name: item.name,
              code: item.code, category: item.category, unit: item.unit,
              quantity: Number(item.quantity), requested_quantity: Number(item.requested_quantity),
              brand: item.brand, model: item.model
            }))
          }));
        }
        break;
      }
      case 'consumptionStandards': {
        const { data } = await sb.from('consumption_standards').select('*').order('id');
        if (data) _appCache.consumptionStandards = data;
        break;
      }
      case 'tourNames': {
        const { data } = await sb.from('tour_names').select('*').order('name');
        if (data) _appCache.tourNames = data;
        break;
      }
      case 'users': {
        const { data } = await sb.from('users').select('*').order('id');
        if (data) {
          _appCache.users = data.map(u => ({
            ...u,
            status: (u.status === undefined || u.status === null)
              ? (u.is_active ? 'active' : 'pending') : u.status
          }));
        }
        break;
      }
    }
    console.log('[Sync] 局部刷新 ' + dataType + ' 完成');
  } catch (err) {
    console.warn('[Sync] 局部刷新 ' + dataType + ' 失败:', err.message);
  }
}

// ============================================================
// 等待同步完成
// ============================================================
function waitForSupabaseSync() {
  return Promise.resolve();
}
