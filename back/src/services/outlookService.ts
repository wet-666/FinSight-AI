import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';
import { query } from '../config/database';
import { getStockQuote } from './marketService';
import { getStockSentimentHistory, scoreToLabel } from './sentimentService';
import type { OutlookScenario } from '@shared/types/trading';

export type { OutlookScenario };

export const LEGAL_DISCLAIMER =
  '【重要声明】本功能为教育性质的模拟情景分析，基于历史数据与AI模型生成，不构成证券投资咨询或买卖建议。市场有风险，模拟结果不代表未来真实收益。';

export interface OutlookResult {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  horizonDays: number;
  scenarios: OutlookScenario[];
  summary: string;
  disclaimer: string;
  generatedAt: string;
}

function getLLM(): ChatOpenAI | null {
  if (!config.openai.apiKey) return null;
  return new ChatOpenAI({
    openAIApiKey: config.openai.apiKey,
    configuration: { baseURL: config.openai.baseURL },
    modelName: config.openai.model,
    temperature: 0.4,
  });
}

function mockOutlook(params: {
  stockCode: string;
  stockName: string;
  price: number;
  horizonDays: number;
  avgSentiment: number;
}): OutlookResult {
  const { stockCode, stockName, price, horizonDays, avgSentiment } = params;
  const mood = avgSentiment > 0.2 ? '偏乐观' : avgSentiment < -0.2 ? '偏谨慎' : '中性';

  return {
    stockCode,
    stockName,
    currentPrice: price,
    horizonDays,
    scenarios: [
      {
        label: '悲观情景',
        probability: '25%',
        returnRange: '-8% ~ -3%',
        description: `若市场情绪转弱或行业利空，${horizonDays}日内可能出现3-8%的回撤。`,
      },
      {
        label: '基准情景',
        probability: '50%',
        returnRange: '-2% ~ +5%',
        description: `结合当前${mood}舆情，${horizonDays}日内更可能在小幅震荡中运行。`,
      },
      {
        label: '乐观情景',
        probability: '25%',
        returnRange: '+3% ~ +12%',
        description: `若利好兑现且情绪持续改善，${horizonDays}日内存在上行空间。`,
      },
    ],
    summary: `${stockName}当前价格${price}元，近30日舆情${scoreToLabel(avgSentiment)}。以上为${horizonDays}日情景展望，仅供学习体验，请勿作为实盘依据。`,
    disclaimer: LEGAL_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateOutlook(
  userId: number,
  stockCode: string,
  stockName: string,
  horizonDays: number
): Promise<OutlookResult> {
  const quote = await getStockQuote(stockCode);
  const price = quote?.price ?? 10;
  const name = stockName || quote?.name || stockCode;
  const sentiment = await getStockSentimentHistory(stockCode, 30);
  const avgSentiment =
    sentiment.length > 0
      ? sentiment.reduce((s, x) => s + x.score, 0) / sentiment.length
      : 0;

  const llm = getLLM();
  let result: OutlookResult;

  if (!llm) {
    result = mockOutlook({ stockCode, stockName: name, price, horizonDays, avgSentiment });
  } else {
    const prompt = PromptTemplate.fromTemplate(`
你是金融教育助手，请为「模拟投资体验」同学生成{horizonDays}日情景展望（非确定性预测）。

股票：{stockName}（{stockCode}） 现价：{price}
近30日平均情绪：{avgSentiment}（-1到1）

要求：
1. 输出JSON，含 scenarios 数组3项（悲观/基准/乐观），每项含 label, probability, returnRange, description
2. 含 summary 字段（100字内，强调不确定性）
3. 不得使用"保证""一定涨"等措辞
4. description/summary 使用纯中文，不要 Markdown（不要 **、*、#）
5. 仅输出JSON

格式：
{{"scenarios":[...],"summary":"..."}}
`);

    try {
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const raw = await chain.invoke({
        stockName: name,
        stockCode,
        price,
        horizonDays,
        avgSentiment: avgSentiment.toFixed(2),
      });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      result = {
        stockCode,
        stockName: name,
        currentPrice: price,
        horizonDays,
        scenarios: parsed?.scenarios ?? mockOutlook({ stockCode, stockName: name, price, horizonDays, avgSentiment }).scenarios,
        summary: parsed?.summary ?? '',
        disclaimer: LEGAL_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      result = mockOutlook({ stockCode, stockName: name, price, horizonDays, avgSentiment });
    }
  }

  try {
    await query(
      `INSERT INTO ai_outlook_records (user_id, stock_code, horizon_days, outlook, disclaimer)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, stockCode, horizonDays, JSON.stringify(result), LEGAL_DISCLAIMER]
    );
  } catch {
    // DB optional
  }

  return result;
}

export async function getOutlookHistory(userId: number, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    return await query(
      `SELECT id, stock_code, horizon_days, outlook, created_at
       FROM ai_outlook_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );
  } catch {
    return [];
  }
}
