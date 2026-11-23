-- Optional patch v5.93: make subjects dictionary readable by anon.
-- Safe to re-run. If this errors, it can be skipped - the app does not use this table yet.

ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.subjects TO anon, authenticated;

INSERT INTO public.subjects (code, name, sort_order)
VALUES ('train', '遇见美好列车', 10), ('hq', '遇见美好总部', 20)
ON CONFLICT (code) DO NOTHING;

SELECT code, name, is_active, sort_order FROM public.subjects ORDER BY sort_order;
