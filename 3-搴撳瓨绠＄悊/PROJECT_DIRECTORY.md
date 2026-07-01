# 库存管理系统 - 项目方案

> **创建日期**: 2026-06-09  
> **项目类型**: Web在线库存资源管理系统  
> **数据存储**: Supabase (PostgreSQL)  
> **部署方式**: GitHub Pages (单页应用)  
> **协作模式**: 多人实时数据修改与查看

---

## 📋 项目概述

### 核心目标
构建一个**在线库存资源管理系统**，支持多人协作管理采购物品的入库和出库情况。

---

## 🎯 功能需求

### 1. 物品管理
- 物品信息、库存数量、状态管理、图片附件

### 2. 入库管理
- 采购入库、退货入库、调拨入库、批次管理

### 3. 出库管理
- 领用出库、销售出库、报废出库、调拨出库

### 4. 库存查询与统计
- 实时库存、库存预警、出入库明细、统计报表

### 5. 用户权限管理
- 管理员、库管员、查看者三种角色

---

## 🏗️ 技术架构

**前端**: HTML5 + CSS3 + JavaScript (参考财务看板V3)  
**后端**: Supabase (PostgreSQL + Realtime)  
**部署**: GitHub Pages  

---

## 📊 数据库设计

### 核心表
1. items (物品表)
2. stock_in_records (入库记录表)
3. stock_out_records (出库记录表)
4. user_profiles (用户扩展表)
5. operation_logs (操作日志表)

---

## 📁 项目目录结构

`
3-库存管理/
├── PROJECT_DIRECTORY.md          # 本文件
├── index.html                    # 主页面
├── css/                          # 样式文件
├── js/                           # JavaScript模块
│   ├── app.js                    # 主逻辑
│   ├── auth.js                   # 认证模块
│   ├── database.js               # 数据库操作
│   ├── realtime.js               # 实时同步
│   ├── items.js                  # 物品管理
│   ├── stock-in.js               # 入库管理
│   ├── stock-out.js              # 出库管理
│   └── reports.js                # 统计报表
├── assets/                       # 静态资源
└── docs/                         # 文档
`

---

## 🔐 Supabase配置

需要配置环境变量和Row Level Security策略。

---

## 🚀 开发计划

**Phase 1**: 基础架构 (3天)  
**Phase 2**: 核心功能 (5天)  
**Phase 3**: 高级功能 (4天)  
**Phase 4**: 优化测试 (3天)  
**Phase 5**: 文档培训 (2天)  

总计约17个工作日。

---

## 📝 参考资源

**关键参考项目**: 财务数据看板 V3  
路径: c:\Users\Administrator\Desktop\KingdeeVoucherAuto\数据看板\V3\index.html

复用其Supabase集成方案、实时同步逻辑、UI设计风格。

---

## ⚠️ 注意事项

1. 不要暴露Service Role Key
2. 必须启用RLS安全策略
3. 实现分页加载和防抖搜索
4. 定期备份数据

---

## 📌 快速启动指南

对于新对话的AI助手：
1. 阅读本文件了解整体架构
2. 查看财务看板V3学习Supabase集成
3. 优先搭建数据库结构
4. 再实现前端UI和交互

---

**版本**: v1.0  
**最后更新**: 2026-06-09
