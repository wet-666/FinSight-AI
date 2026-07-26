export type AgentRole = 'sentiment_analyst' | 'quant_researcher' | 'invest_secretary';

export interface AgentStage {
  role: AgentRole;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  summary: string;
  data: Record<string, unknown> & {
    highlights?: { title: string; score: number; summary?: string }[];
    priceTrend?: string;
    priceVsMa20?: string;
    keyLevels?: { support: number; resistance: number };
  };
  startedAt?: string;
  finishedAt?: string;
}

export interface SentimentAgentOutput {
  avgScore: number;
  label: string;
  newsCount: number;
  highlights: { title: string; score: number; summary: string }[];
  narrative: string;
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
}

export interface OrchestratorResult {
  stockCode: string;
  stockName: string;
  mode: 'llm' | 'demo';
  stages: AgentStage[];
  finalReport: string;
  structured: {
    sentiment: SentimentAgentOutput;
    quant: QuantAgentOutput;
    secretary: SecretaryAgentOutput;
  };
}
