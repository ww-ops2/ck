-- ============================================================
-- HQ Foundation - Phase 1 (2026-11-23)
-- Purpose: add brand-new tables for HQ subject inventory ledger.
-- SAFETY: This script ONLY creates NEW tables. It does NOT alter,
--         drop, or touch any existing table or any existing row.
--         Train subject data is 100% untouched.
-- SAFETY: Idempotent - safe to run multiple times.
-- NOTE:   All comments are ASCII to avoid SQL editor parse issues.
-- ============================================================

-- ------------------------------------------------------------
-- 1. usage_categories : configurable usage classification for HQ
--    (live gift / tour material / admin material / warehouse ...)
--    Admin can add more categories later without schema changes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_categories (
  id          bigserial PRIMARY KEY,
  subject     text NOT NULL DEFAULT 'hq',
  code        text NOT NULL,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, code)
);

ALTER TABLE public.usage_categories DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_categories TO anon, authenticated;

-- initial 4 categories (insert only if not exists)
INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'live_gift',      '直播礼品', 10)
ON CONFLICT (subject, code) DO NOTHING;
INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'tour_material',  '出团物料', 20)
ON CONFLICT (subject, code) DO NOTHING;
INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'admin_material', '行政物料', 30)
ON CONFLICT (subject, code) DO NOTHING;
INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'warehouse',      '总部仓库', 40)
ON CONFLICT (subject, code) DO NOTHING;

-- ------------------------------------------------------------
-- 2. stock_ledger : 8-segment quantity ledger (core table)
--    one row per (subject, period, usage, item)
--    flow fields  = opening / purchase_in / recovery_in / consume_scrap
--    stock fields = physical / locked / available / safety
--    balance rule = opening + purchase_in + recovery_in
--                   = available + locked + consume_scrap
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id               bigserial PRIMARY KEY,
  subject          text NOT NULL DEFAULT 'hq',
  period           text NOT NULL,
  usage_code       text NOT NULL,
  item_id          bigint,
  sku              text,
  item_name        text,
  spec             text,
  brand            text,
  zone             text,
  owner            text,
  opening_qty      numeric(14,3) NOT NULL DEFAULT 0,
  purchase_in_qty  numeric(14,3) NOT NULL DEFAULT 0,
  recovery_in_qty  numeric(14,3) NOT NULL DEFAULT 0,
  consume_scrap_qty numeric(14,3) NOT NULL DEFAULT 0,
  physical_qty     numeric(14,3) NOT NULL DEFAULT 0,
  locked_qty       numeric(14,3) NOT NULL DEFAULT 0,
  available_qty    numeric(14,3) NOT NULL DEFAULT 0,
  safety_qty       numeric(14,3) NOT NULL DEFAULT 0,
  bound_doc        text,
  reconcile_flag   text NOT NULL DEFAULT 'balanced',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, period, usage_code, item_id)
);

ALTER TABLE public.stock_ledger DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_ledger TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_stock_ledger_subj_period
  ON public.stock_ledger (subject, period);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_subj_usage
  ON public.stock_ledger (subject, usage_code);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item
  ON public.stock_ledger (subject, item_id);

-- ------------------------------------------------------------
-- 3. posting_journal : immutable audit trail of every posting
--    records deltas and the resulting balance snapshot
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posting_journal (
  id                bigserial PRIMARY KEY,
  subject           text NOT NULL DEFAULT 'hq',
  doc_type          text NOT NULL,
  doc_no            text NOT NULL,
  period            text NOT NULL,
  usage_code        text,
  item_id           bigint,
  sku               text,
  qty               numeric(14,3),
  deltas            jsonb,
  balance_snapshot  jsonb,
  operator          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posting_journal DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posting_journal TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_posting_journal_subj_doc
  ON public.posting_journal (subject, doc_no);
CREATE INDEX IF NOT EXISTS idx_posting_journal_subj_time
  ON public.posting_journal (subject, created_at);

-- ============================================================
-- ROLLBACK (manual, only if you really want to remove HQ foundation)
-- DROP TABLE IF EXISTS public.posting_journal;
-- DROP TABLE IF EXISTS public.stock_ledger;
-- DROP TABLE IF EXISTS public.usage_categories;
-- Existing train tables are never touched by this migration.
-- ============================================================
