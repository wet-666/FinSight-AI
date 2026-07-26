# FinSight-AI 学习路线（按文件顺序）

> 项目路径：`E:\FinSight-AI`  
> 目标：先能跑通，再懂 monorepo + shared 类型，再啃业务与 Agent。

## 第 0 步：跑起来（0.5 天）

| 顺序 | 文件/命令 | 学什么 |
|------|-----------|--------|
| 1 | 根目录 `package.json` | workspaces：`back` / `front` / `shared/types` |
| 2 | `sql/` | 建库脚本，DB 名与 `back/.env` 中 `DB_NAME` 一致 |
| 3 | `back/.env` | PORT=3300、MySQL、可选 LLM Key |
| 4 | `npm run dev:back` / `npm run dev:front` | 后端 3300，前端经 Vite 代理 `/api` |

过关：浏览器能打开登录页，登录后进仪表盘。

---

## 第 1 步：Shared 类型（核心习惯，1 天）

你项目的约定：**前后端共用的类型放 `shared/types`，不要两边各写一份。**

| 顺序 | 文件 | 内容 |
|------|------|------|
| 1 | `shared/types/package.json` | `@shared/types` 导出映射 |
| 2 | `shared/types/common.ts` | `ApiResponse` |
| 3 | `shared/types/login.ts` | `PublicUser` / 登录注册响应 |
| 4 | `shared/types/database.ts` | DB 行（含 `password_hash`） |
| 5 | `shared/types/dashboard.ts` | 指数、K 线、行情、新闻、自选 |
| 6 | `shared/types/backtest.ts` | 回测配置与结果 |
| 7 | `shared/types/agent.ts` | 三 Agent 阶段结构 |
| 8 | `shared/types/report.ts` / `trading.ts` / `portfolio.ts` / `notes.ts` | 报告、模拟盘、诊断、笔记 |

练习：给 `WatchItem` 加一个字段，前后端各改一处引用，体会「只改 shared」。

---

## 第 2 步：后端骨架（2 天）

| 顺序 | 文件 | 学什么 |
|------|------|--------|
| 1 | `back/src/index.ts` | 路由挂载、`/api/health` |
| 2 | `back/src/config/index.ts` + `database.ts` | 配置与连接池 |
| 3 | `back/src/middleware/auth.ts` | JWT、`success/error` |
| 4 | `back/src/routes/authRoutes.ts` | 注册登录、自选股 |
| 5 | `back/src/routes/dashboard.ts` | 仪表盘聚合 |

黄金追踪：登录 → `POST /api/auth/login` → JWT → 带 Token 调 `GET /api/dashboard/overview`。

---

## 第 3 步：数据与 Agent（主菜，3～4 天）

| 顺序 | 文件 | 学什么 |
|------|------|--------|
| 1 | `back/src/services/marketService.ts` | K 线：DB → 东方财富 → 种子 |
| 2 | `back/src/services/sentimentService.ts` | 情感分析与聚合 |
| 3 | `back/src/agents/orchestrator.ts` | 三 Agent 顺序编排 |
| 4 | `back/src/agents/sentimentAgent.ts` 等 | 各角色 Prompt/结构化输出 |
| 5 | `back/src/routes/stock.ts` | `/chart`、`/analyze` |

前端对照：`front/src/views/StockAnalysis.vue`（时间线 + K 线）。

---

## 第 4 步：回测 / 报告 / 组合（2 天）

| 顺序 | 文件 | 学什么 |
|------|------|--------|
| 1 | `back/src/services/backtestService.ts` | 夏普、回撤、基准 |
| 2 | `back/src/routes/backTest.ts` | **注意：跑回测是 `POST /backtest/run`** |
| 3 | `back/src/services/reportService.ts` | MD/HTML/PDF |
| 4 | `back/src/services/portfolioService.ts` | 组合诊断 |
| 5 | `front/src/views/BacktestComponent.vue` 等 | 页面如何消费 shared 类型 |

---

## 第 5 步：前端工程与路由（1～2 天）

| 顺序 | 文件 | 学什么 |
|------|------|--------|
| 1 | `front/src/main.ts` | Vue + Pinia + Router + TDesign |
| 2 | `front/src/router/index.ts` | auth/guest meta、404、标题 |
| 3 | `front/src/api/http.ts` | 拦截器、`baseURL: '/api'` |
| 4 | `front/src/api/index.ts` | 全部 API 封装 |
| 5 | `front/src/layouts/MainLayout.vue` | 侧栏与鉴权布局 |
| 6 | `front/src/stores/userStore.ts` | Token / 用户态 |
| 7 | `front/vite.config.ts` | `/api` → `localhost:3300` 代理 |

---

## 必精读文件（★★★★★）

1. `shared/types/*`（习惯）
2. `front/src/router/index.ts`
3. `back/src/agents/orchestrator.ts`
4. `back/src/services/marketService.ts`
5. `front/src/api/http.ts` + `index.ts`
6. `front/src/views/StockAnalysis.vue`

---

## 一句话顺序

**跑通 → shared 类型 → 鉴权/DB → 行情舆情 → 三 Agent → 回测报告 → 前端路由与 API 封装**
