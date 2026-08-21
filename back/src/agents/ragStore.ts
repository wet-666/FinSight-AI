import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { config } from '../config';
import { query } from '../config/database';
import type { Citation, RetrievalMode } from './types';

export interface NewsDoc {
  id: string;
  title: string;
  summary: string;
  sentimentScore: number;
  source: 'news' | 'demo';
}

export interface RetrieveResult {
  citations: Citation[];
  newsItems: { id: string; title: string; summary: string; score: number }[];
  mode: RetrievalMode;
}

function demoCorpus(stockCode: string): NewsDoc[] {
  return [
    {
      id: 'demo-1',
      title: `${stockCode} 行业政策与市场关注度升温`,
      summary: '样例资讯：情绪偏正面（数据库暂无该股新闻）。政策预期与资金关注度有所上升。',
      sentimentScore: 0.35,
      source: 'demo',
    },
    {
      id: 'demo-2',
      title: `${stockCode} 短期波动引发讨论`,
      summary: '样例资讯：情绪中性偏谨慎。短线波动加大，市场对估值与业绩兑现节奏存在分歧。',
      sentimentScore: -0.1,
      source: 'demo',
    },
    {
      id: 'demo-3',
      title: `${stockCode} 机构观点与交易情绪观察`,
      summary: '样例资讯：关注量能变化与消息面催化，建议把结论当作模拟研究材料而非投资建议。',
      sentimentScore: 0.05,
      source: 'demo',
    },
  ];
}

/** 拉取候选语料（比最终 TopK 更大，交给检索排序） */
export async function loadNewsCorpus(stockCode: string): Promise<NewsDoc[]> {
  try {
    const rows = await query<
      { id: number; title: string; summary: string; sentiment_score: number }[]
    >(
      `SELECT n.id, n.title, ns.summary, ns.sentiment_score
       FROM news_sentiment ns
       JOIN news n ON n.id = ns.news_id
       WHERE ns.stock_code = ?
       ORDER BY ns.analyzed_at DESC
       LIMIT 40`,
      [stockCode]
    );
    if (rows.length) {
      return rows.map((r) => ({
        id: `news-${r.id}`,
        title: r.title,
        summary: r.summary || r.title.slice(0, 80),
        sentimentScore: Number(r.sentiment_score),
        source: 'news' as const,
      }));
    }
  } catch {
    /* fallthrough */
  }
  return demoCorpus(stockCode);
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const cjk = lower.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const words = lower.match(/[a-z0-9]{2,}/g) || [];
  return [...cjk, ...words];
}

function keywordScore(queryText: string, doc: NewsDoc): number {
  const qTokens = tokenize(queryText);
  const hay = `${doc.title} ${doc.summary}`.toLowerCase();
  if (!qTokens.length) return 0.1;
  let hits = 0;
  for (const t of qTokens) {
    if (hay.includes(t)) hits += 1;
  }
  const overlap = hits / qTokens.length;
  // 轻度偏好更长摘要，避免空标题占优
  return Math.round((overlap * 0.85 + Math.min(doc.summary.length, 80) / 400) * 1000) / 1000;
}

function toCitation(doc: NewsDoc, score: number): Citation {
  return {
    id: doc.id,
    title: doc.title,
    snippet: doc.summary.slice(0, 120),
    score: Math.round(score * 1000) / 1000,
    source: doc.source,
  };
}

export function keywordRetrieve(docs: NewsDoc[], queryText: string, topK: number): RetrieveResult {
  const ranked = docs
    .map((d) => ({ doc: d, score: keywordScore(queryText, d) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // 全零时仍返回前几条，保证无外网数据时仍可跑通
  const picked =
    ranked.some((r) => r.score > 0)
      ? ranked
      : docs.slice(0, topK).map((d, i) => ({ doc: d, score: 0.2 - i * 0.02 }));

  return {
    mode: 'keyword',
    citations: picked.map((p) => toCitation(p.doc, Math.max(p.score, 0.05))),
    newsItems: picked.map((p) => ({
      id: p.doc.id,
      title: p.doc.title,
      summary: p.doc.summary,
      score: p.doc.sentimentScore,
    })),
  };
}

function getEmbeddings(): OpenAIEmbeddings | null {
  if (!config.openai.apiKey) return null;
  return new OpenAIEmbeddings({
    openAIApiKey: config.openai.apiKey,
    configuration: { baseURL: config.openai.baseURL },
    modelName: config.openai.embeddingModel,
    timeout: config.openai.timeoutMs,
  });
}

async function embeddingRetrieve(
  docs: NewsDoc[],
  queryText: string,
  topK: number
): Promise<RetrieveResult | null> {
  const embeddings = getEmbeddings();
  if (!embeddings || !docs.length) return null;

  try {
    const documents = docs.map(
      (d) =>
        new Document({
          pageContent: `${d.title}\n${d.summary}`,
          metadata: {
            id: d.id,
            title: d.title,
            summary: d.summary,
            sentimentScore: d.sentimentScore,
            source: d.source,
          },
        })
    );
    const store = await MemoryVectorStore.fromDocuments(documents, embeddings);
    const pairs = await store.similaritySearchWithScore(queryText, topK);
    if (!pairs.length) return null;

    const citations: Citation[] = [];
    const newsItems: RetrieveResult['newsItems'] = [];
    for (const [doc, distance] of pairs) {
      const id = String(doc.metadata.id || '');
      const sourceDoc = docs.find((d) => d.id === id);
      // LangChain 距离越小越相似；转成 0~1 近似相关度便于前端展示
      const similarity = Math.max(0, Math.min(1, 1 / (1 + Number(distance))));
      const citation = toCitation(
        sourceDoc || {
          id,
          title: String(doc.metadata.title || '未命名'),
          summary: String(doc.metadata.summary || doc.pageContent.slice(0, 120)),
          sentimentScore: Number(doc.metadata.sentimentScore || 0),
          source: (doc.metadata.source as 'news' | 'demo') || 'news',
        },
        similarity
      );
      citations.push(citation);
      newsItems.push({
        id: citation.id,
        title: citation.title,
        summary: String(doc.metadata.summary || citation.snippet),
        score: Number(doc.metadata.sentimentScore || 0),
      });
    }

    return { mode: 'embedding', citations, newsItems };
  } catch (err) {
    console.warn('[RAG] embedding retrieve failed, fallback to keyword:', err);
    return null;
  }
}

/**
 * 轻量 RAG：优先 embedding + MemoryVectorStore，失败/无 Key 则关键词重叠打分。
 */
export async function retrieveNewsContext(
  stockCode: string,
  queryText: string,
  topK = 5
): Promise<RetrieveResult> {
  const corpus = await loadNewsCorpus(stockCode);
  const embedded = await embeddingRetrieve(corpus, queryText, topK);
  if (embedded) return embedded;
  return keywordRetrieve(corpus, queryText, topK);
}
