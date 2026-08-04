/** 常见/热门标的目录（本地检索，不打外部搜索接口） */
export type StockCatalogItem = {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
  industry: string;
  hot?: boolean;
};

export const STOCK_CATALOG: StockCatalogItem[] = [
  { code: '600519', name: '贵州茅台', market: 'SH', industry: '白酒', hot: true },
  { code: '000858', name: '五粮液', market: 'SZ', industry: '白酒', hot: true },
  { code: '601318', name: '中国平安', market: 'SH', industry: '保险', hot: true },
  { code: '000001', name: '平安银行', market: 'SZ', industry: '银行', hot: true },
  { code: '600036', name: '招商银行', market: 'SH', industry: '银行', hot: true },
  { code: '300750', name: '宁德时代', market: 'SZ', industry: '新能源', hot: true },
  { code: '002594', name: '比亚迪', market: 'SZ', industry: '汽车', hot: true },
  { code: '510300', name: '沪深300ETF', market: 'SH', industry: '宽基指数', hot: true },
  { code: '600887', name: '伊利股份', market: 'SH', industry: '乳业', hot: true },
  { code: '000333', name: '美的集团', market: 'SZ', industry: '家电', hot: true },
  { code: '601012', name: '隆基绿能', market: 'SH', industry: '光伏', hot: true },
  { code: '002475', name: '立讯精密', market: 'SZ', industry: '消费电子', hot: true },
  { code: '300059', name: '东方财富', market: 'SZ', industry: '互联网券商', hot: true },
  { code: '600276', name: '恒瑞医药', market: 'SH', industry: '医药', hot: true },
  { code: '601166', name: '兴业银行', market: 'SH', industry: '银行' },
  { code: '000651', name: '格力电器', market: 'SZ', industry: '家电' },
  { code: '601888', name: '中国中免', market: 'SH', industry: '免税' },
  { code: '002415', name: '海康威视', market: 'SZ', industry: '安防' },
  { code: '600030', name: '中信证券', market: 'SH', industry: '证券' },
  { code: '000725', name: '京东方A', market: 'SZ', industry: '面板' },
  { code: '601899', name: '紫金矿业', market: 'SH', industry: '有色' },
  { code: '002714', name: '牧原股份', market: 'SZ', industry: '养殖' },
  { code: '688981', name: '中芯国际', market: 'SH', industry: '半导体', hot: true },
  { code: '300760', name: '迈瑞医疗', market: 'SZ', industry: '医疗器械' },
];

export function getHotStocks(): StockCatalogItem[] {
  return STOCK_CATALOG.filter((s) => s.hot);
}

export function searchStocks(q: string, limit = 12): StockCatalogItem[] {
  const key = q.trim().toLowerCase();
  if (!key) return getHotStocks().slice(0, limit);
  const scored = STOCK_CATALOG.map((s) => {
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    let score = 0;
    if (code === key) score = 100;
    else if (code.startsWith(key)) score = 80;
    else if (code.includes(key)) score = 60;
    else if (name.startsWith(key)) score = 70;
    else if (name.includes(key)) score = 50;
    else if (s.industry.includes(q.trim())) score = 30;
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}

export function findStockMeta(code: string): StockCatalogItem | undefined {
  return STOCK_CATALOG.find((s) => s.code === code);
}
