# 库存管理系统

## 📖 项目说明

这是一个基于 **Supabase + GitHub Pages** 的在线库存资源管理系统，支持多人协作管理物品的入库和出库。

### 核心特性
- ✅ 云端数据存储，实时同步
- ✅ 多人同时操作，权限控制
- ✅ 完整的出入库记录追踪
- ✅ 库存预警和统计报表
- ✅ 响应式设计，支持移动端

---

## 🚀 快速开始

### 1. 阅读项目方案
打开 [PROJECT_DIRECTORY.md](./PROJECT_DIRECTORY.md) 查看完整的技术方案和开发计划。

### 2. 参考项目
本系统基于 **财务数据看板 V3** 的技术架构：
- 路径: c:\Users\Administrator\Desktop\KingdeeVoucherAuto\数据看板\V3\index.html
- 复用其 Supabase 集成方式、UI 设计风格、实时同步逻辑

### 3. 技术栈
- **前端**: HTML5 + CSS3 + JavaScript (无框架)
- **后端**: Supabase (PostgreSQL + Auth + Realtime)
- **部署**: GitHub Pages

---

## 📁 目录结构

`
3-库存管理/
├── README.md                     # 本文件
├── PROJECT_DIRECTORY.md          # 详细项目方案
├── index.html                    # 主页面（待创建）
├── css/                          # 样式文件（待创建）
├── js/                           # JavaScript模块（待创建）
└── docs/                         # 文档（待创建）
`

---

## 🎯 主要功能

### ✅ 已实现功能

1. **采购单管理** ⭐NEW v1.2
   - ✨ **多物品采购**：点击“+”按钮无限添加物品行
   - ✨ **智能类别管理**：下拉选择 + 直接输入 + 自动创建新类别
   - ✨ **品牌/型号历史**：自动保存并智能提示，减少重复输入
   - ✨ **唯一商品编码**：自动生成SKU编码，全局唯一
   - 手动创建采购单（多物品明细）
   - Excel模板导入（支持拖拽上传）
   - 数据预览和校验
   - 自动分组生成采购单
   - 状态流转管理
   - 📖 [查看详细说明](./docs/采购单增强功能说明.md)
   - 🚀 [快速开始](./docs/采购单功能快速开始.md)
   - ✅ [测试指南](./docs/采购单功能测试指南.md)

2. **入库管理** ⭐NEW
   - 仓库确认入库
   - 批次号管理
   - 实收数量核对
   - 验收备注记录
   - 自动生成库存明细

3. **库存自动生成** ⭐NEW
   - 入库后自动创建/更新库存
   - 智能匹配现有物品
   - 库存数量累加
   - 完整的数据溯源链条

4. **权限控制系统** ⭐NEW
   - 4种角色：采购员、仓库管理员、财务、管理员
   - 基于角色的菜单和按钮控制
   - 操作权限验证

5. **物品管理**: CRUD操作、图片上传、标签分类
6. **出库管理**: 领用出库、销售出库、报废处理
7. **库存查询**: 实时库存、低库存预警
8. **统计报表**: 出入库汇总、热门物品排行

### 📋 待实现功能
- 领用单管理流程
- 出库确认流程
- 团期使用报表
- Supabase云端集成

---

## 🔧 开发环境

### 前置要求
- Node.js (可选，用于本地开发服务器)
- VSCode + Live Server 插件
- Supabase 账号

### 本地开发
`ash
# 在 VSCode 中右键 index.html → Open with Live Server
# 或使用 Python 简易服务器
python -m http.server 8080
`

### 部署到 GitHub Pages
`ash
git add .
git commit -m  更新内容
git push origin main
# GitHub Actions 会自动部署到 GitHub Pages
`

---

## 📊 数据库表

| 表名 | 说明 |
|------|------|
| items | 物品信息表 |
| stock_in_records | 入库记录表 |
| stock_out_records | 出库记录表 |
| user_profiles | 用户扩展表 |
| operation_logs | 操作日志表 |

详细结构见 [PROJECT_DIRECTORY.md](./PROJECT_DIRECTORY.md)

---

## 📚 文档资源

- [采购入库流程说明](./docs/采购入库流程说明.md) - 详细的业务流程和使用说明
- [快速测试指南](./docs/快速测试指南.md) - 功能测试步骤和验证方法
- [功能实现总结](./docs/功能实现总结.md) - 技术实现和代码说明

---

## ⚠️ 注意事项

1. **安全性**: 不要将 Supabase Service Role Key 暴露在前端代码中
2. **RLS策略**: 必须启用 Row Level Security 限制数据访问
3. **并发控制**: 实现乐观锁避免数据冲突
4. **数据备份**: 定期备份到 GitHub 或本地

---

## 📞 联系方式

如有问题，请通过 GitHub Issues 反馈。

---

**版本**: v1.2  
**最后更新**: 2026-06-16
