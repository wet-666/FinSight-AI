import { describe, expect, it } from 'vitest';
import { extractJson, pickModelText } from '../src/agents/llm';
import { parseStages } from '../src/agents/parseStages';
import { resolveOrchestratorMode } from '../src/agents/orchestratorMode';
import { keywordRetrieve, type NewsDoc } from '../src/agents/ragStore';
import { detectConflicts } from '../src/agents/conflictCheck';
import { formatSseEvent } from '../src/utils/sse';
import { cacheGet, isRedisReady } from '../src/config/redis';
import type { ProgressEvent } from '../src/agents/orchestrator';
import type { QuantAgentOutput, SentimentAgentOutput } from '../src/agents/types';

const corpus: NewsDoc[] = [
  {
    id: 'news-1',
    title: '宁德时代发布季度业绩',
    summary: '电池出货与储能订单超预期，机构上调盈利预测。',
    sentimentScore: 0.42,
    source: 'news',
  },
  {
    id: 'news-2',
    title: '行业政策观察',
    summary: '新能源补贴节奏存在不确定性，短期波动加大。',
    sentimentScore: -0.12,
    source: 'news',
  },
  {
    id: 'demo-1',
    title: '300750 样例资讯',
    summary: '数据库暂无该股新闻时的兜底语料。',
    sentimentScore: 0.05,
    source: 'demo',
  },
];

function sentiment(overrides: Partial<SentimentAgentOutput> = {}): SentimentAgentOutput {
  return {
    avgScore: 0.3,
    label: '偏多',
    newsCount: 3,
    highlights: [],
    narrative: '舆情偏正面',
    citations: [
      { id: 'news-1', title: '业绩', snippet: '超预期', score: 0.8, source: 'news' },
    ],
    retrievalMode: 'embedding',
    usedCitationIds: ['news-1'],
    ...overrides,
  };
}

function quant(overrides: Partial<QuantAgentOutput> = {}): QuantAgentOutput {
  return {
    priceTrend: '下跌',
    lastClose: 180,
    changePercent: -1.2,
    ma20: 190,
    priceVsMa20: '低于 MA20',
    volatilityHint: '波动正常',
    keyLevels: { support: 170, resistance: 200 },
    narrative: '价格弱于均线',
    ...overrides,
  };
}

describe('模型 JSON 解析', () => {
  it('抽出纯 JSON 对象', () => {
    expect(extractJson<{ label: string }>('{"label":"偏多"}')).toEqual({ label: '偏多' });
  });

  it('容忍 markdown 代码块和前后废话', () => {
    const raw = '分析如下：\n```json\n{"avgScore":0.21,"label":"中性"}\n```\n以上仅为模拟。';
    expect(extractJson<{ avgScore: number; label: string }>(raw)).toEqual({
      avgScore: 0.21,
      label: '中性',
    });
  });

  it('非法 JSON 或空串返回 null，不抛错', () => {
    expect(extractJson('{label:')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('没有花括号')).toBeNull();
  });

  it('从模型消息里取 content，空 content 时回退 reasoning_content', () => {
    expect(pickModelText('直接字符串')).toBe('直接字符串');
    expect(pickModelText({ content: '正文' })).toBe('正文');
    expect(pickModelText({ content: [{ type: 'text', text: '分段' }, { type: 'text', text: '拼接' }] })).toBe(
      '分段拼接'
    );
    expect(pickModelText({ content: '   ', reasoning_content: '思考区文本' })).toBe('思考区文本');
  });
});

describe('分析回放：stages JSON', () => {
  it('合法字符串和数组都能还原阶段', () => {
    const stages = [{ role: 'sentiment_analyst', title: '舆情分析师', status: 'done', summary: 'ok', data: {} }];
    expect(parseStages(stages)).toEqual(stages);
    expect(parseStages(JSON.stringify(stages))).toEqual(stages);
  });

  it('脏数据返回空数组，避免回放 500', () => {
    expect(parseStages('{not-json')).toEqual([]);
    expect(parseStages('{"role":"x"}')).toEqual([]);
    expect(parseStages(null)).toEqual([]);
    expect(parseStages(undefined)).toEqual([]);
  });
});

describe('降级分支', () => {
  it('Embedding 不可用时关键词检索仍返回 TopK，并保住相关文档', () => {
    const result = keywordRetrieve(corpus, '宁德时代 业绩 电池', 2);
    expect(result.mode).toBe('keyword');
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].id).toBe('news-1');
    expect(result.citations[0].source).toBe('news');
    expect(result.newsItems).toHaveLength(2);
  });

  it('语料全不匹配时仍返回前几条，保证无新闻也能跑通编排', () => {
    const result = keywordRetrieve(corpus, 'zzzz-no-hit', 2);
    expect(result.mode).toBe('keyword');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.length).toBeLessThanOrEqual(2);
  });

  it('已配置 Key 但三次 Agent 都没吃到合法 JSON 时标记 llm_fallback', () => {
    expect(resolveOrchestratorMode('llm', 0)).toBe('llm_fallback');
    expect(resolveOrchestratorMode('llm', 2)).toBe('llm');
    expect(resolveOrchestratorMode('demo', 0)).toBe('demo');
  });

  it('Redis 未就绪时 cacheGet 直接返回 null，相当于行情直连', async () => {
    expect(isRedisReady()).toBe(false);
    expect(await cacheGet('quote:300750')).toBeNull();
  });
});

describe('SSE 阶段事件契约', () => {
  it('帧格式是 data: JSON + 空行，start/stage/done/error 可被前端按行解析', () => {
    const events: ProgressEvent[] = [
      { type: 'start', mode: 'demo', stockCode: '300750', stockName: '宁德时代', retrievalMode: 'keyword' },
      {
        type: 'stage',
        index: 0,
        stage: { role: 'sentiment_analyst', title: '舆情分析师', status: 'running', summary: '', data: {} },
      },
      { type: 'error', message: 'AI 分析失败' },
    ];

    for (const event of events) {
      const frame = formatSseEvent(event);
      expect(frame.startsWith('data: ')).toBe(true);
      expect(frame.endsWith('\n\n')).toBe(true);
      const parsed = JSON.parse(frame.slice('data: '.length).trim()) as ProgressEvent;
      expect(parsed.type).toBe(event.type);
    }
  });
});

describe('规则层冲突检测（不调模型）', () => {
  it('舆情偏多但价格低于 MA20 时给出 sentiment_price 警告', () => {
    const conflicts = detectConflicts(sentiment(), quant());
    expect(conflicts.some((c) => c.type === 'sentiment_price' && c.severity === 'warning')).toBe(true);
  });

  it('关键词 + 样例语料时提示 data_gap，避免把 demo 当真实新闻', () => {
    const conflicts = detectConflicts(
      sentiment({
        retrievalMode: 'keyword',
        citations: [{ id: 'demo-1', title: '样例', snippet: 'demo', score: 0.2, source: 'demo' }],
      }),
      quant({ priceVsMa20: '高于 MA20', priceTrend: '上涨' })
    );
    expect(conflicts.some((c) => c.type === 'data_gap')).toBe(true);
  });
});
