export type AgentRole = 'sentiment_analyst' | 'quant_researcher' | 'invest_secretary';

export type RetrievalMode = 'embedding' | 'keyword';

export interface Citation {
  id: string;
  title: string;
  snippet: string;
  score: number;
  source: 'news' | 'demo';
}

export interface ConflictPoint {
  type: 'sentiment_price' | 'volatility' | 'data_gap';
  summary: string;
  severity: 'info' | 'warning' | 'high';
}

export interface AgentStage {
  role: AgentRole;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  summary: string;
  data: Record<string, unknown> & {
    highlights?: { title: string; score: number; summary?: string; id?: string }[];
    priceTrend?: string;
    priceVsMa20?: string;
    keyLevels?: { support: number; resistance: number };
    citations?: Citation[];
    conflicts?: ConflictPoint[];
    retrievalMode?: RetrievalMode;
  };
  startedAt?: string;
  finishedAt?: string;
}

export interface SentimentAgentOutput {
  avgScore: number;
  label: string;
  newsCount: number;
  highlights: { title: string; score: number; summary: string; id?: string }[];
  narrative: string;
  citations: Citation[];
  retrievalMode: RetrievalMode;
  usedCitationIds: string[];
}

export interface QuantAgentOutput {
  priceTrend: string;
  lastClose: number;
  changePercent: number;
  ma20: number | null;
  priceVsMa20: string;
  volatilityHint: string;
  keyLevels: { support: number; resistance: number };
  narrative: string;
}

export interface SecretaryAgentOutput {
  executiveSummary: string;
  risks: string[];
  watchPoints: string[];
  finalReport: string;
  disclaimer: string;
  citations: Citation[];
  conflicts: ConflictPoint[];
  evidenceSummary: string;
}

export interface FollowupAskResult {
  answer: string;
  citations: Citation[];
  retrievalMode: RetrievalMode;
  usedLlm: boolean;
}

export interface OrchestratorResult {
  stockCode: string;
  stockName: string;
  /** llm=模型增强成功；llm_fallback=已配置Key但解析失败用模板；demo=无Key */
  mode: 'llm' | 'llm_fallback' | 'demo';
  retrievalMode: RetrievalMode;
  stages: AgentStage[];
  finalReport: string;
  structured: {
    sentiment: SentimentAgentOutput;
    quant: QuantAgentOutput;
    secretary: SecretaryAgentOutput;
  };
}
