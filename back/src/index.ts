import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config';
import { testDatabaseConnection } from './config/database';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboard';
import stockRoutes from './routes/stock';
import backtestRoutes from './routes/backTest';
import notesRoutes from './routes/notes';
import sentimentRoutes from './routes/sentiment';
import tradingRoutes from './routes/trading';
import outlookRoutes from './routes/outlook';
import agentsRoutes from './routes/agents';
import reportsRoutes from './routes/reports';
import portfolioRoutes from './routes/portfolio';
import { startSentimentCron } from './jobs/sentimentCron';
import { startCleanupCron } from './jobs/cleanupCron';
import { handleRouteError } from './middleware/auth';
import { probeMarketSource } from './services/marketService';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  const db = await testDatabaseConnection();
  const market = await probeMarketSource();
  const llm = Boolean(config.openai.apiKey);
  const ok = db.ok;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'finsight-ai',
    database: db,
    market,
    llm: {
      ok: llm,
      message: llm ? `LLM 已配置（${config.openai.model}）` : '未配置 OPENAI_API_KEY，Agent 将走 demo 模式',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/outlook', outlookRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/portfolio', portfolioRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    handleRouteError(err, res);
  }
);

app.listen(config.port, async () => {
  console.log(`🚀 FinSight-AI 后端已启动: http://localhost:${config.port}`);
  const db = await testDatabaseConnection();
  if (db.ok) {
    console.log('✅', db.message);
  } else {
    console.error('❌', db.message);
    console.error('   请修改 back/.env 中的数据库配置，并执行 sql/schema.sql');
  }
  startSentimentCron();
  startCleanupCron();
});

export default app;
