export interface SimPosition {
  stock_code: string;
  stock_name: string;
  shares: number;
  avg_cost: number;
  currentPrice?: number;
  prevClose?: number;
  dayChange?: number;
  dayChangePercent?: number;
  profit?: number;
  profitRate?: number;
  sort_order?: number;
  weight?: number;
  priceSource?: string;
}

export interface SimAccount {
  cash_balance: number;
  initial_cash?: number;
}

export interface PortfolioSnapshot {
  account: SimAccount;
  totalAssets: number;
  marketValue: number;
  totalReturn: number;
  totalReturnRate: number;
  /** 持仓浮动盈亏合计（市值 - 成本） */
  unrealizedPnl?: number;
  /** 累计佣金（估算） */
  feesPaid?: number;
  positions: SimPosition[];
}

export interface OutlookScenario {
  label: string;
  probability: string;
  returnRange: string;
  description: string;
}

export interface OutlookResult {
  summary: string;
  scenarios: OutlookScenario[];
  disclaimer: string;
}
