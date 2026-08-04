import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { config } from '../config';
import { query } from '../config/database';
import { toDateStr } from '../utils/date';

export { toDateStr };

export interface SentimentResult {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
  summary: string;
}

function getLLM(): ChatOpenAI | null {
  if (!config.openai.apiKey) return null;
  const model = config.openai.model;
  const isThinkingFamily = /qwen3/i.test(model) && !/instruct/i.test(model);
  return new ChatOpenAI({
    openAIApiKey: config.openai.apiKey,
    configuration: { baseURL: config.openai.baseURL },
    modelName: model,
    temperature: 0.3,
    maxTokens: 800,
    timeout: config.openai.timeoutMs,
    ...(isThinkingFamily ? { modelKwargs: { enable_thinking: false } } : {}),
  });
}

const sentimentPrompt = PromptTemplate.fromTemplate(`
你是一位专业的金融舆情分析师。请分析以下财经新闻，针对股票 {stockCode} 进行情感分析。

新闻标题：{title}
新闻内容：{content}

请严格按以下 JSON 格式输出（不要输出其他内容）：
{{
  "score": <-1到1之间的小数，-1极度负面，1极度正面>,
  "label": "<positive|negative|neutral>",
  "summary": "<50字以内的中文摘要>"
}}
`);

/** 单条新闻情感分析 */
export async function analyzeNewsSentiment(
  title: string,
  content: string,
  stockCode: string
): Promise<SentimentResult> {
  const llm = getLLM();
  if (!llm) {
    return mockSentiment(title);
  }

  try {
    const chain = sentimentPrompt.pipe(llm).pipe(new StringOutputParser());
    const raw = await chain.invoke({
      title,
      content: content.slice(0, 2000),
      stockCode,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as SentimentResult;
      return {
        score: Math.max(-1, Math.min(1, parsed.score)),
        label: parsed.label,
        summary: parsed.summary,
      };
    }
  } catch (err) {
    console.error('LLM sentiment analysis failed:', err);
  }
  return mockSentiment(title);
}

export function mockSentiment(title: string): SentimentResult {
  const keywords = {
    positive: ['增长', '盈利', '突破', '利好', '上涨', '回购', '分红'],
    negative: ['下跌', '亏损', '风险', '调查', '减持', '暴雷', '违规'],
  };
  let score = 0;
  for (const w of keywords.positive) if (title.includes(w)) score += 0.3;
  for (const w of keywords.negative) if (title.includes(w)) score -= 0.3;
  score = Math.max(-1, Math.min(1, score));

  const label =
    score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

  return {
    score,
    label,
    summary: title.slice(0, 50),
  };
}

/** 批量分析未处理新闻 */
export async function batchAnalyzeNews(limit = 20): Promise<number> {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  // mysql2 execute 对 LIMIT ? 在部分版本会 ER_WRONG_ARGUMENTS，故内联安全整数
  const newsList = await query<
    { id: number; title: string; content: string; related_stocks: string | string[] | null }[]
  >(
    `SELECT n.id, n.title, n.content, n.related_stocks
     FROM news n
     LEFT JOIN news_sentiment ns ON n.id = ns.news_id
     WHERE ns.id IS NULL
     LIMIT ${safeLimit}`
  );

  let count = 0;
  for (const news of newsList) {
    let stocks: string[] = [];
    if (Array.isArray(news.related_stocks)) {
      stocks = news.related_stocks.map(String);
    } else if (typeof news.related_stocks === 'string') {
      try {
        const parsed = JSON.parse(news.related_stocks || '[]');
        stocks = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        stocks = [];
      }
    }
    if (stocks.length === 0) stocks = ['000001'];

    for (const code of stocks) {
      // 批量路径用关键词情绪，避免启动/登录时对几十条新闻逐条打 LLM（过慢且易失败）
      const result = mockSentiment(news.title);
      await query(
        `INSERT INTO news_sentiment (news_id, stock_code, sentiment_score, sentiment_label, summary)
         VALUES (?, ?, ?, ?, ?)`,
        [news.id, code, result.score, result.label, result.summary]
      );
      count++;
    }
  }

  if (count > 0) {
    await aggregateDailySentiment();
  }
  return count;
}

/** 按股票、日期聚合情绪 */
export async function aggregateDailySentiment(): Promise<void> {
  await query(`
    INSERT INTO daily_sentiment (stock_code, trade_date, avg_score, news_count, positive_count, negative_count, neutral_count)
    SELECT
      stock_code,
      DATE(analyzed_at) as trade_date,
      AVG(sentiment_score) as avg_score,
      COUNT(*) as news_count,
      SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END),
      SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END),
      SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END)
    FROM news_sentiment
    WHERE analyzed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY stock_code, DATE(analyzed_at)
    ON DUPLICATE KEY UPDATE
      avg_score = VALUES(avg_score),
      news_count = VALUES(news_count),
      positive_count = VALUES(positive_count),
      negative_count = VALUES(negative_count),
      neutral_count = VALUES(neutral_count)
  `);

  await query(`
    INSERT INTO market_sentiment (trade_date, avg_score, news_count)
    SELECT DATE(analyzed_at), AVG(sentiment_score), COUNT(*)
    FROM news_sentiment
    WHERE analyzed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY DATE(analyzed_at)
    ON DUPLICATE KEY UPDATE avg_score = VALUES(avg_score), news_count = VALUES(news_count)
  `);
}

/** 获取股票情绪历史 */
export async function getStockSentimentHistory(
  stockCode: string,
  days = 30
): Promise<{ date: string; score: number }[]> {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const rows = await query<{ trade_date: string | Date; avg_score: number }[]>(
    `SELECT trade_date, avg_score FROM daily_sentiment
     WHERE stock_code = ? AND trade_date >= DATE_SUB(CURDATE(), INTERVAL ${safeDays} DAY)
     ORDER BY trade_date ASC`,
    [stockCode]
  );

  if (rows.length > 0) {
    return rows.map((r) => ({
      date: toDateStr(r.trade_date),
      score: Number(r.avg_score),
    }));
  }

  // 确定性演示序列（非随机，便于回测复现）
  const result: { date: string; score: number }[] = [];
  const now = new Date();
  const seed = parseInt(stockCode.replace(/\D/g, '').slice(-3) || '1', 10);
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const score =
      Math.round((Math.sin((i + seed) / 9) * 0.55 + Math.cos(i / 15) * 0.2) * 100) / 100;
    result.push({ date: toDateStr(d), score });
  }
  return result;
}

/** 获取市场情绪指数 */
export async function getMarketSentiment(days = 14): Promise<
  { date: string; score: number }[]
> {
  const safeDays = Math.min(Math.max(Number(days) || 14, 1), 365);
  const rows = await query<{ trade_date: string | Date; avg_score: number }[]>(
    `SELECT trade_date, avg_score FROM market_sentiment
     WHERE trade_date >= DATE_SUB(CURDATE(), INTERVAL ${safeDays} DAY)
     ORDER BY trade_date ASC`
  );

  if (rows.length > 0) {
    return rows.map((r) => ({
      date: toDateStr(r.trade_date),
      score: Number(r.avg_score),
    }));
  }

  // 演示序列：相位偏移，避免「今天」刚好 sin(0)=0
  const result: { date: string; score: number }[] = [];
  const now = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const score =
      Math.round((Math.sin((i + 3) / 7) * 0.35 + Math.cos(i / 11) * 0.12) * 100) / 100;
    result.push({ date: toDateStr(d), score });
  }
  return result;
}

/** 获取情绪标签 */
export function scoreToLabel(score: number): string {
  if (score >= 0.5) return '乐观';
  if (score >= 0.2) return '偏乐观';
  if (score >= -0.2) return '中性';
  if (score >= -0.5) return '谨慎';
  return '悲观';
}

/** AI 综合分析报告 */
export async function generateAnalysisReport(params: {
  stockCode: string;
  stockName: string;
  quote: Record<string, unknown>;
  sentimentHistory: { date: string; score: number }[];
  kline: { date: string; close: number }[];
}): Promise<string> {
  const llm = getLLM();
  const { stockCode, stockName, quote, sentimentHistory, kline } = params;

  const avgSentiment =
    sentimentHistory.length > 0
      ? sentimentHistory.reduce((s, x) => s + x.score, 0) / sentimentHistory.length
      : 0;

  const recentPrices = kline.slice(-5).map((k) => k.close);
  const priceTrend =
    recentPrices.length >= 2
      ? recentPrices[recentPrices.length - 1] > recentPrices[0]
        ? '上涨'
        : '下跌'
      : '震荡';

  if (!llm) {
    return `【${stockName}(${stockCode}) AI 分析报告】

一、行情概况
当前价格 ${quote.price} 元，涨跌幅 ${quote.changePercent}%。近期价格呈${priceTrend}态势。

二、舆情分析
近30日平均情绪指数 ${avgSentiment.toFixed(2)}，市场情绪${scoreToLabel(avgSentiment)}。舆情与股价联动需持续关注。

三、投资建议
建议结合自身风险偏好，关注公司基本面变化及行业政策动向。本报告仅供参考，不构成投资建议。`;
  }

  const reportPrompt = PromptTemplate.fromTemplate(`
你是一位资深量化研究员兼投资秘书，请为个人投资者撰写一份结构化分析报告（300-500字）。

股票：{stockName}（{stockCode}）
当前价格：{price}，涨跌幅：{changePercent}%
近5日价格趋势：{priceTrend}
近30日平均情绪指数：{avgSentiment}（-1到1，越高越乐观）

请包含：1.行情解读 2.舆情分析 3.风险提示 4.操作建议
语气专业但易懂，结尾注明"本报告仅供参考，不构成投资建议"。
`);

  try {
    const chain = reportPrompt.pipe(llm).pipe(new StringOutputParser());
    return await chain.invoke({
      stockName,
      stockCode,
      price: quote.price,
      changePercent: quote.changePercent,
      priceTrend,
      avgSentiment: avgSentiment.toFixed(2),
    });
  } catch {
    return `【${stockName}】分析服务暂时不可用，请稍后重试。`;
  }
}

/** 回测结果 AI 总结 */
export async function generateBacktestSummary(params: {
  stockCode: string;
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  strategy: string;
  sharpeRatio?: number;
  excessReturn?: number;
}): Promise<string> {
  const llm = getLLM();
  if (!llm) {
    return `策略回测完成：总收益率 ${(params.totalReturn * 100).toFixed(2)}%，超额 ${(
      (params.excessReturn || 0) * 100
    ).toFixed(2)}%，最大回撤 ${(params.maxDrawdown * 100).toFixed(2)}%，夏普 ${params.sharpeRatio ?? '-'
      }，胜率 ${(params.winRate * 100).toFixed(1)}%。优点是规则清晰可解释；建议加入止损/仓位管理并延长样本外验证。`;
  }

  const prompt = PromptTemplate.fromTemplate(`
作为量化策略顾问，请对以下回测结果进行点评（200字以内）：

股票：{stockCode}
策略规则：{strategy}
总收益率：{totalReturn}%
超额收益：{excessReturn}%
最大回撤：{maxDrawdown}%
夏普比率：{sharpeRatio}
胜率：{winRate}%
交易次数：{tradeCount}

请指出策略优缺点并给出1-2条改进建议。勿承诺未来收益。
请使用纯中文段落输出，不要使用 Markdown（不要用 **、*、#、- 列表符号）。
`);

  try {
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    return await chain.invoke({
      stockCode: params.stockCode,
      strategy: params.strategy,
      totalReturn: (params.totalReturn * 100).toFixed(2),
      excessReturn: ((params.excessReturn || 0) * 100).toFixed(2),
      maxDrawdown: (params.maxDrawdown * 100).toFixed(2),
      sharpeRatio: String(params.sharpeRatio ?? '-'),
      winRate: (params.winRate * 100).toFixed(1),
      tradeCount: params.tradeCount,
    });
  } catch {
    return 'AI 总结生成失败';
  }
}

/** AI 写作助手 */
export async function aiWritingAssist(
  action: 'continue' | 'polish' | 'risk',
  text: string,
  stockCode?: string
): Promise<string> {
  const llm = getLLM();
  if (!llm) {
    const map = {
      continue: `${text}\n\n[续写] 基于当前市场环境和情绪数据，建议持续关注该股后续走势...`,
      polish: text.replace(/。/g, '，').slice(0, 100) + '。（已润色）',
      risk: `⚠️ 风险提示：投资有风险，${stockCode || '该股票'} 的笔记内容仅供参考，请独立判断。`,
    };
    return map[action];
  }

  const prompts = {
    continue: `请续写以下投资笔记（100字以内，保持专业风格）：\n${text}`,
    polish: `请润色以下投资笔记，使其更专业流畅：\n${text}`,
    risk: `针对以下关于${stockCode}的投资笔记，添加一段风险提示（50字以内）：\n${text}`,
  };

  try {
    const res = await llm.invoke(prompts[action]);
    return typeof res.content === 'string' ? res.content : String(res.content);
  } catch {
    return 'AI 助手暂时不可用';
  }
}

