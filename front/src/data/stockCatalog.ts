/** 与后端 stockCatalog 对齐的本地目录（输入联想不发请求） */
export type StockOption = {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
  industry?: string;
};

export const STOCK_OPTIONS: StockOption[] = [
  { code: '600519', name: '贵州茅台', market: 'SH', industry: '白酒' },
  { code: '000858', name: '五粮液', market: 'SZ', industry: '白酒' },
  { code: '601318', name: '中国平安', market: 'SH', industry: '保险' },
  { code: '000001', name: '平安银行', market: 'SZ', industry: '银行' },
  { code: '600036', name: '招商银行', market: 'SH', industry: '银行' },
  { code: '300750', name: '宁德时代', market: 'SZ', industry: '新能源' },
  { code: '002594', name: '比亚迪', market: 'SZ', industry: '汽车' },
  { code: '510300', name: '沪深300ETF', market: 'SH', industry: '宽基指数' },
  { code: '600887', name: '伊利股份', market: 'SH', industry: '乳业' },
  { code: '000333', name: '美的集团', market: 'SZ', industry: '家电' },
  { code: '601012', name: '隆基绿能', market: 'SH', industry: '光伏' },
  { code: '002475', name: '立讯精密', market: 'SZ', industry: '消费电子' },
  { code: '300059', name: '东方财富', market: 'SZ', industry: '互联网券商' },
  { code: '600276', name: '恒瑞医药', market: 'SH', industry: '医药' },
  { code: '601166', name: '兴业银行', market: 'SH', industry: '银行' },
  { code: '000651', name: '格力电器', market: 'SZ', industry: '家电' },
  { code: '601888', name: '中国中免', market: 'SH', industry: '免税' },
  { code: '002415', name: '海康威视', market: 'SZ', industry: '安防' },
  { code: '600030', name: '中信证券', market: 'SH', industry: '证券' },
  { code: '000725', name: '京东方A', market: 'SZ', industry: '面板' },
  { code: '601899', name: '紫金矿业', market: 'SH', industry: '有色' },
  { code: '688981', name: '中芯国际', market: 'SH', industry: '半导体' },
  { code: '300760', name: '迈瑞医疗', market: 'SZ', industry: '医疗器械' },
  { code: '600520', name: '三佳科技', market: 'SH', industry: '其他' },
];

export const HOT_STOCKS = STOCK_OPTIONS.slice(0, 12);

export function suggestStocks(q: string, limit = 8): StockOption[] {
  const key = q.trim().toLowerCase();
  if (!key) return HOT_STOCKS.slice(0, limit);
  return STOCK_OPTIONS.filter(
    (s) =>
      s.code.includes(key) ||
      s.name.toLowerCase().includes(key) ||
      (s.industry || '').includes(q.trim())
  ).slice(0, limit);
}

export function matchStock(codeOrName: string): StockOption | undefined {
  const key = codeOrName.trim();
  return (
    STOCK_OPTIONS.find((s) => s.code === key) ||
    STOCK_OPTIONS.find((s) => s.name === key) ||
    STOCK_OPTIONS.find((s) => s.name.includes(key) || s.code.startsWith(key))
  );
}
