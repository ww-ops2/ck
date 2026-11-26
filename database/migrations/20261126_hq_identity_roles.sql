-- ============================================================
-- HQ 出库工作台 · 授权身份（角色）映射  [v6.15]
-- 用户 2026-11-26 定稿三条口径：
--   1) 角色 = 授权模块，一人可持多个身份（按授权展示工作台）
--   2) 认人 = 账号：users.username 已是手机号、name 是姓名；
--      单据归属用 applicantAcc / handledAcc / whAcc（账号 id），姓名仅展示
--   3) 退回 = 原样退回，不修改单据内容，只记退回人 + 时间
--
-- 说明：本脚本为【可选增强】。不执行也完全不影响线上：
--   代码把身份授权写进 user_permissions.permission（hq_role_*），
--   把流程负载 / 账号归属写进 requisitions.remark 的 HQ_FLOW2:<base64>，
--   列不存在时自动降级（零 DDL）。执行本脚本后改为读独立列，更规范、可索引。
-- 执行方式：Supabase SQL Editor 手动粘贴运行（anon key 无 DDL 权限，脚本不能由前端自动跑）。
-- ============================================================

-- 1) 身份授权值写入 user_permissions（一人多条 = 多身份）。
--    给指定账号授权示例（uid 用 users.id，BIGINT）：
--    主播：hq_role_anchor / 销售：hq_role_sales / 计调：hq_role_planner / 仓库：hq_role_wh
-- 下面示例给「系统管理员(admin)」全身份，便于首次演示；按需注释或改 uid。
INSERT INTO user_permissions (user_id, permission) VALUES
  (1, 'hq_role_anchor'),
  (1, 'hq_role_sales'),
  (1, 'hq_role_planner'),
  (1, 'hq_role_wh')
ON CONFLICT (user_id, permission) DO NOTHING;
-- 若 user_permissions 无唯一约束，改用存在性判断：
-- DO $$ BEGIN
--   IF NOT EXISTS (SELECT 1 FROM user_permissions WHERE user_id=1 AND permission='hq_role_anchor') THEN
--     INSERT INTO user_permissions (user_id, permission) VALUES (1,'hq_role_anchor');
--   END IF;
-- END $$;

-- 2) requisitions 增加流程阶段与账号归属列（可选，用于替代 remark 负载）
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS flow_stage text;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS flow_payload jsonb;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS applicant_acc bigint;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS handled_acc bigint;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS wh_acc bigint;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS tour_no text;

-- 3) 从历史 remark 回填团号（不执行也不影响：代码 tourNoOf() 已从 remark 解析）
UPDATE requisitions
SET tour_no = trim(regexp_replace(remark, '^.*团号[:：]\s*([^\s/，,]+).*$', '\1'))
WHERE tour_no IS NULL
  AND remark ILIKE '%团号%'
  AND remark ~ '团号[:：]\s*[^/，,]+';

-- 4) 索引（可选）
CREATE INDEX IF NOT EXISTS idx_requisitions_flow_stage ON requisitions (flow_stage);
CREATE INDEX IF NOT EXISTS idx_requisitions_applicant_acc ON requisitions (applicant_acc);
CREATE INDEX IF NOT EXISTS idx_requisitions_handled_acc ON requisitions (handled_acc);
CREATE INDEX IF NOT EXISTS idx_requisitions_wh_acc ON requisitions (wh_acc);

-- ============================================================
-- 状态机口径（复用线上合法 status，不新增值，避免 CHECK 23514）：
--   step='anchor'  → stage0 主播草稿（可补充/提交/撤销）
--   step='sales'   → stage1 销售待填写邮寄（可填客户/退回主播）
--   step='handled' → stage2 仓库待确定出库（可确认/退回销售）
--   status='outbound_completed' → stage3 已出库
--   remark 里的 HQ_FLOW2:<base64> 存 step/handledAcc/whAcc/returns 留痕。
-- RLS 未开启，身份/workbench 为前端过滤，不是强安全边界；真鉴权待权限模块接入。
-- ============================================================
