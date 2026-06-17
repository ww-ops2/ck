-- Migration: add inventory_adjustments and permissions tables
BEGIN;

-- 库存手工调整记录
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id INTEGER,
  item_code TEXT,
  delta INTEGER,
  new_stock INTEGER,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 权限相关表（简化）
CREATE TABLE IF NOT EXISTS permissions (
  name TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);

-- 审计日志（若不存在则创建）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMIT;
