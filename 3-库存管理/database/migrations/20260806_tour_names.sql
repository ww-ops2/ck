-- ============================================================
-- 迁移脚本 v5.43 · 团期名称主数据表 (tour_names)
-- 生成日期: 2026-08-06
-- 执行方式: Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 说明: 幂等可重复执行
-- 目的: 团期名称作为主数据集中维护，报表页可新增，领用单下拉引用，
--       保证多人协作下团期名称一致且落库（不依赖本地浏览器）。
-- ============================================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS tour_names (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  remark     TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 唯一索引：团期名称不可重复
CREATE UNIQUE INDEX IF NOT EXISTS idx_tour_names_name ON tour_names(name);

-- 3. updated_at 自动更新触发器
DROP TRIGGER IF EXISTS set_updated_at_tn ON tour_names;
CREATE TRIGGER set_updated_at_tn BEFORE UPDATE ON tour_names
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
