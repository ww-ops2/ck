-- ============================================================
-- 多主体隔离迁移 v5.93 (2026-11-23)
-- 主体：遇见美好列车(subject='train') / 遇见美好总部(subject='hq')
-- 策略：所有业务表加 subject 列，存量数据回填 'train'；
--       subject 默认值 'train'，前端所有查询强制带 .eq('subject', 当前主体)
-- 执行：Supabase SQL Editor 全选运行（幂等，可重复执行）
-- 回滚：本文件末尾附 rollback 段（单独执行）
-- ============================================================

-- ---------- 1. 需要隔离的业务表加 subject 列 ----------
-- 主表/明细表一律加；权限/账号体系暂不隔离（admin 跨主体，普通账号绑列车）

DO $$
DECLARE
  t text;
  biz_tables text[] := ARRAY[
    'categories','inventory_items',
    'purchase_orders','purchase_order_items',
    'stock_in_records','stock_in_items',
    'requisitions','requisition_items',
    'stock_out_records','stock_out_items',
    'inventory_adjustments','tour_names',
    'consumption_standards','settings',
    'item_history','audit_logs',
    'non_purchase_stock_in','loss_records'
  ];
BEGIN
  FOREACH t IN ARRAY biz_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name=t AND column_name='subject') THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN subject text NOT NULL DEFAULT ''train''', t);
      END IF;
      -- 存量数据兜底回填（防止历史 NULL）
      EXECUTE format('UPDATE public.%I SET subject = ''train'' WHERE subject IS NULL OR subject = ''''', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_subject ON public.%I(subject)', t, t);
    END IF;
  END LOOP;
END $$;

-- ---------- 2. 编号序列按主体独立 ----------
-- 原 code_sequences 主键/唯一键为 (sequence_type)，需改为包含 subject
-- 先看现有 structure，兼容处理

-- 2.1 加 subject 列 + 回填
ALTER TABLE public.code_sequences ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'train';
UPDATE public.code_sequences SET subject='train' WHERE subject IS NULL OR subject='';

-- 2.2 解除 sequence_type 单列 UNIQUE，改建 (sequence_type, subject) 复合唯一
-- 注意：Postgres 的 ON CONFLICT (a,b) 必须有对应的唯一索引/约束才生效
ALTER TABLE public.code_sequences DROP CONSTRAINT IF EXISTS code_sequences_sequence_type_key;
ALTER TABLE public.code_sequences DROP CONSTRAINT IF EXISTS code_sequences_sequence_type_subject_key;
CREATE UNIQUE INDEX IF NOT EXISTS code_sequences_type_subject_uidx
  ON public.code_sequences (sequence_type, subject);

-- 2.3 重建 next_code 为带 subject 参数的版本
-- 兼容三种调用：3参(旧) / 4参(seq_type,prefix,pad_len,subject)
CREATE OR REPLACE FUNCTION public.next_code(
  seq_type text, prefix text, pad_len integer DEFAULT 5, p_subject text DEFAULT 'train'
) RETURNS text AS $$
DECLARE
  v_seq integer;
  v_subject text := COALESCE(NULLIF(p_subject,''), 'train');
BEGIN
  INSERT INTO public.code_sequences (sequence_type, subject, current_value, updated_at)
  VALUES (seq_type, v_subject, 1, now())
  ON CONFLICT (sequence_type, subject) DO UPDATE
    SET current_value = public.code_sequences.current_value + 1,
        updated_at = now()
  RETURNING current_value INTO v_seq;

  RETURN prefix || to_char(now(), 'YYYYMMDD') || lpad(v_seq::text, pad_len, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------- 3. 主体字典表（供前端下拉 + 后续扩展）----------
CREATE TABLE IF NOT EXISTS public.subjects (
  code text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.subjects (code, name, sort_order) VALUES
  ('train', '遇见美好列车', 10),
  ('hq', '遇见美好总部', 20)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 回滚脚本（需要回滚时，单独复制以下到 SQL Editor 执行）
-- 注意：回滚不会还原已新增主体产生的数据，请配合 F 盘备份使用
-- ============================================================
/*
DO $$
DECLARE t text;
  biz text[] := ARRAY[
    'categories','inventory_items','purchase_orders','purchase_order_items',
    'stock_in_records','stock_in_items','requisitions','requisition_items',
    'stock_out_records','stock_out_items','inventory_adjustments','tour_names',
    'consumption_standards','settings','item_history','audit_logs',
    'non_purchase_stock_in','loss_records'
  ];
BEGIN
  FOREACH t IN ARRAY biz LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%I_subject', t);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='subject') THEN
      EXECUTE format('ALTER TABLE public.%I DROP COLUMN subject', t);
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS public.subjects;
-- code_sequences 回滚需线下确认唯一键结构后再执行，此处不自动处理
*/
