import Redis from 'ioredis'
import { config } from './index'

let client: Redis | null = null
let ready = false
let warned = false

function createClient(): Redis | null {
  if (!config.redis.enabled) return null

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    // Redis 不可用时静默降级，不影响行情主流程
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  })

  redis.on('ready', () => {
    ready = true
    warned = false
  })

  redis.on('end', () => {
    ready = false
  })

  redis.on('error', (err) => {
    ready = false
    if (!warned) {
      warned = true
      console.warn('⚠️ Redis 不可用，行情将不走缓存:', err.message)
    }
  })

  return redis
}

export async function initRedis(): Promise<void> {
  if (!config.redis.enabled) {
    console.log('ℹ️ Redis 缓存已关闭（REDIS_ENABLED=false）')
    return
  }

  client = createClient()
  if (!client) return

  try {
    await client.connect()
    await client.ping()
    ready = true
    console.log(
      `✅ Redis 已连接: ${config.redis.host}:${config.redis.port} (db=${config.redis.db})`
    )
  } catch (err) {
    ready = false
    const message = err instanceof Error ? err.message : String(err)
    console.warn('⚠️ Redis 连接失败，将跳过缓存:', message)
    try {
      client.disconnect()
    } catch {
      /* ignore */
    }
    client = null
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return
  try {
    await client.quit()
  } catch {
    client.disconnect()
  } finally {
    client = null
    ready = false
  }
}

export function isRedisReady(): boolean {
  return Boolean(client && ready)
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisReady() || !client) return null
  try {
    const raw = await client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  if (!isRedisReady() || !client || ttlSeconds <= 0) return
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    /* ignore — cache is best-effort */
  }
}

export async function testRedisConnection(): Promise<{ ok: boolean; message: string }> {
  if (!config.redis.enabled) {
    return { ok: false, message: 'Redis 已关闭（可选）' }
  }
  if (!isRedisReady() || !client) {
    return { ok: false, message: 'Redis 未连接（行情将直连外网）' }
  }
  try {
    const pong = await client.ping()
    if (pong === 'PONG') {
      return {
        ok: true,
        message: `Redis 正常（${config.redis.host}:${config.redis.port}）`,
      }
    }
    return { ok: false, message: 'Redis ping 异常' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Redis 不可用: ${message}` }
  }
}
