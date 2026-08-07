-- ============================================================
-- 非采购入库 & 异常报损 数据表（v5.48）
-- 执行方式：在 Supabase SQL Editor 中粘贴本文件全部内容并执行
-- 注意：若数据库已开启 RLS，请参考 20260806_v5.43_fullfix.sql 中的策略，
--       为这两张表追加允许 anon 读写的策略（与 inventory_items 等表保持一致）。
-- ============================================================

-- 非采购入库（退库 / 调拨 / 盘盈等）：提交后需仓库管理员审核
CREATE TABLE IF NOT EXISTS non_purchase_stock_in (
  id                BIGSERIAL PRIMARY KEY,
  code              TEXT        NOT NULL,
  item_code         TEXT        NOT NULL DEFAULT '',
  name              TEXT        NOT NULL DEFAULT '',
  category          TEXT        NOT NULL DEFAULT '',
  unit              TEXT        NOT NULL DEFAULT '',
  qty               NUMERIC     NOT NULL DEFAULT 0,
  tour_id           BIGINT,
  tour_name         TEXT        NOT NULL DEFAULT '',
  price             NUMERIC     NOT NULL DEFAULT 0,   -- 入库单价（默认取物品当前加权均价，审核时回填）
  amount            NUMERIC     NOT NULL DEFAULT 0,
  reason            TEXT        NOT NULL DEFAULT '',
  status            TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  applicant_id      BIGINT,
  applicant_name    TEXT        NOT NULL DEFAULT '',
  reviewer_id       BIGINT,
  reviewer_name     TEXT        NOT NULL DEFAULT '',
  approved_price    NUMERIC,
  remark            TEXT        NOT NULL DEFAULT '',
  reject_reason     TEXT        NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nonpurchase_status ON non_purchase_stock_in (status);
CREATE INDEX IF NOT EXISTS idx_nonpurchase_code   ON non_purchase_stock_in (item_code);
CREATE INDEX IF NOT EXISTS idx_nonpurchase_tour   ON non_purchase_stock_in (tour_name);

-- 异常报损（不审核，必填原因；损失金额 = 当前加权均价 × 数量）
CREATE TABLE IF NOT EXISTS loss_records (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT        NOT NULL,
  item_code     TEXT        NOT NULL DEFAULT '',
  name          TEXT        NOT NULL DEFAULT '',
  category      TEXT        NOT NULL DEFAULT '',
  unit          TEXT        NOT NULL DEFAULT '',
  qty           NUMERIC     NOT NULL DEFAULT 0,
  tour_id       BIGINT,
  tour_name     TEXT        NOT NULL DEFAULT '',
  unit_price    NUMERIC     NOT NULL DEFAULT 0,   -- 报损时物品的当前加权均价
  loss_amount   NUMERIC     NOT NULL DEFAULT 0,   -- = qty × unit_price
  reason        TEXT        NOT NULL DEFAULT '',   -- 必填：损失原因
  applicant_id  BIGINT,
  applicant_name TEXT       NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loss_tour     ON loss_records (tour_name);
CREATE INDEX IF NOT EXISTS idx_loss_code     ON loss_records (item_code);
CREATE INDEX IF NOT EXISTS idx_loss_created  ON loss_records (created_at);
