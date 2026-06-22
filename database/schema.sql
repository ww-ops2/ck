-- ============================================================
-- 库存管理系统 Supabase 数据库建表脚本
-- 版本: 2.0 (不依赖 Supabase Auth，可独立运行)
-- 数据库: PostgreSQL (Supabase)
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 用户表 (users) - 独立用户表，不依赖 Supabase Auth
--    后续迁移 Auth 时再关联 auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','purchase','warehouse','finance','staff')),
  avatar      TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 插入默认用户（密码字段暂不加密，后续接入 Auth 时迁移）
INSERT INTO users (username, password, name, role) VALUES
  ('admin',     'admin123',     '系统管理员', 'admin'),
  ('purchase',  'purchase123',  '采购员张三', 'purchase'),
  ('warehouse', 'warehouse123', '仓管李四',   'warehouse'),
  ('finance',   'finance123',   '财务王五',   'finance'),
  ('staff',     'staff123',     '员工赵六',   'staff')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 2. 品类表 (categories)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL UNIQUE,
  remark      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_name ON categories(name);

-- ============================================================
-- 3. 库存物品表 (inventory_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  BIGSERIAL PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  brand               TEXT DEFAULT '',
  model               TEXT DEFAULT '',
  category_id         BIGINT REFERENCES categories(id),
  category_name       TEXT DEFAULT '未分类',
  stock               NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit                TEXT DEFAULT '',
  safety_stock        NUMERIC(12,3) NOT NULL DEFAULT 10,
  last_stockin_date   DATE,
  last_stockin_batch  TEXT,
  source              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_category ON inventory_items(category_id);
CREATE INDEX idx_inventory_name ON inventory_items(name);
CREATE INDEX idx_inventory_code ON inventory_items(code);

-- ============================================================
-- 4. 采购单表 (purchase_orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  purchase_date   DATE NOT NULL,
  purchaser       TEXT NOT NULL,
  suppliers       JSONB DEFAULT '[]',
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending_stockin' CHECK (status IN ('pending_stockin','stockin_completed','cancelled')),
  remark          TEXT DEFAULT '',
  created_by      BIGINT REFERENCES users(id),
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(purchase_date);
CREATE INDEX idx_po_code ON purchase_orders(code);

-- ============================================================
-- 5. 采购单明细表 (purchase_order_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  supplier          TEXT DEFAULT '',
  category_name     TEXT DEFAULT '',
  item_code         TEXT DEFAULT '',
  name              TEXT NOT NULL,
  brand             TEXT DEFAULT '',
  model             TEXT DEFAULT '',
  quantity          NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit              TEXT DEFAULT '',
  price             NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order        INTEGER DEFAULT 0
);
CREATE INDEX idx_poi_po ON purchase_order_items(purchase_order_id);

-- ============================================================
-- 6. 入库记录表 (stock_in_records)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_in_records (
  id                    BIGSERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  purchase_order_id     BIGINT REFERENCES purchase_orders(id),
  purchase_order_code   TEXT,
  stockin_date          DATE NOT NULL,
  batch_code            TEXT,
  total_quantity        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'completed',
  confirmed_by          TEXT,
  confirmed_at          TIMESTAMPTZ,
  remark                TEXT DEFAULT '',
  created_by            BIGINT REFERENCES users(id),
  created_by_name       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sir_po ON stock_in_records(purchase_order_id);
CREATE INDEX idx_sir_date ON stock_in_records(stockin_date);
CREATE INDEX idx_sir_code ON stock_in_records(code);

-- ============================================================
-- 7. 入库明细表 (stock_in_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_in_items (
  id                  BIGSERIAL PRIMARY KEY,
  stock_in_record_id  BIGINT NOT NULL REFERENCES stock_in_records(id) ON DELETE CASCADE,
  supplier            TEXT DEFAULT '',
  category_name       TEXT DEFAULT '',
  item_code           TEXT DEFAULT '',
  name                TEXT NOT NULL,
  brand               TEXT DEFAULT '',
  model               TEXT DEFAULT '',
  quantity            NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_quantity     NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit                TEXT DEFAULT '',
  price               NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  inventory_item_id   BIGINT REFERENCES inventory_items(id),
  sort_order          INTEGER DEFAULT 0
);
CREATE INDEX idx_sii_sir ON stock_in_items(stock_in_record_id);

-- ============================================================
-- 8. 领用申请表 (requisitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS requisitions (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  tour_date       DATE,
  tour_name       TEXT,
  scenario        TEXT,
  applicant       TEXT NOT NULL,
  apply_date      DATE NOT NULL,
  total_quantity  NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending_outbound' CHECK (status IN ('pending_outbound','outbound_completed','withdrawn')),
  remark          TEXT DEFAULT '',
  created_by      BIGINT REFERENCES users(id),
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_req_status ON requisitions(status);
CREATE INDEX idx_req_date ON requisitions(apply_date);
CREATE INDEX idx_req_code ON requisitions(code);

-- ============================================================
-- 9. 领用申请明细表 (requisition_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS requisition_items (
  id              BIGSERIAL PRIMARY KEY,
  requisition_id  BIGINT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  inventory_item_id BIGINT REFERENCES inventory_items(id),
  name            TEXT NOT NULL,
  code            TEXT DEFAULT '',
  category        TEXT DEFAULT '',
  unit            TEXT DEFAULT '',
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 0,
  brand           TEXT DEFAULT '',
  model           TEXT DEFAULT '',
  sort_order      INTEGER DEFAULT 0
);
CREATE INDEX idx_ri_req ON requisition_items(requisition_id);

-- ============================================================
-- 10. 出库记录表 (stock_out_records)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_out_records (
  id                BIGSERIAL PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  requisition_id    BIGINT REFERENCES requisitions(id),
  requisition_code  TEXT,
  tour_date         DATE,
  tour_name         TEXT,
  scenario          TEXT,
  stockout_date     DATE NOT NULL,
  total_quantity    NUMERIC(10,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'completed',
  confirmed_by      TEXT,
  confirmed_at      TIMESTAMPTZ,
  created_by        BIGINT REFERENCES users(id),
  created_by_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sor_req ON stock_out_records(requisition_id);
CREATE INDEX idx_sor_date ON stock_out_records(stockout_date);
CREATE INDEX idx_sor_code ON stock_out_records(code);

-- ============================================================
-- 11. 出库明细表 (stock_out_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_out_items (
  id                    BIGSERIAL PRIMARY KEY,
  stock_out_record_id   BIGINT NOT NULL REFERENCES stock_out_records(id) ON DELETE CASCADE,
  inventory_item_id     BIGINT REFERENCES inventory_items(id),
  name                  TEXT NOT NULL,
  code                  TEXT DEFAULT '',
  category              TEXT DEFAULT '',
  unit                  TEXT DEFAULT '',
  quantity              NUMERIC(10,2) NOT NULL DEFAULT 0,
  requested_quantity    NUMERIC(10,2) NOT NULL DEFAULT 0,
  brand                 TEXT DEFAULT '',
  model                 TEXT DEFAULT '',
  sort_order            INTEGER DEFAULT 0
);
CREATE INDEX idx_soi_sor ON stock_out_items(stock_out_record_id);

-- ============================================================
-- 12. 品牌/型号历史记录表 (item_history)
-- ============================================================
CREATE TABLE IF NOT EXISTS item_history (
  id          BIGSERIAL PRIMARY KEY,
  item_name   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('brand','model')),
  value       TEXT NOT NULL,
  use_count   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_name, type, value)
);
CREATE INDEX idx_ih_name_type ON item_history(item_name, type);

-- ============================================================
-- 13. 编码序列表 (code_sequences)
-- ============================================================
CREATE TABLE IF NOT EXISTS code_sequences (
  id            BIGSERIAL PRIMARY KEY,
  sequence_type TEXT NOT NULL UNIQUE,
  current_value INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 14. 操作审计日志表 (audit_logs) - 全部操作可追溯
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT,
  entity_code   TEXT,
  details       JSONB,
  old_values    JSONB,
  new_values    JSONB,
  user_id       BIGINT REFERENCES users(id),
  user_name     TEXT,
  user_role     TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- ============================================================
-- 15. 默认品类数据
-- ============================================================
INSERT INTO categories (code, name, remark) VALUES
  ('SKU',  '饮品',     ''),
  ('SKP',  '食品',     ''),
  ('SKD',  '日用品',   ''),
  ('SK04', '办公用品', '')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 16. 初始化编码序列
-- ============================================================
INSERT INTO code_sequences (sequence_type, current_value) VALUES
  ('item_code', 0),
  ('purchase_order', 0),
  ('stock_in', 0),
  ('requisition', 0),
  ('stock_out', 0),
  ('category_code', 4)
ON CONFLICT (sequence_type) DO NOTHING;

-- ============================================================
-- 17. 审计日志自动触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION log_audit_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, entity_code, new_values, created_at)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id, COALESCE(NEW.code, ''), to_jsonb(NEW), now());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, entity_code, old_values, new_values, created_at)
    VALUES ('UPDATE', TG_TABLE_NAME, NEW.id, COALESCE(NEW.code, ''), to_jsonb(OLD), to_jsonb(NEW), now());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, entity_code, old_values, created_at)
    VALUES ('DELETE', TG_TABLE_NAME, OLD.id, COALESCE(OLD.code, ''), to_jsonb(OLD), now());
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 为核心业务表创建审计触发器
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION log_audit_change();
CREATE TRIGGER audit_inventory_items AFTER INSERT OR UPDATE OR DELETE ON inventory_items FOR EACH ROW EXECUTE FUNCTION log_audit_change();
CREATE TRIGGER audit_stock_in_records AFTER INSERT OR UPDATE OR DELETE ON stock_in_records FOR EACH ROW EXECUTE FUNCTION log_audit_change();
CREATE TRIGGER audit_requisitions AFTER INSERT OR UPDATE OR DELETE ON requisitions FOR EACH ROW EXECUTE FUNCTION log_audit_change();
CREATE TRIGGER audit_stock_out_records AFTER INSERT OR UPDATE OR DELETE ON stock_out_records FOR EACH ROW EXECUTE FUNCTION log_audit_change();
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION log_audit_change();

-- ============================================================
-- 18. 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_categories BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_inventory BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_po BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_req BEFORE UPDATE ON requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_ih BEFORE UPDATE ON item_history FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 19. 编码自增函数 (原子操作，并发安全)
-- ============================================================
CREATE OR REPLACE FUNCTION next_code(seq_type TEXT, prefix TEXT, pad_len INTEGER DEFAULT 5)
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  INSERT INTO code_sequences (sequence_type, current_value, updated_at)
  VALUES (seq_type, 1, now())
  ON CONFLICT (sequence_type) DO UPDATE
    SET current_value = code_sequences.current_value + 1, updated_at = now()
  RETURNING current_value INTO next_val;

  RETURN prefix || LPAD(next_val::TEXT, pad_len, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 20. 品牌/型号使用计数递增函数
-- ============================================================
CREATE OR REPLACE FUNCTION increment_history_count(p_item_name TEXT, p_type TEXT, p_value TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE item_history
  SET use_count = use_count + 1, updated_at = now()
  WHERE item_name = p_item_name AND type = p_type AND value = p_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 21. RLS 策略 (暂不开启，使用 anon key 时所有表开放访问)
--     后续接入 Supabase Auth 后再启用角色级 RLS
-- ============================================================
-- 注意：当前使用 anon key 模式，RLS 会导致所有请求被拒绝
-- 当切换到 Supabase Auth 后，运行以下命令启用：
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
-- ... (对所有业务表)
