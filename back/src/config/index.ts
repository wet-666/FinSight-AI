//存放环境变量的配置文件
import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: Number(process.env.PORT) || 3300,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  openai: {
    // 默认使用非思考 Instruct 模型，避免 content 为空 / 超时
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY2 || '',
    baseURL:
      process.env.OPENAI_BASE_URL ||
      process.env.OPENAI_BASE_URL2 ||
      'https://api.siliconflow.cn/v1',
    model:
      process.env.OPENAI_MODEL ||
      process.env.OPENAI_MODEL2 ||
      'deepseek-ai/DeepSeek-V3',
    /** 轻量 RAG 用；失败时自动降级关键词检索 */
    embeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL || 'BAAI/bge-m3',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 45_000,
  },
  newsCron: process.env.NEWS_CRON || '0 */2 * * *',
  cleanupCron: process.env.CLEANUP_CRON || '0 3 * * *',
  retention: {
    newsDays: Number(process.env.NEWS_RETENTION_DAYS) || 90,
    sentimentAggregateDays: Number(process.env.SENTIMENT_AGGREGATE_RETENTION_DAYS) || 180,
  },
  /** 可选：行情短时缓存；Redis 挂了会自动降级直连外网 */
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: Number(process.env.REDIS_DB) || 0,
    /** 实时报价 / 指数 TTL（秒） */
    quoteTtlSeconds: Number(process.env.REDIS_QUOTE_TTL) || 20,
  },
}
