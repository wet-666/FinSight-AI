//数据库连接与操作封装模块
import dns from 'node:dns';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { readEnv } from './env';

// Railway 内网是 IPv6；Node 默认先走 IPv4 会 ECONNREFUSED
dns.setDefaultResultOrder('ipv6first');

const dbHost = readEnv('DB_HOST', 'MYSQLHOST') || 'localhost';
const dbPort = Number(readEnv('DB_PORT', 'MYSQLPORT')) || 3306;
const dbUser = readEnv('DB_USER', 'MYSQLUSER') || 'root';
const dbName = readEnv('DB_NAME', 'MYSQLDATABASE', 'MYSQL_DATABASE') || 'FinSightAI';
const dbUrl = readEnv('DATABASE_URL', 'MYSQL_URL', 'MYSQLURL');
const dbPassword = readEnv('DB_PASSWORD', 'MYSQLPASSWORD', 'MYSQL_ROOT_PASSWORD');

export const dbTarget = {
  host: dbHost,
  port: dbPort,
  database: dbName,
  user: dbUser,
  usingUrl: Boolean(dbUrl),
};

const pool = dbUrl
  ? mysql.createPool({
      uri: dbUrl,
      charset: 'utf8mb4',
      decimalNumbers: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    })
  : mysql.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      charset: 'utf8mb4',
      decimalNumbers: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

export default pool;

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

function toFriendlyDbError(err: unknown): DatabaseError {
  const e = err as { code?: string; errno?: number; sqlMessage?: string };
  if (e.code === 'ER_ACCESS_DENIED_ERROR') {
    return new DatabaseError(
      '数据库连接失败：用户名或密码错误，请检查 back/.env 中的 DB_USER 和 DB_PASSWORD',
      e.code
    );
  }
  if (e.code === 'ECONNREFUSED') {
    return new DatabaseError(
      `数据库连接失败：无法连上 ${dbHost}:${dbPort}（库 ${dbName}）。本地请启动 MySQL；Railway 请确认已引用 MySQL 变量并重新部署`,
      e.code
    );
  }
  if (e.code === 'ER_BAD_DB_ERROR') {
    return new DatabaseError(
      '数据库不存在：请先执行 sql/database.sql 初始化 FinSightAI 数据库',
      e.code
    );
  }
  if (e.code === 'ER_NO_SUCH_TABLE') {
    return new DatabaseError(
      '数据表不存在：请先执行 sql/database.sql 初始化表结构',
      e.code
    );
  }
  return new DatabaseError(e.sqlMessage || '数据库操作失败', e.code);
}

export async function query<T = RowDataPacket[]>(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T> {
  try {
    const [results] = await pool.execute(sql, params);
    return results as T;
  } catch (err) {
    throw toFriendlyDbError(err);
  }
}

export async function execute(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<{ insertId: number; affectedRows: number }> {
  try {
    const [result] = await pool.execute(sql, params);
    const header = result as { insertId?: number; affectedRows?: number };
    return {
      insertId: Number(header.insertId || 0),
      affectedRows: Number(header.affectedRows || 0),
    };
  } catch (err) {
    throw toFriendlyDbError(err);
  }
}

export async function testDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await pool.query('SELECT 1');
    return { ok: true, message: '数据库连接正常' };
  } catch (err) {
    return { ok: false, message: toFriendlyDbError(err).message };
  }
}
