//存放环境变量的配置文件
import { readEnv } from './env'

export const config = {
  port: Number(readEnv('PORT')) || 3300,
  jwt: {
    secret: readEnv('JWT_SECRET') || 'dev_secret_change_me',
    expiresIn: readEnv('JWT_EXPIRES_IN') || '7d',
  },
  openai: {
    // 默认使用非思考 Instruct 模型，避免 content 为空 / 超时
    apiKey: readEnv('OPENAI_API_KEY', 'OPENAI_API_KEY2'),
    baseURL:
      readEnv('OPENAI_BASE_URL', 'OPENAI_BASE_URL2') ||
      'https://api.siliconflow.cn/v1',
    model:
      readEnv('OPENAI_MODEL', 'OPENAI_MODEL2') ||
      'deepseek-ai/DeepSeek-V3',
    /** 轻量 RAG 用；失败时自动降级关键词检索 */
    embeddingModel: readEnv('OPENAI_EMBEDDING_MODEL') || 'BAAI/bge-m3',
    timeoutMs: Number(readEnv('OPENAI_TIMEOUT_MS')) || 45_000,
  },
  newsCron: readEnv('NEWS_CRON') || '0 */2 * * *',
  cleanupCron: readEnv('CLEANUP_CRON') || '0 3 * * *',
  retention: {
    newsDays: Number(readEnv('NEWS_RETENTION_DAYS')) || 90,
    sentimentAggregateDays: Number(readEnv('SENTIMENT_AGGREGATE_RETENTION_DAYS')) || 180,
  },
  /** 可选：行情短时缓存；Redis 挂了会自动降级直连外网 */
  redis: {
    enabled: readEnv('REDIS_ENABLED') !== 'false',
    host: readEnv('REDIS_HOST') || '127.0.0.1',
    port: Number(readEnv('REDIS_PORT')) || 6379,
    password: readEnv('REDIS_PASSWORD'),
    db: Number(readEnv('REDIS_DB')) || 0,
    /** 实时报价 / 指数 TTL（秒） */
    quoteTtlSeconds: Number(readEnv('REDIS_QUOTE_TTL')) || 20,
  },
}
