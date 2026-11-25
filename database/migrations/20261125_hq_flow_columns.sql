-- ============================================================
-- hq 总部「六链路流程流转」字段迁移  ·  v6.12
-- 生成日期：2026-11-25
-- 执行方式：Supabase → SQL Editor 手动执行（anon 无 DDL 权限，代码层不能自动跑）
-- 幂等性：可重复执行；不执行也不影响线上——代码已做「零 DDL 降级」：
--         团号写 requisitions.remark 的「团号：xxx」；
--         客户明细 / 导游实拿量 / 金额等负载写 remark 的「HQ_FLOW2:<base64 JSON>」。
--
-- 执行后的收益：
--   1) js/hq-app.js    tourNoOf()      优先读 tour_no 列（段 2 回填历史数据）
--   2) js/hq-actions.js writeFlowPayload() 双写 flow_stage / flow_payload（列不存在时自动降级为只写 remark）
--   3) 解除「部分出库」状态阻塞（段 3，可选）
--   读取侧 readFlowPayload() 仍从 remark 解析，保证迁移前后、新旧单据都能回显。
-- ============================================================


-- ---------- 段 1：新增列（必做，纯增量、零风险） ----------
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS tour_no      text;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS flow_stage   text;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS flow_payload text;

COMMENT ON COLUMN public.requisitions.tour_no IS
  '团号：主播（直播礼品）/ 计调（出团物料）在申请时填写，全链路只读；这两类链路必填。';
COMMENT ON COLUMN public.requisitions.flow_stage IS
  '六链路流程阶段 applied / handled / outbounded，由 js/hq-actions.js writeFlowPayload() 写入。';
COMMENT ON COLUMN public.requisitions.flow_payload IS
  '流程负载 JSON 字符串：客户明细、导游实拿量、金额合计、办理人等；零 DDL 时序列化进 remark。';


-- ---------- 段 2：把历史 remark 里的团号回填到 tour_no（幂等） ----------
-- 只回填 tour_no 为空、且 remark 里确实带「团号:」或「团号：」的单据。
UPDATE public.requisitions
   SET tour_no = (regexp_match(remark, '团号[:：][[:space:]]*([^[:space:]/，,]+)'))[1]
 WHERE tour_no IS NULL
   AND remark IS NOT NULL
   AND remark ~ '团号[:：]';


-- ---------- 段 3（可选，但建议执行）：放宽 requisitions.status CHECK ----------
-- 背景：线上 CHECK 只含 6 个合法值（pending_approval / approved / rejected /
--       pending_outbound / outbound_completed / withdrawn），缺 partially_outbounded，
--       导致「部分出库」PATCH 报 23514 —— 项目已知阻塞项。
--       v6.12 代码本身不写该状态，故这段可暂缓；执行后可解除后续阻塞。
--
-- 安全策略：动态定位含 status 的 CHECK 约束名（不硬编码），只对
--           "status IN (...)" 形式自动重建；遇到 "status = ANY (ARRAY[...])"
--           或其他格式只打印 NOTICE，不自动改动，避免写坏约束。
DO $$
DECLARE
  c      record;
  newdef text;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.requisitions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    IF c.def LIKE '%partially_outbounded%' THEN
      RAISE NOTICE '[hq-flow] 约束 % 已含 partially_outbounded，跳过', c.conname;
      CONTINUE;
    END IF;

    IF c.def LIKE '%status IN (%' THEN
      -- pg_get_constraintdef 返回的字符串本身已含 CHECK (...)，这里补一个合法值即可
      newdef := replace(c.def, 'status IN (', 'status IN (''partially_outbounded'', ');
      EXECUTE 'ALTER TABLE public.requisitions DROP CONSTRAINT ' || quote_ident(c.conname);
      EXECUTE 'ALTER TABLE public.requisitions ADD CONSTRAINT ' || quote_ident(c.conname) || ' ' || newdef;
      RAISE NOTICE '[hq-flow] 约束 % 已放宽 -> %', c.conname, newdef;
    ELSE
      RAISE NOTICE '[hq-flow] 约束 % 定义格式非 status IN (...)，未自动改动，请手动处理：%', c.conname, c.def;
      -- 手动处理模板（先查定义，再按实际格式补 'partially_outbounded' 后重建）：
      --   ALTER TABLE public.requisitions DROP CONSTRAINT <conname>;
      --   ALTER TABLE public.requisitions ADD CONSTRAINT <conname> CHECK (...);
    END IF;
  END LOOP;
END $$;


-- ---------- 段 4：执行后自检 ----------
-- 4.1 应返回 3 行：flow_payload / flow_stage / tour_no
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'requisitions'
   AND column_name IN ('tour_no', 'flow_stage', 'flow_payload')
 ORDER BY column_name;

-- 4.2 应看到已回填团号的单据数
SELECT count(*) AS total,
       count(tour_no) AS with_tour_no,
       count(*) FILTER (WHERE remark LIKE '%HQ_FLOW2:%') AS with_flow_payload
  FROM public.requisitions;

-- 4.3 检查 CHECK 定义是否已含 partially_outbounded（段 3 执行后）
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.requisitions'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) LIKE '%status%';
