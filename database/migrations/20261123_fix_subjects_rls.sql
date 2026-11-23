-- ============================================================
-- 补丁：修复 subjects 字典表 RLS 导致 anon 读不到主体列表
-- 背景：主迁移建表后，若项目默认开启 RLS，anon key 查询 subjects
--       会被静默过滤成空数组，INSERT 报 42501。
--       这不影响登录（下拉是硬编码的），但影响字典表可读性。
-- 执行：Supabase SQL Editor 全文运行（幂等）
-- ============================================================

-- 1. 关闭 subjects 表 RLS（字典为公开只读参考数据）
ALTER TABLE IF EXISTS public.subjects DISABLE ROW LEVEL SECURITY;

-- 2. 确保 anon/authenticated 有读取权限
GRANT SELECT ON public.subjects TO anon, authenticated;

-- 3. 补插两条主体（若因 RLS 导致主迁移的 INSERT 未生效）
INSERT INTO public.subjects (code, name, sort_order) VALUES
  ('train', '遇见美好列车', 10),
  ('hq', '遇见美好总部', 20)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, is_active = true, sort_order = EXCLUDED.sort_order;

-- 4. 验证：应返回 2 行
SELECT code, name, is_active, sort_order FROM public.subjects ORDER BY sort_order;
