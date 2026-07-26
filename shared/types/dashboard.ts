/** 大盘指数 */
export interface IndexItem {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;  
}

/** K 线（日 K） */
export interface KLineItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20?: number;
}

/** 个股实时/快照行情 */
export interface QuoteData {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

/** 自选股雷达项 */
export interface WatchItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  sentimentScore: number;
  sentimentLabel: string;
}

/** 新闻条目（前后端展示用） */
export interface NewsItem {
  id?: number;
  title: string;
  content: string;
  source: string;
  url?: string;
  relatedStocks?: string[];
  publishedAt?: string;
  sentiment?: {
    score?: number;
    label: string;
    summary: string;
  };
}

export interface SentimentPoint {
  date: string;
  score: number;
}
