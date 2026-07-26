export interface BacktestConfig {
  stockCode: string;
  sentimentThreshold: number;
  useMa20: boolean;
  initialCapital: number;
}

export interface BacktestTrade {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  shares: number;
  reason: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: { date: string; value: number }[];
  benchmarkCurve: { date: string; value: number }[];
  totalReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  tradeCount: number;
  turnover: number;
  finalValue: number;
}

/** 接口返回（含 AI 点评等扩展字段） */
export interface BacktestRunResponse extends BacktestResult {
  strategy?: string;
  aiSummary: string;
  dataSource?: string;
  reportId?: number;
}
