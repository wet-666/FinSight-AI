/**
 * 数据库连接检测脚本
 * 用法: npx tsx src/scripts/check-db.ts
 */
import dotenv from 'dotenv';
import { testDatabaseConnection } from '../config/database.js';

dotenv.config();

async function main() {
  console.log('正在检测数据库连接...');
  console.log(`  主机: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`  端口: ${process.env.DB_PORT || 3306}`);
  console.log(`  用户: ${process.env.DB_USER || 'root'}`);
  console.log(`  数据库: ${process.env.DB_NAME || 'investment_research'}`);
  console.log(`  密码: ${process.env.DB_PASSWORD ? '已配置' : '未配置（空密码）'}`);

  const result = await testDatabaseConnection();
  if (result.ok) {
    console.log('\n✅', result.message);
    process.exit(0);
  } else {
    console.error('\n❌', result.message);
    console.error('\n请按以下步骤修复：');
    console.error('1. 打开 backend/.env，将 DB_PASSWORD 改为你本机 MySQL root 的真实密码');
    console.error('2. 在 MySQL 中执行: source sql/schema.sql');
    console.error('   或: mysql -u root -p < sql/schema.sql');
    process.exit(1);
  }
}

main();
