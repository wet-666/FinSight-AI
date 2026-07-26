export interface SimPosition {
  stock_code: string;
  stock_name: string;
  shares: number;
  avg_cost: number;
  currentPrice?: number;
  profit?: number;
  profitRate?: number;
  sort_order?: number;
  weight?: number;
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
