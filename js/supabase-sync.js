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
    // 并行拉取所有数据
    const [
      categoriesResult,
      inventoryResult,
      purchaseOrdersResult,
      stockInResult,
      requisitionsResult,
      stockOutResult,
      adjustmentsResult,
      usersResult,
      consumptionResult,
      settingsResult
    ] = await Promise.all([
      sb.from('categories').select('*').order('id'),
      sb.from('inventory_items').select('*').order('id'),
      sb.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false }),
      sb.from('stock_in_records').select('*, stock_in_items(*)').order('created_at', { ascending: false }),
      sb.from('requisitions').select('*, requisition_items(*)').order('created_at', { ascending: false }),
      sb.from('stock_out_records').select('*, stock_out_items(*)').order('created_at', { ascending: false }),
      sb.from('inventory_adjustments').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('users').select('*').order('id'),
      sb.from('consumption_standards').select('*').order('id'),
      sb.from('settings').select('*')
    ]);

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
