-- ============================================================
-- 迁移脚本 v5.43 · 全量修复配套 DDL
-- 生成日期: 2026-08-06
-- 执行方式: Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 说明: 全脚本可重复执行（幂等）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 放宽 purchase_orders.status 约束（新增 partially_stockin 部分入库）
-- ------------------------------------------------------------
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('pending_stockin','partially_stockin','stockin_completed','cancelled'));

-- ------------------------------------------------------------
-- 2. 放宽 requisitions.status 约束（新增审核流状态）
-- ------------------------------------------------------------
ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check
  CHECK (status IN (
    'pending_approval',      -- 待审核
    'approved',              -- 已审核（待出库）
    'rejected',              -- 已驳回
    'pending_outbound',      -- 待出库（兼容历史数据）
    'outbound_completed',    -- 已出库
    'withdrawn'              -- 已撤回
  ));

-- ------------------------------------------------------------
-- 3. requisitions 补审核字段
-- ------------------------------------------------------------
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_by      BIGINT REFERENCES users(id);
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS reject_reason    TEXT DEFAULT '';

-- ------------------------------------------------------------
-- 4. 新建 consumption_standards（领用标准表）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumption_standards (
  id           BIGSERIAL PRIMARY KEY,
  item_name    TEXT NOT NULL,
  scenario     TEXT NOT NULL DEFAULT '通用',
  category     TEXT DEFAULT '',
  max_per_tour NUMERIC(10,2) NOT NULL DEFAULT 0,
  remark       TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_item_scenario
  ON consumption_standards(item_name, scenario);

-- ------------------------------------------------------------
-- 5. 新建 settings（系统设置表，key-value）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT DEFAULT '',
  remark     TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value, remark) VALUES
  ('low_stock_threshold', '10',   '库存预警阈值（低于此数量标记为低库存）'),
  ('require_req_approval', 'true','领用申请是否需要审核后才可出库'),
  ('company_name', '库存管理系统','系统显示名称')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 6. 移除数据库审计触发器（避免与前端 writeAuditLog 双写）
--    数据库触发器无法感知应用层登录用户，写出的日志 user_name 为 NULL，
--    前端 writeAuditLog 已覆盖全部 SupaDB 写路径且带用户身份，故保留前端。
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_purchase_orders  ON purchase_orders;
DROP TRIGGER IF EXISTS audit_inventory_items  ON inventory_items;
DROP TRIGGER IF EXISTS audit_stock_in_records ON stock_in_records;
DROP TRIGGER IF EXISTS audit_requisitions     ON requisitions;
DROP TRIGGER IF EXISTS audit_stock_out_records ON stock_out_records;
DROP TRIGGER IF EXISTS audit_categories       ON categories;

-- ------------------------------------------------------------
-- 7. 补 updated_at 触发器（新表）
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_cs ON consumption_standards;
CREATE TRIGGER set_updated_at_cs BEFORE UPDATE ON consumption_standards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_settings ON settings;
CREATE TRIGGER set_updated_at_settings BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 8. 索引补齐
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_si_items_inv ON stock_in_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

COMMIT;

-- ============================================================
-- 9. 数据回填（在上面 COMMIT 之后单独执行，避免 DDL 与 DML 混在一个事务）
-- ============================================================

-- 9.1 清理数据库触发器产生的"无用户身份"重复审计日志
DELETE FROM audit_logs
WHERE user_name IS NULL
  AND user_id IS NULL
  AND entity_type IN ('purchase_orders','inventory_items','stock_in_records',
                      'requisitions','stock_out_records','categories');

-- 9.2 回填 inventory_items.category_id（按品类名匹配；线上真实列为 category_name）
UPDATE inventory_items i
SET category_id = c.id
FROM categories c
WHERE i.category_id IS NULL
  AND i.category_name IS NOT NULL
  AND i.category_name <> ''
  AND c.name = i.category_name;

-- 9.3 回填 stock_in_items.inventory_item_id（按物品编码 item_code 优先，其次名称）
UPDATE stock_in_items s
SET inventory_item_id = i.id
FROM inventory_items i
WHERE s.inventory_item_id IS NULL
  AND s.item_code IS NOT NULL AND s.item_code <> ''
  AND i.code = s.item_code;

UPDATE stock_in_items s
SET inventory_item_id = i.id
FROM inventory_items i
WHERE s.inventory_item_id IS NULL
  AND i.name = s.name;

-- 9.4 回填 inventory_items.unit_price（用入库明细的加权均价；线上单价列为 price）
UPDATE inventory_items i
SET unit_price = t.avg_price
FROM (
  SELECT inventory_item_id,
         SUM(COALESCE(amount, quantity * COALESCE(price,0))) / NULLIF(SUM(quantity),0) AS avg_price
  FROM stock_in_items
  WHERE inventory_item_id IS NOT NULL
    AND COALESCE(price,0) > 0
  GROUP BY inventory_item_id
) t
WHERE i.id = t.inventory_item_id
  AND COALESCE(i.unit_price,0) = 0
  AND t.avg_price IS NOT NULL;

-- 9.5 激活所有历史账号（若仍有 pending）
UPDATE users SET status = 'active' WHERE status <> 'active';

-- ============================================================
-- 10. 验证查询（执行后逐条检查结果）
-- ============================================================
-- SELECT status, count(*) FROM requisitions GROUP BY status;
-- SELECT count(*) AS null_category FROM inventory_items WHERE category_id IS NULL;
-- SELECT count(*) AS null_inv_fk FROM stock_in_items WHERE inventory_item_id IS NULL;
-- SELECT count(*) AS zero_price FROM inventory_items WHERE COALESCE(unit_price,0)=0;
-- SELECT count(*) AS total_logs FROM audit_logs;
-- SELECT count(*) FROM consumption_standards;
-- SELECT * FROM settings;
