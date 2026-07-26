export type ReportType = 'stock_analysis' | 'backtest' | 'portfolio';

export interface ReportPayload {
  title: string;
  stockCode?: string;
  summary: string;
  sections: { heading: string; body: string }[];
  metrics?: Record<string, string | number>;
  disclaimer?: string;
}

export interface ReportRow {
  id: number;
  report_type: ReportType | string;
  stock_code: string;
  title: string;
  status: string;
  created_at: string;
  markdown_body?: string;
}
