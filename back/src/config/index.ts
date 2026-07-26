//存放环境变量的配置文件
import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY2 || '',
    baseURL: process.env.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL2 || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || process.env.OPENAI_MODEL2 || 'gpt-4o-mini',
  },
  newsCron: process.env.NEWS_CRON || '0 */2 * * *',
  cleanupCron: process.env.CLEANUP_CRON || '0 3 * * *',
  retention: {
    newsDays: Number(process.env.NEWS_RETENTION_DAYS) || 90,
    sentimentAggregateDays: Number(process.env.SENTIMENT_AGGREGATE_RETENTION_DAYS) || 180,
  },
}