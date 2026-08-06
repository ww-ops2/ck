-- Migration: 将 inventory_items 表的 stock/safety_stock 从 INTEGER 改为 NUMERIC(12,3)
-- 原因：库存商品需要支持小数位（如 1.5kg、0.5箱）
-- 执行方式：在 Supabase SQL Editor 中运行此脚本

BEGIN;

-- 修改 stock 列：INTEGER → NUMERIC(12,3)
ALTER TABLE inventory_items 
  ALTER COLUMN stock TYPE NUMERIC(12,3) USING stock::NUMERIC(12,3),
  ALTER COLUMN stock SET DEFAULT 0,
  ALTER COLUMN stock SET NOT NULL;

-- 修改 safety_stock 列：INTEGER → NUMERIC(12,3)
ALTER TABLE inventory_items 
  ALTER COLUMN safety_stock TYPE NUMERIC(12,3) USING safety_stock::NUMERIC(12,3),
  ALTER COLUMN safety_stock SET DEFAULT 10,
  ALTER COLUMN safety_stock SET NOT NULL;

COMMIT;
