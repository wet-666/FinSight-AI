import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { query } from '../config/database'
import { generateSeedKLine, saveKLineToDb, STOCK_META } from '../services/marketService'
import { toDateStr } from '../utils/date'

dotenv.config()

const DEMO_STOCKS = Object.entries(STOCK_META).map(([code,meta])=>({
   code,
   name:meta.name,
   market:meta.market,
   industry:({
     '600519': '白酒',
        '000858': '白酒',
        '601318': '保险',
        '000001': '银行',
        '600036': '银行',
        '300750': '新能源',
        '002594': '汽车',
        '510300': '宽基指数',
   } as Record<string,string>)[code] || '其他'
}))

async function upsertUser(){
    const hash = await bcrypt.hash('demo123456', 10);
  await query(
    `INSERT INTO users (username, email, password_hash, nickname, avatar)
     VALUES ('demo', 'demo@zhi-touyan.local', ?, '示例用户', '')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), nickname = '示例用户'`,
    [hash]
  );
  const rows = await query<{ id: number }[]>(
    `SELECT id FROM users WHERE username = 'demo' LIMIT 1`
  );
  return rows[0].id;
}

async function seedWatchlist(userId: number) {
  for (const s of DEMO_STOCKS.slice(0, 5)) {
    await query(
      `INSERT IGNORE INTO watchlist (user_id, stock_code, stock_name, market)
       VALUES (?, ?, ?, ?)`,
      [userId, s.code, s.name, s.market]
    );
  }
}

async function seedIndustry() {
  for (const s of DEMO_STOCKS) {
    await query(
      `INSERT INTO stock_industry (stock_code, stock_name, industry, market)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE stock_name = VALUES(stock_name), industry = VALUES(industry)`,
      [s.code, s.name, s.industry, s.market]
    );
  }
}

async function seedHistory() {
  for (const s of DEMO_STOCKS) {
    const kline = generateSeedKLine(s.code, 140);
    await saveKLineToDb(s.code, kline);
    console.log(`  ✓ stock_history ${s.code} ${kline.length} bars`);
  }
}

async function seedSentiment(codes: string[]) {
  const now = new Date();
  for (const code of codes) {
    for (let i = 90; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const date = toDateStr(d);
      const seed = parseInt(code.slice(-3), 10) || 1;
      const score =
        Math.round((Math.sin((i + seed) / 9) * 0.55 + Math.cos(i / 15) * 0.2) * 100) / 100;
      const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
      await query(
        `INSERT INTO daily_sentiment
          (stock_code, trade_date, avg_score, news_count, positive_count, negative_count, neutral_count)
         VALUES (?, ?, ?, 3, ?, ?, ?)
         ON DUPLICATE KEY UPDATE avg_score = VALUES(avg_score), news_count = VALUES(news_count)`,
        [
          code,
          date,
          score,
          label === 'positive' ? 2 : 1,
          label === 'negative' ? 2 : 0,
          label === 'neutral' ? 1 : 0,
        ]
      );
    }
  }

  for (let i = 30; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = toDateStr(d);
    const score =
      Math.round((Math.sin((i + 3) / 7) * 0.35 + Math.cos(i / 11) * 0.12) * 100) / 100;
    await query(
      `INSERT INTO market_sentiment (trade_date, avg_score, news_count)
       VALUES (?, ?, 12)
       ON DUPLICATE KEY UPDATE avg_score = VALUES(avg_score)`,
      [date, score]
    );
  }
}

async function seedNews(codes: string[]) {
  const samples = [
    { title: '白酒板块关注度回升，龙头估值讨论升温', tone: 0.4 },
    { title: '金融股震荡整理，机构观点分化', tone: -0.05 },
    { title: '新能源产业链库存与价格信号并存', tone: 0.15 },
    { title: '银行净息差与资产质量成为市场焦点', tone: -0.2 },
    { title: '消费复苏预期推升部分龙头情绪', tone: 0.35 },
  ];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const related = [codes[i % codes.length], codes[(i + 1) % codes.length]];
    await query(
      `INSERT INTO news (title, content, source, url, related_stocks, published_at)
       VALUES (?, ?, '智投研演示源', '', ?, NOW())`,
      [s.title, `${s.title}。示例资讯，用于本地联调。`, JSON.stringify(related)]
    );
    const newsRows = await query<{ id: number }[]>(
      `SELECT id FROM news WHERE title = ? ORDER BY id DESC LIMIT 1`,
      [s.title]
    );
    const newsId = newsRows[0]?.id;
    if (!newsId) continue;
    for (const code of related) {
      const label = s.tone > 0.2 ? 'positive' : s.tone < -0.2 ? 'negative' : 'neutral';
      await query(
        `INSERT INTO news_sentiment (news_id, stock_code, sentiment_score, sentiment_label, summary)
         VALUES (?, ?, ?, ?, ?)`,
        [newsId, code, s.tone, label, s.title.slice(0, 40)]
      );
    }
  }
}

async function seedSimAccount(userId: number) {
  await query(
    `INSERT INTO sim_accounts (user_id, cash_balance, initial_cash)
     VALUES (?, 1000000, 1000000)
     ON DUPLICATE KEY UPDATE cash_balance = cash_balance`,
    [userId]
  );
}

async function main() {
  console.log('🌱 智投研 seed 开始...');
  const userId = await upsertUser();
  console.log('✓ demo 用户 (demo / demo123456)');
  await seedIndustry();
  console.log('✓ 行业映射');
  await seedWatchlist(userId);
  console.log('✓ 自选股');
  await seedHistory();
  console.log('✓ 历史行情');
  const codes = DEMO_STOCKS.map((s) => s.code);
  await seedSentiment(codes);
  console.log('✓ 情绪序列');
  await seedNews(codes);
  console.log('✓ 演示新闻');
  await seedSimAccount(userId);
  console.log('✓ 模拟账户');
  console.log('✅ seed 完成');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ seed 失败:', err);
  process.exit(1);
});
