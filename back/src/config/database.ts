//数据库连接与操作封装模块
//RowDataPacket：TypeScript 类型，表示查询结果行的结构
import mysql, { RowDataPacket } from 'mysql2/promise'; //promise版本,所有方法返回promise
import dotenv from 'dotenv';

dotenv.config();

//连接池，用于复用数据库连接
//从.env文件中读取数据库连接信息
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'FinSight_AI',
  waitForConnections: true,   //当连接池无可用连接时，是否等待
  connectionLimit: 10,   //最大连接数
  queueLimit: 0,      //等待队列的最大长度，默认为0（无限制）
})

export default pool

//继承Error类并添加数据库错误码属性
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

//错误映射函数，将数据库错误映射为友好的错误信息
function toFriendlyDbError(err: unknown): DatabaseError {
  const e = err as { code?: string; errno?: number; sqlMessage?: string };
  if (e.code === 'ER_ACCESS_DENIED_ERROR') {
    return new DatabaseError(
      '数据库连接失败：用户名或密码错误，请检查 backend/.env 中的 DB_USER 和 DB_PASSWORD',
      e.code
    );
  }
  if (e.code === 'ECONNREFUSED') {
    return new DatabaseError(
      '数据库连接失败：MySQL 服务未启动，请先启动 MySQL',
      e.code
    );
  }
  if (e.code === 'ER_BAD_DB_ERROR') {
    return new DatabaseError(
      '数据库不存在：请先执行 sql/schema.sql 初始化 FinSight_AI 数据库',
      e.code
    );
  }
  if (e.code === 'ER_NO_SUCH_TABLE') {
    return new DatabaseError(
      '数据表不存在：请先执行 sql/database.sql 初始化 FinSight_AI 数据库的表结构',
      e.code
    );
  }
  return new DatabaseError(e.sqlMessage || '数据库操作失败', e.code);
}

//提供统一的数据库查询入口，自动处理参数化查询（防 SQL 注入）和错误转换
export async function query<T = RowDataPacket[]>(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T> {
  try {
    //预处理语句，将 params 安全地绑定到 SQL 中的占位符 ?，防止 SQL 注入
    const [results] = await pool.execute(sql, params);
    return results as T;
  } catch (err) {
    throw toFriendlyDbError(err);
  }
}

export async function execute(
   sql:string,
   params?:(string | number | boolean | null | Date)[]
):Promise<{ insertId:number; affectedRows:number }>{
    try{
       const [result] = await pool.execute(sql,params)
       const header = result as { insertId?:number; affectedRow?:number }
       return {
         insertId:Number(header.insertId || 0),
         affectedRows:Number(header.affectedRow || 0),
       }
      }catch(err){
       throw toFriendlyDbError(err)
    }
}

//用于快速验证数据库连通性，用于服务启动时的健康检查或初始化步骤。
export async function testDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await pool.query('SELECT 1');
    return { ok: true, message: '数据库连接正常' };
  } catch (err) {
    return { ok: false, message: toFriendlyDbError(err).message };
  }
}