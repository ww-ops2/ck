-- HQ Foundation patch: enable anon access and seed 4 categories
-- Run this in Supabase SQL Editor. Safe to run multiple times.

ALTER TABLE public.usage_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_journal DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_ledger TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posting_journal TO anon, authenticated;

INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'live_gift', '直播礼品', 10)
ON CONFLICT (subject, code) DO NOTHING;

INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'tour_material', '出团物料', 20)
ON CONFLICT (subject, code) DO NOTHING;

INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'admin_material', '行政物料', 30)
ON CONFLICT (subject, code) DO NOTHING;

INSERT INTO public.usage_categories (subject, code, name, sort_order)
VALUES ('hq', 'warehouse', '总部仓库', 40)
ON CONFLICT (subject, code) DO NOTHING;

SELECT code, name, sort_order FROM public.usage_categories ORDER BY sort_order;
