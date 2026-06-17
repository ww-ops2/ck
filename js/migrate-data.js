/**
 * 数据迁移工具：localStorage → Supabase
 * 使用方法：在浏览器控制台执行 migrateAllData()
 * 前提：Supabase 表已创建，supabase-db.js 已加载
 */

async function migrateAllData() {
  const sb = getSupabase();
  if (!sb) {
    console.error('❌ Supabase 未连接，请检查配置');
    return;
  }

  console.log('🚀 开始数据迁移...');
  const results = {};

  // ---- 1. 迁移品类 ----
  try {
    const cats = JSON.parse(localStorage.getItem('categories') || '[]');
    if (cats.length > 0) {
      const { error } = await sb.from('categories').upsert(
        cats.map(c => ({
          code: c.code,
          name: c.name,
          remark: c.remark || '',
          created_at: c.created_at || new Date().toISOString()
        })),
        { onConflict: 'code' }
      );
      results.categories = error ? `❌ ${error.message}` : `✅ ${cats.length} 条`;
    } else {
      results.categories = '⏭️ 无数据';
    }
  } catch (e) { results.categories = '❌ ' + e.message; }

  // ---- 2. 迁移库存物品 ----
  try {
    const inv = JSON.parse(localStorage.getItem('inventory') || '[]');
    if (inv.length > 0) {
      const { error } = await sb.from('inventory_items').upsert(
        inv.map(item => ({
          code: item.code,
          name: item.name,
          brand: item.brand || '',
          model: item.model || '',
          category_name: item.category || '未分类',
          stock: item.stock || 0,
          unit: item.unit || '',
          safety_stock: item.safety_stock || 10,
          last_stockin_date: item.last_stockin_date || null,
          last_stockin_batch: item.last_stockin_batch || null,
          source: item.source || null,
          created_at: item.created_at || new Date().toISOString()
        })),
        { onConflict: 'code' }
      );
      results.inventory = error ? `❌ ${error.message}` : `✅ ${inv.length} 条`;
    } else {
      results.inventory = '⏭️ 无数据';
    }
  } catch (e) { results.inventory = '❌ ' + e.message; }

  // ---- 3. 迁移采购单 ----
  try {
    const pos = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    if (pos.length > 0) {
      for (const po of pos) {
        // 插入采购单主体
        const { data: insertedPO, error: poError } = await sb.from('purchase_orders').upsert({
          code: po.code,
          purchase_date: po.purchase_date,
          purchaser: po.purchaser,
          suppliers: JSON.stringify(po.suppliers || []),
          total_amount: po.total_amount || 0,
          status: po.status || 'pending_stockin',
          remark: po.remark || '',
          created_by_name: po.purchaser || '',
          created_at: po.created_at || new Date().toISOString()
        }, { onConflict: 'code' }).select().single();

        if (poError) {
          console.warn(`采购单 ${po.code} 插入失败:`, poError.message);
          continue;
        }

        // 插入明细
        if (po.items && po.items.length > 0 && insertedPO) {
          await sb.from('purchase_order_items').insert(
            po.items.map((item, idx) => ({
              purchase_order_id: insertedPO.id,
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
            }))
          );
        }
      }
      results.purchaseOrders = `✅ ${pos.length} 条`;
    } else {
      results.purchaseOrders = '⏭️ 无数据';
    }
  } catch (e) { results.purchaseOrders = '❌ ' + e.message; }

  // ---- 4. 迁移入库记录 ----
  try {
    const sir = JSON.parse(localStorage.getItem('stockInRecords') || '[]');
    if (sir.length > 0) {
      for (const rec of sir) {
        const { data: insertedRec, error: recError } = await sb.from('stock_in_records').upsert({
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
          created_by_name: rec.confirmed_by || '',
          created_at: rec.created_at || new Date().toISOString()
        }, { onConflict: 'code' }).select().single();

        if (recError) {
          console.warn(`入库记录 ${rec.code} 插入失败:`, recError.message);
          continue;
        }

        if (rec.items && rec.items.length > 0 && insertedRec) {
          await sb.from('stock_in_items').insert(
            rec.items.map((item, idx) => ({
              stock_in_record_id: insertedRec.id,
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
              sort_order: idx
            }))
          );
        }
      }
      results.stockInRecords = `✅ ${sir.length} 条`;
    } else {
      results.stockInRecords = '⏭️ 无数据';
    }
  } catch (e) { results.stockInRecords = '❌ ' + e.message; }

  // ---- 5. 迁移领用申请 ----
  try {
    const reqs = JSON.parse(localStorage.getItem('requisitions') || '[]');
    if (reqs.length > 0) {
      for (const req of reqs) {
        const { data: insertedReq, error: reqError } = await sb.from('requisitions').upsert({
          code: req.code,
          tour_date: req.tour_date || null,
          tour_name: req.tour_name || '',
          scenario: req.scenario || '',
          applicant: req.applicant,
          apply_date: req.apply_date,
          total_quantity: req.total_quantity || 0,
          status: req.status || 'pending_outbound',
          remark: req.remark || '',
          created_by_name: req.applicant || '',
          created_at: req.created_at || new Date().toISOString()
        }, { onConflict: 'code' }).select().single();

        if (reqError) {
          console.warn(`领用单 ${req.code} 插入失败:`, reqError.message);
          continue;
        }

        if (req.items && req.items.length > 0 && insertedReq) {
          await sb.from('requisition_items').insert(
            req.items.map((item, idx) => ({
              requisition_id: insertedReq.id,
              name: item.name,
              code: item.code || '',
              category: item.category || '',
              unit: item.unit || '',
              quantity: item.quantity || 0,
              brand: item.brand || '',
              model: item.model || '',
              sort_order: idx
            }))
          );
        }
      }
      results.requisitions = `✅ ${reqs.length} 条`;
    } else {
      results.requisitions = '⏭️ 无数据';
    }
  } catch (e) { results.requisitions = '❌ ' + e.message; }

  // ---- 6. 迁移出库记录 ----
  try {
    const sor = JSON.parse(localStorage.getItem('stockOutRecords') || '[]');
    if (sor.length > 0) {
      for (const rec of sor) {
        const { data: insertedRec, error: recError } = await sb.from('stock_out_records').upsert({
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
          created_by_name: rec.confirmed_by || '',
          created_at: rec.created_at || new Date().toISOString()
        }, { onConflict: 'code' }).select().single();

        if (recError) {
          console.warn(`出库记录 ${rec.code} 插入失败:`, recError.message);
          continue;
        }

        if (rec.items && rec.items.length > 0 && insertedRec) {
          await sb.from('stock_out_items').insert(
            rec.items.map((item, idx) => ({
              stock_out_record_id: insertedRec.id,
              name: item.name,
              code: item.code || '',
              category: item.category || '',
              unit: item.unit || '',
              quantity: item.quantity || 0,
              requested_quantity: item.requested_quantity || item.quantity || 0,
              brand: item.brand || '',
              model: item.model || '',
              sort_order: idx
            }))
          );
        }
      }
      results.stockOutRecords = `✅ ${sor.length} 条`;
    } else {
      results.stockOutRecords = '⏭️ 无数据';
    }
  } catch (e) { results.stockOutRecords = '❌ ' + e.message; }

  // ---- 7. 迁移品牌/型号历史 ----
  try {
    const brandHist = JSON.parse(localStorage.getItem('brandHistory') || '{}');
    const modelHist = JSON.parse(localStorage.getItem('modelHistory') || '{}');
    let histCount = 0;

    for (const [itemName, brands] of Object.entries(brandHist)) {
      for (const brand of brands) {
        await sb.from('item_history').upsert({
          item_name: itemName, type: 'brand', value: brand, use_count: 1
        }, { onConflict: 'item_name,type,value' });
        histCount++;
      }
    }
    for (const [itemName, models] of Object.entries(modelHist)) {
      for (const model of models) {
        await sb.from('item_history').upsert({
          item_name: itemName, type: 'model', value: model, use_count: 1
        }, { onConflict: 'item_name,type,value' });
        histCount++;
      }
    }
    results.itemHistory = histCount > 0 ? `✅ ${histCount} 条` : '⏭️ 无数据';
  } catch (e) { results.itemHistory = '❌ ' + e.message; }

  // ---- 8. 迁移用户与权限 ----
  try {
    // users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.length > 0) {
      const { error } = await sb.from('users').upsert(
        users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role })),
        { onConflict: 'username' }
      );
      results.users = error ? `❌ ${error.message}` : `✅ ${users.length} 条`;
    } else {
      results.users = '⏭️ 无数据';
    }

    // rolePermissions (object -> rows)
    const rolePerms = JSON.parse(localStorage.getItem('rolePermissions') || '{}');
    let rpCount = 0;
    for (const [role, perms] of Object.entries(rolePerms)) {
      for (const p of perms) {
        await sb.from('role_permissions').upsert({ role: role, permission: p }, { onConflict: 'role,permission' });
        rpCount++;
      }
    }
    results.rolePermissions = rpCount > 0 ? `✅ ${rpCount} 条` : '⏭️ 无数据';

    // userPermissions
    const userPerms = JSON.parse(localStorage.getItem('userPermissions') || '{}');
    let upCount = 0;
    for (const [uid, perms] of Object.entries(userPerms)) {
      for (const p of perms) {
        await sb.from('user_permissions').upsert({ user_id: parseInt(uid,10), permission: p }, { onConflict: 'user_id,permission' });
        upCount++;
      }
    }
    results.userPermissions = upCount > 0 ? `✅ ${upCount} 条` : '⏭️ 无数据';

  } catch (e) { results.users = results.rolePermissions = results.userPermissions = '❌ ' + e.message; }

  // ---- 输出结果 ----
  console.log('\n📊 迁移结果:');
  console.table(results);
  console.log('\n✅ 数据迁移完成！');
  return results;
}
