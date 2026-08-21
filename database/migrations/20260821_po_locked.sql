-- 2026-08-21：采购单入库锁定支持
-- 新增 is_locked 布尔列，用于"仓库已锁定单据、采购员不可再编辑"的场景。
-- 锁定与入库进度（pending_stockin / partially_stockin / stockin_completed）正交：
--   锁定时 status 仍为 pending_stockin，仅 is_locked=true 表示仓库已确认单据无误、开始准备入库。
-- 允许重复执行（IF NOT EXISTS 幂等）。

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
