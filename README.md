# FinSight-AI

A 股投研辅助 Demo：聚合公开行情与资讯，提供舆情分析、轻量 RAG 取证、多 Agent 报告生成、回测与模拟交易等能力。

> 仅供学习研究，不构成投资建议。

## 功能

- 个股分析：舆情 / 量化 / 秘书 Agent 编排，SSE 分阶段推送
- 轻量 RAG：新闻检索后进模型；Embedding 不可用时关键词降级
- 报告引用与规则冲突提示，支持基于本次分析的追问
- 仪表盘、笔记、回测、模拟交易、风险测评等页面

## 技术栈

| 部分 | 技术 |
|------|------|
| 前端 | Vue 3、Vite、Pinia、TDesign、ECharts |
| 后端 | Express、TypeScript、MySQL、LangChain |
| 共享 | `shared/types` |
| 模型 | OpenAI 兼容接口（如 SiliconFlow） |

## 目录

```
FinSight-AI/
  front/          # 前端
  back/           # 后端
  shared/         # 前后端共享类型
  sql/            # 数据库脚本
```

## 环境要求

- Node.js 18+
- MySQL 8+

## 快速开始

```bash
# 安装依赖（仓库根目录）
npm install

# 初始化数据库
mysql -uroot -p < sql/database.sql

# 配置后端环境变量
copy back\.env.example back\.env
# 编辑 back\.env：数据库账号、OPENAI_API_KEY 等

# 写入演示数据（可选）
npm run seed

# 启动后端
npm run dev:back

# 另开终端，启动前端
npm run dev:front
```

- 前端：http://localhost:5173（`/api` 代理到后端）
- 后端：http://localhost:3300
- 本地账号（需先 seed）：`demo` / `demo123456`

## 主要接口（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| GET | `/api/health` | 健康检查（含 LLM 探测） |
| POST | `/api/stock/:code/analyze-stream` | 个股分析（SSE） |
| POST | `/api/agents/runs/:id/ask` | 基于某次分析追问 |
| POST | `/api/backtest/*` | 回测相关 |

更完整的路由见 `back/src/routes/`。

## 配置说明

`back/.env` 常用项：

- `PORT`：后端端口
- MySQL 连接相关变量
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / 模型名
- 可选：`OPENAI_EMBEDDING_MODEL`（如 `BAAI/bge-m3`）

未配置 Key 时，部分能力会降级为规则或本地样例数据，页面会有相应提示。

## 说明

- 向量检索为进程内存储，重启后需重新构建
- 外网资讯接口不稳定时可能使用本地样例并标记数据缺口
- 回测与模拟交易为教学用途，非实盘

## License

Private / personal use.
