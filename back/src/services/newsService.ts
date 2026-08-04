import axios from 'axios';
import { query } from '../config/database';
import { toLocalDateTimeStr } from '../utils/date';
import type { NewsItem } from '@shared/types/dashboard';

export type { NewsItem };

export type NewsFeedResult = {
  items: NewsItem[];
  source: 'database' | 'eastmoney' | 'mock';
  /** 最新一条是否超过 6 小时 */
  stale: boolean;
  /** 最新一条距今多少小时（无数据为 null） */
  freshnessHours: number | null;
  /** 给前端展示的提示文案 */
  message?: string;
};

/** 仪表盘新闻流：库兜底只取近 24 小时 */
const NEWS_FEED_MAX_AGE_HOURS = 24;
/** 超过该时长视为偏旧，提示用户刷新 */
const NEWS_STALE_HOURS = 6;

/** 东财 stockList 可能是 "150.159813" / {code}；尽量抽出 6 位代码 */
function normalizeRelatedStocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'code' in item) {
      const code = String((item as { code: string }).code || '')
        .replace(/^(sh|sz)/i, '')
        .trim();
      if (/^\d{6}$/.test(code)) out.push(code);
      continue;
    }
    const s = String(item || '');
    const m = s.match(/(?:^|[.])(\d{6})$/);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** 模拟/抓取财经新闻（东财 7x24 现需 sortEnd + req_trace） */
export async function fetchFinanceNews(): Promise<{ items: NewsItem[]; source: 'eastmoney' | 'mock' }> {
  try {
    const reqTrace = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const res = await axios.get(
      'https://np-listapi.eastmoney.com/comm/web/getFastNewsList',
      {
        params: {
          client: 'web',
          biz: 'web_724',
          fastColumn: '102',
          pageSize: 30,
          pageNo: 1,
          // 接口升级后这两个为必填；sortEnd=0 表示拉取最新一页
          sortEnd: '0',
          req_trace: reqTrace,
        },
        timeout: 8000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://finance.eastmoney.com/',
          Accept: 'application/json, text/plain, */*',
        },
      }
    );

    const payload = res.data;
    const list = payload?.data?.fastNewsList || [];
    if (list.length > 0) {
      return {
        source: 'eastmoney',
        items: list.map(
          (item: {
            title: string;
            summary?: string;
            url?: string;
            code?: string;
            showTime: string;
            stockList?: unknown;
            codeList?: { code: string }[];
          }) => ({
            title: item.title,
            content: item.summary || item.title,
            source: '东方财富',
            url:
              item.url ||
              (item.code
                ? `https://finance.eastmoney.com/a/${item.code}.html`
                : ''),
            relatedStocks: normalizeRelatedStocks(item.stockList ?? item.codeList),
            publishedAt: item.showTime,
          })
        ),
      };
    }
    console.warn(
      '[news] eastmoney empty:',
      payload?.message || payload?.code || 'no fastNewsList'
    );
  } catch (err) {
    console.warn('[news] eastmoney fetch failed:', err instanceof Error ? err.message : err);
  }

  return { items: getMockNews(), source: 'mock' };
}

function getMockNews(): NewsItem[] {
  const day = new Date().toLocaleDateString('zh-CN');
  const templates = [
    { title: `【${day}】A股三大指数分化，科技与红利风格博弈`, stocks: ['000001', '600519'] },
    { title: `【${day}】央行公开市场操作，资金面情绪观察`, stocks: ['000001', '601318'] },
    { title: `【${day}】新能源车销量数据公布，产业链波动`, stocks: ['300750', '002594'] },
    { title: `【${day}】半导体设备与材料景气度跟踪`, stocks: ['688981', '002371'] },
    { title: `【${day}】消费龙头业绩预期修正，白酒板块受关注`, stocks: ['600519', '000858'] },
    { title: `【${day}】银行净息差与资产质量仍是焦点`, stocks: ['600036', '000001'] },
    { title: `【${day}】医药集采与创新药管线进展`, stocks: ['600276', '300760'] },
    { title: `【${day}】人工智能应用落地加速，算力标的活跃`, stocks: ['002230', '300059'] },
  ];

  const now = new Date();
  return templates.map((t, i) => {
    const d = new Date(now);
    d.setHours(d.getHours() - i);
    return {
      title: t.title,
      content: `${t.title}。市场分析人士认为，这一事件将对相关板块产生显著影响，投资者需密切关注后续发展。`,
      source: '示例快讯',
      url: '#',
      relatedStocks: t.stocks,
      publishedAt: toLocalDateTimeStr(d),
    };
  });
}

function parseRelatedStocks(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapNewsRows(
  rows: {
    id: number;
    title: string;
    content: string;
    source: string;
    url: string;
    related_stocks: string | string[];
    published_at: string | Date;
    sentiment_score: number | null;
    sentiment_label: string | null;
    sentiment_summary: string | null;
  }[]
): NewsItem[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    source: r.source,
    url: r.url,
    relatedStocks: parseRelatedStocks(r.related_stocks),
    publishedAt: toLocalDateTimeStr(r.published_at),
    // 注意：score 为 0 时也是有效情绪，不能用 truthy 判断
    sentiment:
      r.sentiment_score != null
        ? {
            score: Number(r.sentiment_score),
            label: r.sentiment_label || 'neutral',
            summary: r.sentiment_summary || '',
          }
        : undefined,
  }));
}

/** 保存新闻到数据库 */
export async function saveNewsToDb(newsList: NewsItem[]): Promise<number> {
  let count = 0;
  for (const news of newsList) {
    const existing = await query<{ id: number }[]>(
      'SELECT id FROM news WHERE title = ? LIMIT 1',
      [news.title]
    );
    if (existing.length > 0) continue;

    await query(
      `INSERT INTO news (title, content, source, url, related_stocks, published_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        news.title,
        news.content,
        news.source,
        news.url || '',
        JSON.stringify(news.relatedStocks || []),
        news.publishedAt || toLocalDateTimeStr(new Date()),
      ]
    );
    count++;
  }
  return count;
}

async function queryNewsFromDb(
  stockCodes?: string[],
  limit = 20,
  maxAgeHours = NEWS_FEED_MAX_AGE_HOURS
): Promise<NewsItem[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeHours = Math.min(Math.max(Number(maxAgeHours) || 24, 1), 168);
  // 每条新闻只取一条情绪（避免一对多 JOIN 重复）
  let sql = `
    SELECT n.id, n.title, n.content, n.source, n.url, n.related_stocks, n.published_at,
           ns.sentiment_score, ns.sentiment_label, ns.summary as sentiment_summary
    FROM news n
    LEFT JOIN news_sentiment ns ON ns.id = (
      SELECT ns2.id FROM news_sentiment ns2
      WHERE ns2.news_id = n.id
      ORDER BY ns2.id DESC
      LIMIT 1
    )
    WHERE n.published_at >= DATE_SUB(NOW(), INTERVAL ${safeHours} HOUR)
  `;
  const params: (string | number | boolean | null | Date)[] = [];

  if (stockCodes && stockCodes.length > 0) {
    const conditions = stockCodes.map(() => 'JSON_CONTAINS(n.related_stocks, ?)').join(' OR ');
    sql += ` AND (${conditions})`;
    stockCodes.forEach((c) => params.push(JSON.stringify(c)));
  }

  sql += ` ORDER BY n.published_at DESC LIMIT ${safeLimit}`;

  const rows = await query<
    {
      id: number;
      title: string;
      content: string;
      source: string;
      url: string;
      related_stocks: string | string[];
      published_at: string | Date;
      sentiment_score: number | null;
      sentiment_label: string | null;
      sentiment_summary: string | null;
    }[]
  >(sql, params);

  return mapNewsRows(rows);
}

function getFreshnessHours(items: NewsItem[]): number | null {
  if (!items.length) return null;
  const latest = items[0]?.publishedAt;
  if (!latest) return null;
  const t = new Date(latest).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3600_000);
}

function isNewsStale(items: NewsItem[]): boolean {
  const hours = getFreshnessHours(items);
  if (hours == null) return true;
  return hours > NEWS_STALE_HOURS;
}

function withFreshness(
  base: Omit<NewsFeedResult, 'stale' | 'freshnessHours'>
): NewsFeedResult {
  const freshnessHours = getFreshnessHours(base.items);
  const stale = isNewsStale(base.items);
  return { ...base, stale, freshnessHours };
}

/** 获取带情感分析的新闻流（优先新鲜外部源，再近 24h 库，再 mock） */
export async function getNewsFeed(
  stockCodes?: string[],
  limit = 20
): Promise<NewsFeedResult> {
  let remoteFailed = false;

  // 1) 尝试拉外部快讯并入库
  try {
    const remote = await fetchFinanceNews();
    if (remote.source === 'eastmoney' && remote.items.length > 0) {
      await saveNewsToDb(remote.items);
      const { mockSentiment } = await import('./sentimentService');
      return withFreshness({
        source: 'eastmoney',
        items: remote.items.slice(0, limit).map((n) => ({
          ...n,
          sentiment: n.sentiment || mockSentiment(n.title),
        })),
      });
    }
    remoteFailed = true;
  } catch {
    remoteFailed = true;
  }

  // 2) 数据库（仅近 24 小时）
  try {
    let items = await queryNewsFromDb(stockCodes, limit, NEWS_FEED_MAX_AGE_HOURS);
    if (items.length === 0 && stockCodes && stockCodes.length > 0) {
      items = await queryNewsFromDb(undefined, limit, NEWS_FEED_MAX_AGE_HOURS);
    }
    if (items.length > 0) {
      const stale = isNewsStale(items);
      const hours = getFreshnessHours(items);
      const hoursText =
        hours == null ? '' : hours < 1 ? '不足 1 小时' : `约 ${hours.toFixed(1)} 小时`;
      let message = remoteFailed
        ? '外部快讯暂时不可用，已回退到近 24 小时内的数据库缓存。可点击顶部「更新舆情」重试。'
        : '当前展示近 24 小时内的数据库缓存。';
      if (stale) {
        message = `新闻偏旧（最新一条已过 ${hoursText || `${NEWS_STALE_HOURS} 小时`}）。外部快讯可能不可用，请点击顶部「更新舆情」刷新。`;
      }
      return withFreshness({ items, source: 'database', message });
    }
  } catch {
    /* DB not ready */
  }

  // 3) mock
  const mock = getMockNews();
  const { mockSentiment } = await import('./sentimentService');
  return withFreshness({
    source: 'mock',
    message:
      '外部快讯不可用，且近 24 小时内库中无新闻，当前为本地样例数据。可点击顶部「更新舆情」尝试刷新。',
    items: mock.slice(0, limit).map((n) => ({
      ...n,
      sentiment: mockSentiment(n.title),
    })),
  });
}
