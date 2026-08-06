import { initRedis, cacheSet, cacheGet, testRedisConnection, closeRedis } from '../config/redis'

async function main() {
  await initRedis()
  console.log(await testRedisConnection())
  await cacheSet('fs:test:ping', { ok: true }, 10)
  console.log('cacheGet', await cacheGet<{ ok: boolean }>('fs:test:ping'))
  await closeRedis()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
