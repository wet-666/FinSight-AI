import axios from 'axios';
import { query } from '../config/database';
import type { NewsItem } from '@shared/types/dashboard';

export type { NewsItem };

/** 模拟/抓取财经新闻 */
export async function fetchFinanceNews(): Promise<NewsItem[]> {
  // 尝试从东方财富获取快讯（公开接口）
  try {
    const res = await axios.get(
      'https://np-listapi.eastmoney.com/comm/web/getFastNewsList',
      {
        params: {
          client: 'web',
          biz: 'web_724',
          fastColumn: '102',
          pageSize: 20,
        },
        timeout: 8000,
      }
    );

    const list = res.data?.data?.fastNewsList || [];
    if (list.length > 0) {
      return list.map(
        (item: {
          title: string;
          summary: string;
          url: string;
          showTime: string;
          codeList?: { code: string }[];
        }) => ({
          title: item.title,
          content: item.summary || item.title,
          source: '东方财富',
          url: item.url || '',
          relatedStocks: (item.codeList || []).map((c) =>
            c.code.replace(/^(sh|sz)/i, '')
          ),
          publishedAt: item.showTime,
        })
      );
    }
  } catch {
    // fallback to mock
  }

  return getMockNews();
}

function getMockNews(): NewsItem[] {
  const templates = [
    { title: 'A股三大指数集体收涨，科技板块领涨', stocks: ['000001', '600519'] },
    { title: '央行释放流动性信号，市场情绪回暖', stocks: ['000001'] },
    { title: '某龙头房企债务重组方案获通过', stocks: ['000002'] },
    { title: '新能源汽车销量创新高，产业链受益', stocks: ['300750', '002594'] },
    { title: '半导体行业迎来政策利好', stocks: ['688981', '002371'] },
    { title: '消费复苏不及预期，零售板块承压', stocks: ['600519', '000858'] },
    { title: '医药集采新规发布，行业格局生变', stocks: ['600276', '000661'] },
    { title: '人工智能概念持续活跃', stocks: ['002230', '300496'] },
  ];

  const now = new Date();
  return templates.map((t, i) => {
    const d = new Date(now);
    d.setHours(d.getHours() - i);
    return {
      title: t.title,
      content: `${t.title}。市场分析人士认为，这一事件将对相关板块产生显著影响，投资者需密切关注后续发展。`,
      source: '财经快讯',
      url: '#',
      relatedStocks: t.stocks,
      publishedAt: d.toISOString(),
    };
  });
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
        news.publishedAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
      ]
    );
    count++;
  }
  return count;
}

/** 获取带情感分析的新闻流 */
export async function getNewsFeed(
  stockCodes?: string[],
  limit = 20
): Promise<NewsItem[]> {
  let sql = `
    SELECT n.id, n.title, n.content, n.source, n.url, n.related_stocks, n.published_at,
           ns.sentiment_score, ns.sentiment_label, ns.summary as sentiment_summary
    FROM news n
    LEFT JOIN news_sentiment ns ON n.id = ns.news_id
  `;
  const params: (string | number | boolean | null | Date)[] = [];

  if (stockCodes && stockCodes.length > 0) {
    const conditions = stockCodes.map(() => 'JSON_CONTAINS(n.related_stocks, ?)').join(' OR ');
    sql += ` WHERE (${conditions})`;
    stockCodes.forEach((c) => params.push(JSON.stringify(c)));
  }

  sql += ' ORDER BY n.published_at DESC LIMIT ?';
  params.push(limit);

  try {
    const rows = await query<
      {
        id: number;
        title: string;
        content: string;
        source: string;
        url: string;
        related_stocks: string;
        published_at: string;
        sentiment_score: number | null;
        sentiment_label: string | null;
        sentiment_summary: string | null;
      }[]
    >(sql, params);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        source: r.source,
        url: r.url,
        relatedStocks: JSON.parse(r.related_stocks || '[]'),
        publishedAt: r.published_at,
        sentiment: r.sentiment_score
          ? {
              score: Number(r.sentiment_score),
              label: r.sentiment_label || 'neutral',
              summary: r.sentiment_summary || '',
            }
          : undefined,
      }));
    }
  } catch {
    // DB not ready
  }

  const mock = getMockNews();
  const { mockSentiment } = await import('./sentimentService');
  return mock.slice(0, limit).map((n) => ({
    ...n,
    sentiment: mockSentiment(n.title),
  }));
}
