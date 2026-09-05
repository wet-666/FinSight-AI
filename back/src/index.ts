import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config';
import { isRailway } from './config/env';
import { dbTarget, testDatabaseConnection } from './config/database';
import { initRedis, testRedisConnection } from './config/redis';
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
import riskRoutes from './routes/risk';
import { startSentimentCron } from './jobs/sentimentCron';
import { startCleanupCron } from './jobs/cleanupCron';
import { handleRouteError } from './middleware/auth';
import { probeMarketSource } from './services/marketService';
import { probeLLM } from './agents/llm';
import { ensureUsersSchema, STORAGE_ROOT } from './agents/ensureUsers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(STORAGE_ROOT));
app.use('/uploads', express.static(path.resolve(__dirname, '../storage')));

app.get('/api/health', async (_req, res) => {
  const db = await testDatabaseConnection();
  const redis = await testRedisConnection();
  const market = await probeMarketSource();
  const llm = await probeLLM();
  const ok = db.ok;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'finsight-ai',
    version: '1.2',
    database: db,
    dbTarget: {
      host: dbTarget.host,
      port: dbTarget.port,
      database: dbTarget.database,
      usingUrl: dbTarget.usingUrl,
      railway: isRailway(),
      envKeys: Object.keys(process.env)
        .filter((key) => /^(DB_|MYSQL|REDIS_ENABLED|RAILWAY_)/i.test(key))
        .sort(),
      envStatus: Object.fromEntries(
        [
          'DB_HOST',
          'DB_NAME',
          'DB_PASSWORD',
          'DB_PORT',
          'DB_USER',
          'MYSQLHOST',
          'MYSQLPORT',
          'MYSQLUSER',
          'MYSQLPASSWORD',
          'MYSQLDATABASE',
          'MYSQL_DATABASE',
          'MYSQL_URL',
        ].map((key) => {
          if (!(key in process.env)) return [key, 'missing'];
          if (!process.env[key]?.trim()) return [key, 'empty'];
          return [key, 'set'];
        })
      ),
    },
    redis,
    market,
    llm,
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
app.use('/api/risk', riskRoutes);

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

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`🚀 FinSight-AI 后端已启动: http://0.0.0.0:${config.port}`);
  console.log(
    `DB target: ${dbTarget.host}:${dbTarget.port}/${dbTarget.database} railway=${isRailway()} usingUrl=${dbTarget.usingUrl}`
  );
  await initRedis();
  const db = await testDatabaseConnection();
  if (db.ok) {
    console.log('✅', db.message);
    await ensureUsersSchema();
  } else {
    console.error('❌', db.message);
    console.error('   请修改 back/.env 中的数据库配置，并执行 sql/database.sql');
  }
  const llm = await probeLLM();
  console.log(llm.ok ? '✅' : '⚠️', llm.message);
  startSentimentCron();
  startCleanupCron();
});

export default app;
