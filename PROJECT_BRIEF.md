# 库存管理系统 — 项目完整文档

> **本文档是项目的唯一真相来源。** 每次操作前先扫描此文件获取完整上下文。
> 每次版本迭代后必须同步更新此文档。
> 最后更新：2026-06-10 / 版本 v5.7

---

## 0. AI 智能体操作指引（必读）

**每次开始工作前，请先阅读本文件获取项目全貌，避免遗漏历史决策和已知问题。**

### 关键注意事项

1. **不要用 `git push`**：当前服务器网络无法连接 `github.com:443`（git 协议超时）。代码推送必须使用 `push.ps1`（通过 GitHub REST API），详见第 14 节。
2. **仅本地文件**：`PROJECT_BRIEF.md`、`push.ps1`、`docs/`、`README.md`、`CHANGELOG.md`、`TIPS.md` 等说明文件**不推送到 GitHub**，仅在本地保留。推送只包含系统运行必需的文件。
3. **版本号规则**：修改代码后，必须同步更新 `index.html` 中所有 `<script>` 和 `<link>` 标签的 `?v=X.Y` 参数以刷新浏览器缓存。
4. **推送前必须用户确认**：版本更新流程为「本地修改 → 本地测试确认效果 → 用户确认定版 → 执行推送」。**未经用户确认定版，禁止自行推送到 GitHub**，避免有 BUG 反复推送浪费时间。
5. **Supabase anon key 模式**：不使用 Auth，不开启 RLS。登录是角色快速登录（mock），后续需接入 Supabase Auth。
6. **双存储架构**：localStorage 缓存 + Supabase 持久层。写入走 300ms 防抖增量同步，读取走本地缓存瞬间渲染。
7. **关联项目**：同仓库体系下有 V3 数据看板（仓库 `ww-ops2/-`），路径 `数据看板\V3`，推送方式相同。

### 更新迭代后必须维护本文件

- 新增/删除/重命名文件 → 更新第 3 节文件结构
- 新增/修改功能模块 → 更新第 8 节功能说明 + 第 10 节代码位置速查
- 版本号变更 → 更新第 1 节版本 + 第 15 节版本记录
- 发现新问题或解决已知问题 → 更新第 13 节 + 第 15 节
- 数据库表/函数变更 → 更新第 6 节数据架构

---

## 1. 项目概况

| 项目 | 内容 |
|---|---|
| 项目名称 | 库存管理系统 (Inventory Management System) |
| 技术栈 | 纯 Vanilla JavaScript + HTML5 + CSS3（无框架） |
| 数据库 | Supabase PostgreSQL（通过 anon key + REST API） |
| 前端部署 | GitHub Pages: https://ww-ops2.github.io/ck/ |
| 代码仓库 | https://github.com/ww-ops2/ck |
| 本地路径 | `C:\Users\Administrator\Desktop\KingdeeVoucherAuto\3-库存管理` |
| 当前版本 | v5.7（缓存破坏参数 `?v=5.7`） |

---

## 2. 密钥与连接信息

| 名称 | 值 | 用途 |
|---|---|---|
| Supabase Project URL | `https://vhnvjaghlvoqdgssidjw.supabase.co` | 数据库连接地址 |
| Supabase Anon Key | `sb_publishable_z06qPVHQAOHZuNiSxHXOyw_IL2-G7Bf` | 前端公开访问密钥（非 JWT 格式） |
| GitHub Token（本系统） | `已移除，使用 GITHUB_TOKEN 环境变量` | push.ps1 API 推送认证 |
| GitHub Token（V3看板） | `github_pat_11CEC5KNQ0OGQGazx92xsJ_...` | V3 数据看板推送认证（完整值见 `数据看板\V3\gh-config.js`） |
| GitHub Pages URL | `https://ww-ops2.github.io/ck/` | 库存管理系统线上地址 |
| GitHub 用户名 | `ww-ops2` | 仓库所有者 |
| api.github.com | 可达 | 用于 REST API 推送（替代 git push） |

> **注意**: Supabase 使用 anon key 模式（无 Auth），RLS 未启用。后续接入 Supabase Auth 后需开启 RLS。
> **注意**: 当前登录为角色快速登录（无密码），mockUsers 定义在 `js/auth.js` 第 6-12 行。

---

## 3. 文件结构与职责

```
3-库存管理/
├── index.html              ← 主页面（登录 + SPA 所有模块面板 + 12个模态框）
├── css/
│   └── style.css           ← 全局样式（shadcn/ui 手绘暖色主题，~2100行）
├── js/
│   ├── supabase-db.js      ← Supabase 数据访问层（异步 CRUD API，SupaDB 对象）
│   ├── supabase-sync.js    ← localStorage ↔ Supabase 双向同步层（v2.0 防抖+增量）
│   ├── migrate-data.js     ← 一次性数据迁移工具（控制台执行 migrateAllData()）
│   ├── toast.js            ← UI 组件：showToast / showConfirm / showPrompt
│   ├── auth.js             ← 认证 + 统一权限矩阵（5角色 × 17权限）
│   ├── navigation.js       ← SPA 导航：模块切换 + 数据加载分发 + 刷新
│   ├── purchase.js         ← 采购单模块（最大文件 ~1970行）
│   ├── stock-in.js         ← 入库记录查看模块
│   ├── requisition.js      ← 领用单 + 出库确认模块（~1690行）
│   ├── monthly-summary.js  ← 月度汇总报表模块（KPI + 图表 + Excel导出）
│   └── app.js              ← 主逻辑：仪表盘、库存概览、KPI卡片展开、图表
├── database/
│   └── schema.sql          ← Supabase 建表脚本 v2.0（14表 + 4函数 + 10触发器）
├── push.ps1                ← [仅本地] GitHub API 推送脚本（含 Token，.gitignore 已排除）
├── PROJECT_BRIEF.md        ← [仅本地] 本文件，项目完整文档
├── docs/                   ← [仅本地] 历史功能说明文档
├── README.md               ← [仅本地] 项目说明
├── CHANGELOG.md            ← [仅本地] 变更日志
├── TIPS.md                 ← [仅本地] 使用提示
├── assets/                 ← 静态资源（目前为空）
├── .gitignore              ← 排除 node_modules、push.ps1、PROJECT_BRIEF.md 等
├── package.json            ← npm 依赖（pg 包，用于本地测试）
└── 打开库存管理系统.bat     ← Windows 快捷启动脚本
```

> **推送到 GitHub 的文件**：`index.html`、`css/style.css`、`database/schema.sql`、`database/migrations/*.sql`、`js/*.js`、`package.json`、`.gitignore`、`CHANGELOG.md`、`PROJECT_DIRECTORY.md`、`README.md`、`TIPS.md`（共 28 个）。
> **不推送的文件**：`push.ps1`、`PROJECT_BRIEF.md`、`docs/`、`assets/`、`打开库存管理系统.bat`、`node_modules/`、`backups/`。

---

## 4. CDN 依赖

| 库 | 版本 | 用途 |
|---|---|---|
| Chart.js | 4.4.0 | 仪表盘趋势图、品类占比图、月度汇总图表 |
| SheetJS (xlsx) | 0.18.5 | Excel 导入采购单 / 导出月度报表 |
| Supabase JS | 2.x | 数据库客户端 SDK |
| Google Fonts | latest | Inter + Noto Sans SC 字体 |

---

## 5. 脚本加载顺序（index.html 底部）

```
xlsx → supabase SDK → supabase-db.js → supabase-sync.js → migrate-data.js
→ toast.js → auth.js → navigation.js → purchase.js → stock-in.js
→ requisition.js → monthly-summary.js → app.js
```

**关键依赖链**: app.js 最后加载，在 DOMContentLoaded 中调用 `initAuth()` → `showApp()` → `syncFromSupabase()` → `loadDashboard()`。

---

## 6. 数据架构

### 6.1 存储策略

**双存储架构**: localStorage 作为本地缓存（快速读取），Supabase 作为持久层（source of truth）。

- **读取**: 所有模块从 localStorage 读取 → 瞬间渲染
- **写入**: 业务代码写 localStorage → `setItem` 被覆写 → 300ms 防抖 → 增量推送到 Supabase
- **初始加载**: `syncFromSupabase()` 并行拉取 6 张表 → 写入 localStorage → 然后渲染 UI
- **刷新**: `syncFromSupabase({ force: true })` 强制重新拉取最新数据

### 6.2 localStorage Key 映射

| Key | 数据结构 | 同步到 Supabase 表 |
|---|---|---|
| `currentUser` | `{id, username, name, role}` | 不同步（会话信息） |
| `categories` | `[{id, code, name, remark}]` | `categories` |
| `inventory` | `[{id, code, name, brand, model, category, stock, unit, safety_stock, ...}]` | `inventory_items` |
| `purchaseOrders` | `[{id, code, purchase_date, purchaser, suppliers[], items[], total_amount, status, ...}]` | `purchase_orders` + `purchase_order_items` |
| `stockInRecords` | `[{id, code, purchase_order_code, stockin_date, batch_code, items[], ...}]` | `stock_in_records` + `stock_in_items` |
| `requisitions` | `[{id, code, tour_date, tour_name, scenario, applicant, items[], status, ...}]` | `requisitions` + `requisition_items` |
| `stockOutRecords` | `[{id, code, requisition_code, stockout_date, items[], ...}]` | `stock_out_records` + `stock_out_items` |
| `brandHistory` | `{物品名: [品牌列表]}` | `item_history` (type='brand') |
| `modelHistory` | `{物品名: [型号列表]}` | `item_history` (type='model') |
| `inventoryCategories` | `[{code, name}]` | 派生自 `categories` |
| `itemCodeCounter` | 数字 | 不直接同步（Supabase 用 `next_code()` 函数） |
| `categoryCounter_*` | 数字 | 不直接同步 |

### 6.3 Supabase 数据库表（14张）

| 表名 | 描述 | 关联 |
|---|---|---|
| `users` | 用户表（独立，不依赖 auth.users） | - |
| `categories` | 品类（SKU/饮品, SKP/食品, SKD/日用品, SK04/办公用品） | - |
| `inventory_items` | 库存物品 | FK → categories(id) |
| `purchase_orders` | 采购单主体 | FK → users(id) |
| `purchase_order_items` | 采购单明细 | FK → purchase_orders(id) CASCADE |
| `stock_in_records` | 入库记录 | FK → purchase_orders(id), users(id) |
| `stock_in_items` | 入库明细 | FK → stock_in_records(id) CASCADE, inventory_items(id) |
| `requisitions` | 领用申请 | FK → users(id) |
| `requisition_items` | 领用明细 | FK → requisitions(id) CASCADE, inventory_items(id) |
| `stock_out_records` | 出库记录 | FK → requisitions(id), users(id) |
| `stock_out_items` | 出库明细 | FK → stock_out_records(id) CASCADE, inventory_items(id) |
| `item_history` | 品牌/型号历史（UNIQUE: item_name+type+value） | - |
| `code_sequences` | 编码序列（原子自增） | - |
| `audit_logs` | 审计日志（自动触发器写入） | FK → users(id) |

### 6.4 数据库函数

| 函数 | 用途 |
|---|---|
| `next_code(seq_type, prefix, pad_len)` | 原子编码生成，如 `PO00001`、`SI00001` |
| `log_audit_change()` | 审计触发器函数，自动记录 INSERT/UPDATE/DELETE |
| `update_updated_at()` | 自动更新 `updated_at` 字段 |
| `increment_history_count(p_item_name, p_type, p_value)` | 品牌/型号使用计数递增 |

### 6.5 采购单状态流

```
pending_stockin → stockin_completed
                 → cancelled
```

### 6.6 领用单状态流

```
pending_outbound → outbound_completed
                 → withdrawn
```

---

## 7. 角色与权限矩阵

### 7.1 五个角色

| 角色 key | 中文名 | 默认用户 | 可访问模块 |
|---|---|---|---|
| `admin` | 管理员 | 系统管理员 | 全部 |
| `purchase` | 采购员 | 采购员张三 | 仪表盘、库存、品类、采购、报表、分析 |
| `warehouse` | 仓库管理员 | 仓管李四 | 仪表盘、库存、品类、入库、出库、报表、分析 |
| `finance` | 财务 | 财务王五 | 仪表盘、库存、品类、采购、入库、领用、出库、报表、分析、记录 |
| `staff` | 员工 | 员工赵六 | 仪表盘、库存、领用、出库 |

### 7.2 权限矩阵（17 项）

| 权限 key | admin | purchase | warehouse | finance | staff |
|---|---|---|---|---|---|
| `create_purchase` | ✓ | ✓ | - | - | - |
| `edit_purchase` | ✓ | ✓ | - | - | - |
| `view_purchase` | ✓ | ✓ | ✓ | ✓ | - |
| `delete_purchase` | ✓ | - | - | - | - |
| `confirm_stockin` | ✓ | - | ✓ | - | - |
| `confirm_stockout` | ✓ | - | ✓ | - | - |
| `create_requisition` | ✓ | - | - | - | ✓ |
| `edit_requisition` | ✓ | - | - | - | ✓ |
| `withdraw_requisition` | ✓ | - | - | - | - |
| `delete_requisition` | ✓ | - | - | - | - |
| `manage_inventory` | ✓ | - | ✓ | - | - |
| `adjust_stock` | ✓ | - | ✓ | - | - |
| `edit_inventory` | ✓ | - | - | - | - |
| `manage_categories` | ✓ | ✓ | - | - | - |
| `view_inventory` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `export_reports` | ✓ | - | - | ✓ | - |
| `admin_settings` | ✓ | - | - | - | - |

**核心函数**: `hasPermission(perm)` → `roleHasPermission(role, perm)` → `getPermissionsForRole(role)`
**定义位置**: `js/auth.js` 第 207-233 行

---

## 8. 功能模块详细说明

### 8.1 仪表盘 (Dashboard)
**代码**: `js/app.js` 第 64-78 行 (`loadDashboard`)
- 7 个 KPI 卡片：总库存物品、本月入库、本月出库、待处理采购单、待确认入库、低库存预警、待确认出库
- KPI 卡片可点击展开详情面板（`_initKPIExpandHandlers` 第 913 行）
- 出入库趋势折线图（Chart.js，30 天）
- 库存分类占比饼图（Chart.js）
- 最近动态列表
- **权限控制**: 待处理采购单面板仅 `confirm_stockin` 可见"去入库"按钮；低库存面板仅 `create_purchase` 可见"批量采购"

### 8.2 库存概览 (Inventory)
**代码**: `js/app.js` 第 275-635 行 (`loadInventory`)
- 按分类分组展示库存物品列表
- 筛选器：分类、状态（正常/低库存/缺货）
- "采购中"列：显示该物品关联的待入库采购数量，点击弹出采购单详情 popover
- 一键购买模式：勾选低库存物品 → 自动跳转采购单并预填信息
- 新增/编辑物品模态框
- **权限控制**: 编辑按钮需 `edit_inventory`；批量采购需 `create_purchase`

### 8.3 品类管理 (Categories)
**代码**: `js/purchase.js` 第 661-810 行 (`renderCategoryList`)
- 品类卡片网格，显示物品数量和库存总量
- 点击品类展开关联物品明细
- 新增/编辑/删除品类
- **权限控制**: 增删改需 `manage_categories`

### 8.4 采购单管理 (Purchase Orders)
**代码**: `js/purchase.js`（~1970 行，最复杂模块）
- **新建采购单** (第 64-618 行): 供应商分组表单，每组内多行物品，自动计算金额
- **Excel 导入** (第 1326-1650 行): 4 步向导（下载模板→上传文件→数据预览→确认导入）
- **采购单列表** (第 827-905 行): 状态筛选，操作按钮（查看/编辑/入库）
- **采购单详情** (第 915-1028 行): 模态框展示完整信息
- **编辑采购单** (第 1032-1125 行): 预填表单，取消不丢失数据（`_editingPurchaseOrderId` 机制）
- **确认入库** (第 1129-1320 行): 实收数量输入 → 生成入库记录 → 更新库存 → 更新采购单状态
- **品类管理** (第 661-810 行): 增删改品类
- **品牌/型号历史** (第 1881-1967 行): 自动记忆历史值供下拉联想
- **编码生成** (第 1661-1690 行): 按品类独立计数，如 `SKU000001`
- **权限控制**: 创建需 `create_purchase`；编辑需 `edit_purchase`；入库需 `confirm_stockin`

### 8.5 入库管理 (Stock-In)
**代码**: `js/stock-in.js`（172 行）
- 入库记录列表，按状态筛选（待确认/已完成）
- 入库详情模态框：展示采购 vs 实收数量差异

### 8.6 领用单管理 (Requisitions)
**代码**: `js/requisition.js`（~1690 行）
- **新建领用单** (第 206-718 行): 团期日期/名称/场景 + 物品选择器（分类筛选 + 搜索 + 库存校验）
- **团期名称联想**: 可搜索下拉，从历史记录自动补全
- **领用单列表** (第 722-780 行): 状态筛选，操作按钮（查看/确认出库/编辑/撤回/删除）
- **确认出库** (第 887-1200 行): 两步确认（输入实际出库数量 → 预览差异 → 确认），扣减库存
- **编辑领用单** (第 1208-1370 行): 预填表单编辑
- **撤回/删除** (第 1377-1440 行): 状态变更或物理删除
- **权限控制**: 创建/编辑需 `create_requisition`/`edit_requisition`；出库需 `confirm_stockout`

### 8.7 出库管理 (Stock-Out)
**代码**: `js/requisition.js` 第 1447-1688 行 (`loadStockOutRecords`)
- 合并展示待出库领用单和已完成出库记录
- 出库详情模态框

### 8.8 月度汇总 (Monthly Summary)
**代码**: `js/monthly-summary.js`（646 行）
- 时间筛选：快捷按钮（本月/上月/本季度/本年度）+ 日期范围 + 月份选择器
- 6 个 KPI 卡片：期初库存、本期入库、本期出库、期末库存、库存周转率、低库存预警
- 出入库趋势折线图
- 品类出库占比饼图
- 近 6 月出库环比柱状图
- 出入库明细报表：按分类分组，显示期初/入库/出库/期末/变动率
- **Excel 导出** (第 606-640 行): SheetJS 生成 xlsx 文件

### 8.9 操作记录 (History)
**代码**: `index.html` 第 634-665 行（HTML 面板已定义，JS 待完善）
- 从 Supabase `audit_logs` 表查询（`SupaDB.getAuditLogs` 已实现）

### 8.10 后台管理（仅 admin）
- **账号管理** (`module-admin-users`): HTML 面板已定义
- **角色权限** (`module-admin-roles`): 展示各角色权限卡片
- **系统设置** (`module-admin-settings`): 系统名称、安全库存天数、预警阈值、备份频率

---

## 9. 模态框清单（12 个）

| ID | 用途 | 触发位置 |
|---|---|---|
| `modal-purchase-detail` | 采购单详情/编辑 | `purchase.js:915 viewPurchaseDetail()` |
| `modal-item` | 新增/编辑物品 | `app.js` 物品按钮 |
| `modal-purchase` | 新建采购单 | `purchase.js:64 openNewPurchaseModal()` |
| `modal-category` | 新增品类 | `purchase.js:1746 openCategoryModal()` |
| `modal-import` | Excel 导入向导 | `purchase.js:1326 openImportModal()` |
| `modal-stockin-confirm` | 入库确认 | `purchase.js:1129 confirmStockIn()` |
| `modal-requisition` | 新建领用单 | `requisition.js:206 openRequisitionModal()` |
| `modal-requisition-detail` | 领用单详情 | `requisition.js:784 viewRequisitionDetail()` |
| `modal-confirm-stockout` | 确认出库 | `requisition.js:887 confirmStockOut()` |
| `modal-stockout-result` | 出库完成结果 | `requisition.js:1044 _finalConfirmStockOut()` |
| `modal-edit-requisition` | 编辑领用单 | `requisition.js:1208 editRequisition()` |
| `modal-stockin-detail` | 入库详情 | `stock-in.js:64 viewStockInDetail()` |

---

## 10. 核心代码位置速查

### 认证与权限
| 功能 | 文件:行号 | 函数 |
|---|---|---|
| 初始化认证 | auth.js:20 | `initAuth()` |
| 登录处理 | auth.js:44 | `handleLogin()` |
| 显示应用 | auth.js:93 | `showApp()` (async) |
| 权限矩阵 | auth.js:207 | `getPermissionsForRole()` |
| 权限检查 | auth.js:262 | `hasPermission()` |

### 数据同步
| 功能 | 文件:行号 | 函数 |
|---|---|---|
| 从 Supabase 拉取 | supabase-sync.js:34 | `syncFromSupabase(options)` |
| setItem 覆写 | supabase-sync.js:198 | `localStorage.setItem` (override) |
| 批量推送 | supabase-sync.js:220 | `_batchSyncToSupabase()` |
| 增量同步 | supabase-sync.js:239 | `syncToSupabase(key)` |
| 变更检测 | supabase-sync.js:366 | `_detectChanges()` |
| 数据迁移 | migrate-data.js:7 | `migrateAllData()` |

### Supabase CRUD
| 功能 | 文件:行号 | 方法 |
|---|---|---|
| 获取客户端 | supabase-db.js:15 | `getSupabase()` |
| 连接检测 | supabase-db.js:742 | `isSupabaseReady()` |
| 审计日志 | supabase-db.js:42 | `writeAuditLog()` |
| 编码生成 | supabase-db.js:61 | `getNextCode()` |
| 采购单 CRUD | supabase-db.js:216-338 | `SupaDB.getPurchaseOrders/create/update` |
| 入库确认 | supabase-db.js:340 | `SupaDB.confirmStockIn()` |
| 出库确认 | supabase-db.js:550 | `SupaDB.confirmStockOut()` |
| 仪表盘统计 | supabase-db.js:687 | `SupaDB.getDashboardStats()` |

### 业务操作
| 功能 | 文件:行号 | 函数 |
|---|---|---|
| 提交采购单 | purchase.js:492 | `submitPurchaseOrder()` |
| 编辑采购单 | purchase.js:1032 | `editPurchaseOrder()` |
| 确认入库 | purchase.js:1187 | `executeStockIn()` |
| 提交领用单 | requisition.js:635 | `submitRequisition()` |
| 确认出库 | requisition.js:1044 | `_finalConfirmStockOut()` |
| 批量采购 | app.js:503 | `_invBatchPurchase()` |
| 低库存批量 | app.js:1191 | `_kpiBatchPurchase()` |

### UI 组件
| 功能 | 文件:行号 | 函数 |
|---|---|---|
| Toast 通知 | toast.js:7 | `showToast(msg, type, duration)` |
| 确认弹窗 | toast.js:64 | `showConfirm(msg, onConfirm, onCancel)` |
| 输入弹窗 | toast.js:115 | `showPrompt(msg, default, onConfirm)` |
| 打开模态框 | app.js:715 | `openModal(modalId)` |
| 关闭模态框 | app.js:705 | `closeModal()` |

---

## 11. 数据流时序图

### 11.1 页面加载
```
DOMContentLoaded
  → initAuth()
    → 检查 localStorage.currentUser
    → showApp() [async]
      → updateUserDisplay()
      → updateMenuByRole()
      → initNavigation()
      → await syncFromSupabase()     // 并行拉取 6 表 → 写 localStorage
      → loadDashboard()              // 读 localStorage → 渲染
```

### 11.2 用户写入数据（如提交采购单）
```
submitPurchaseOrder()
  → 校验表单
  → 构建采购单对象
  → purchaseOrders.push(order)
  → localStorage.setItem('purchaseOrders', ...)  // 触发覆写
    → _originalSetItem(key, value)               // 先写本地
    → _pendingSyncKeys.add('purchaseOrders')     // 标记待同步
    → setTimeout 300ms 防抖
  → closeModal() + showToast('提交成功')

300ms 后:
  → _batchSyncToSupabase(['purchaseOrders'])
    → syncToSupabase('purchaseOrders')
      → _detectChanges(newArr, snapshot)         // 增量检测
      → _upsertPurchaseOrder(sb, changedPO)      // 只推送变更
```

### 11.3 用户点击刷新
```
handleRefresh() [async]
  → await syncFromSupabase({ force: true })    // 强制重新拉取
  → loadModuleData(currentModule)               // 重新渲染
  → showToast('数据已刷新')
```

---

## 12. CSS 主题变量速查

| 类别 | 变量 | 值 |
|---|---|---|
| **背景** | `--bg-base` / `--bg-primary` / `--bg-card` | `#fafafa` / `#fff` / `#fff` |
| **边框** | `--border` / `--border-light` | `#d5d0d6` / `#e7e4e7` |
| **文字** | `--text-primary` / `--text-secondary` / `--text-muted` | `#1d161e` / `#5c5060` / `#a89ea9` |
| **品牌色** | `--accent` / `--accent-dark` | `#ec003f` / `#c70036` |
| **语义色** | `--success` / `--danger` / `--warning` / `--info` | `#16a34a` / `#e7000b` / `#d97706` / `#0284c7` |
| **圆角** | `--radius` / `--radius-lg` | `3px` / `6px` |
| **手绘边** | `--sketch-r1` ~ `--sketch-r4` | 不规则圆角组合 |

---

## 13. 已知限制与后续规划

| 项目 | 当前状态 | 后续计划 |
|---|---|---|
| **网络推送** | `git push` 无法连接 github.com:443 | 已用 `push.ps1` (GitHub REST API) 替代，稳定可用 |
| 登录认证 | 角色快速登录（无密码） | 接入 Supabase Auth（邮箱/密码） |
| RLS 行级权限 | 未启用（anon key 全开放） | Auth 接入后启用 RLS 策略 |
| 实时推送 | 需手动刷新 | 接入 Supabase Realtime 订阅 |
| 图表数据 | 趋势图使用模拟随机数据 | 改为从 Supabase 查询真实数据 |
| 操作记录页面 | HTML 已定义，JS 待实现 | 接入 `SupaDB.getAuditLogs()` |
| 后台管理 | 账号/角色/设置面板已定义 | 实现 CRUD 和配置保存 |
| 多用户冲突 | Last-write-wins | 乐观锁或版本冲突检测 |
| 自定义域名 | 使用 github.io 默认域名 | 可绑定自定义域名 |

---

## 14. 部署与维护

### 14.1 已知网络问题（重要）

**当前服务器无法使用 `git push` 推送代码。** `github.com:443` 的 git HTTPS 协议连接超时（`Recv failure: Connection was reset`），原因可能是网络出口限制。

**解决方案**：使用 GitHub REST API 推送文件（`api.github.com` 可正常访问）。PowerShell 的 `Invoke-RestMethod` 通过 HTTP PUT 请求直接更新仓库中的文件，绕过 git 协议。

此方案参考 V3 数据看板项目（`数据看板\V3\scripts\push-v3.ps1`），已验证可稳定工作。

### 14.2 推送代码更新（push.ps1）

**推送脚本位置**: `C:\Users\Administrator\Desktop\KingdeeVoucherAuto\3-库存管理\push.ps1`

**推送原理**:
- 遍历 14 个系统文件（index.html + css/ + js/ + database/）
- 对每个文件：先 GET 查询远程是否存在及 SHA → Base64 编码本地内容 → PUT 创建或更新
- 使用 GitHub Token 认证（Bearer 方式）
- 每个文件间隔 500ms 避免 API 限流

**运行方式**:
```powershell
powershell -ExecutionPolicy Bypass -File "push.ps1" "C:/Users/Administrator/Desktop/KingdeeVoucherAuto/3-库存管理"
```

> 注意：路径必须从命令行参数传入，因为脚本文件中的中文路径可能因编码问题乱码。

**推送的 14 个文件**:
```
index.html
css/style.css
database/schema.sql
js/app.js, js/auth.js, js/migrate-data.js, js/monthly-summary.js
js/navigation.js, js/purchase.js, js/requisition.js, js/stock-in.js
js/supabase-db.js, js/supabase-sync.js, js/toast.js
```

**如需新增推送文件**：编辑 `push.ps1` 中的 `$filesToPush` 数组即可。

### 14.3 版本升级流程

1. 本地修改代码文件
2. 更新 `index.html` 中所有 `?v=X.Y` 缓存破坏参数
3. **本地测试确认效果**（用户在浏览器中验证功能正常、无 BUG）
4. **用户确认定版**（用户明确同意后才进入下一步）
5. 运行 `push.ps1` 推送到 GitHub
6. 更新本文件（PROJECT_BRIEF.md）的版本号和变更记录
7. GitHub Pages 自动重新部署（约 1-2 分钟）

> **重要**：步骤 3-4 为必须环节。AI 智能体不得跳过用户确认自行推送，避免带 BUG 的代码被推送到线上。

### 14.4 数据迁移（首次或重建数据库时）

1. 在 Supabase SQL Editor 执行 `database/schema.sql`（运行时无视 RLS 警告，选 "Run without RLS"）
2. 在浏览器控制台执行 `migrateAllData()`（从 localStorage 迁移到 Supabase）

### 14.5 数据库备份

Supabase 自动每日备份。也可通过 SQL Editor 导出各表数据。

---

## 15. 版本变更记录

> 每次版本更新后必须在此追加记录，格式：版本号 → 日期 → 变更内容 → 涉及文件

### v5.7 — 2026-06-10（当前版本）

**主要变更**:
- 完成 Supabase 数据库集成（PostgreSQL 持久层 + localStorage 缓存层双存储架构）
- 重写 `supabase-sync.js` 为 v2.0：300ms 防抖批量同步 + 增量变更检测 + 初始加载保护
- `auth.js` 的 `showApp()` 改为 async，登录后先 `syncFromSupabase()` 再渲染
- `navigation.js` 的 `handleRefresh()` 改为 async，刷新时强制从 Supabase 拉取最新数据
- 创建 `push.ps1` 推送脚本，改用 GitHub REST API 推送（解决 git push 网络超时问题）
- 创建本文件 `PROJECT_BRIEF.md`，作为项目完整文档

**涉及文件**:
- `index.html` — 新增 supabase-sync.js/migrate-data.js 脚本引用，版本号升至 v=5.7
- `js/supabase-sync.js` — 完全重写（v2.0，~580行）
- `js/auth.js` — showApp() 改为 async
- `js/navigation.js` — handleRefresh() 改为 async + force 刷新
- `push.ps1` — 新建（GitHub API 推送脚本）
- `PROJECT_BRIEF.md` — 新建
- `.gitignore` — 新增 push.ps1、PROJECT_BRIEF.md 排除项

**已知问题**:
- 图表趋势数据仍使用模拟随机数（未从 Supabase 查询真实数据）
- 操作记录页面 JS 未完全实现
- 后台管理页面（用户/角色/设置）未完全实现
- 多用户间无实时推送（需 Supabase Realtime）
- 登录仍为 mock 角色快速登录

### v5.6 — 2026-06-10

**主要变更**:
- 添加 Supabase 同步脚本到 index.html
- showApp() 集成 syncFromSupabase() 调用
- 版本号升至 v=5.6

**涉及文件**: `index.html`, `js/auth.js`

### v5.5 及之前

- 基础库存管理系统搭建（纯前端 + localStorage）
- shadcn 主题、KPI 卡片、入库模态框、品类详情、批量采购、替换提醒、权限系统
- Supabase 集成文件创建（supabase-db.js、schema.sql）但未集成

---

## 16. 关联项目参考

| 项目 | 仓库 | GitHub Pages | 本地路径 |
|---|---|---|---|
| 库存管理系统 | `ww-ops2/ck` | https://ww-ops2.github.io/ck/ | `3-库存管理` |
| V3 数据看板 | `ww-ops2/-` | https://ww-ops2.github.io/-/ | `数据看板\V3` |

两个项目使用相同的 GitHub API 推送方式（`push.ps1` / `push-v3.ps1`），Token 不同。V3 的推送脚本位于 `数据看板\V3\scripts\push-v3.ps1`，是本系统推送方案的参考来源。
