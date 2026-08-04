import pool from '../config/database';

let ensured = false;

/** 兼容旧库：mode 扩成可含 llm_fallback；避免 ENUM 写入失败导致整次落库被静默吞掉 */
export async function ensureAgentRunsSchema(): Promise<void> {
  if (ensured) return;
  try {
    await pool.query(
      `ALTER TABLE agent_runs
       MODIFY COLUMN mode VARCHAR(32) NOT NULL DEFAULT 'demo'`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 表不存在时由业务侧报错；重复修改可忽略
    if (!/doesn't exist|Unknown table/i.test(msg)) {
      console.warn('[agent_runs] ensure schema:', msg);
    }
  }
  ensured = true;
}
