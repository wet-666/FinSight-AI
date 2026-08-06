import axios from 'axios';
import iconv from 'iconv-lite';
import { query } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { config } from '../config';
import { toDateStr } from '../utils/date';
import type { IndexItem, KLineItem, QuoteData } from '@shared/types/dashboard';

export type { QuoteData };

const QUOTE_TTL = () => config.redis.quoteTtlSeconds;

const SINA_QUOTE_URL = 'https://hq.sinajs.cn/list=';

/** 新浪行情接口返回 GBK，需按二进制解码，否则中文股票名乱码 */
async function fetchSinaText(list: string, timeout = 5000): Promise<string> {
  const res = await axios.get(`${SINA_QUOTE_URL}${list}`, {
    responseType: 'arraybuffer',
    headers: { Referer: 'https://finance.sina.com.cn' },
    timeout,
  });
  return iconv.decode(Buffer.from(res.data), 'gbk');
}

// 股票元数据
const STOCK_META: Record<string, { name: string; market: 'SH' | 'SZ'; base: number }> = {
  '600519': { name: '贵州茅台', market: 'SH', base: 1680 },
  '000858': { name: '五粮液', market: 'SZ', base: 145 },
  '601318': { name: '中国平安', market: 'SH', base: 48 },
  '000001': { name: '平安银行', market: 'SZ', base: 11.5 },
  '600036': { name: '招商银行', market: 'SH', base: 36 },
  '300750': { name: '宁德时代', market: 'SZ', base: 185 },
  '002594': { name: '比亚迪', market: 'SZ', base: 260 },
  '510300': { name: '沪深300ETF', market: 'SH', base: 3.8 },
};

// 格式化新浪股票代码
function formatSinaCode(code: string, market?: string): string {
  if (code.startsWith('s_') || code.startsWith('sh') || code.startsWith('sz')) {
    return code;
  }
  const m = market || STOCK_META[code]?.market || (code.startsWith('6') || code.startsWith('5') ? 'SH' : 'SZ');
  return `${m === 'SH' ? 'sh' : 'sz'}${code}`;
}

const cacheKey = {
  quote: (code: string, market?: string) =>
    `fs:quote:${formatSinaCode(code, market)}`,
  indices: 'fs:indices:main',
  batch: (codes: string[]) => `fs:batch:${codes.slice().sort().join(',')}`,
};

// 格式化东方财富股票代码
function toEastMoneySecId(code: string): string {
  const market = STOCK_META[code]?.market || (code.startsWith('6') || code.startsWith('5') ? 'SH' : 'SZ');
  return `${market === 'SH' ? '1' : '0'}.${code}`;
}

// 解析新浪股票数据
function parseSinaQuote(raw: string, code: string): QuoteData | null {
  const match = raw.match(/="([^"]*)"/);
  if (!match || !match[1]) return null;
  const parts = match[1].split(',');
  if (parts.length < 10) return null;
  const price = parseFloat(parts[3]) || 0;
  const prevClose = parseFloat(parts[2]) || price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  return {
    code,
    name: parts[0],
    price,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open: parseFloat(parts[1]) || 0,
    prevClose,
    high: parseFloat(parts[4]) || 0,
    low: parseFloat(parts[5]) || 0,
    volume: parseInt(parts[8], 10) || 0,
    amount: parseFloat(parts[9]) || 0,
  };
}

// 解析新浪指数数据
function parseSinaIndex(raw: string, code: string, name: string): IndexItem | null {
  const match = raw.match(/="([^"]*)"/);
  if (!match || !match[1]) return null;
  const parts = match[1].split(',');
  if (parts.length < 6) return null;
  return {
    code,
    name,
    price: parseFloat(parts[1]) || 0,
    change: parseFloat(parts[2]) || 0,
    changePercent: parseFloat(parts[3]) || 0,
  };
}

//获取市场指数数据
export async function getMarketIndices(): Promise<IndexItem[]> {
  const cached = await cacheGet<IndexItem[]>(cacheKey.indices);
  if (cached?.length) return cached;

  const indices = [
    { code: 's_sh000001', name: '上证指数' },
    { code: 's_sz399001', name: '深证成指' },
    { code: 's_sz399006', name: '创业板指' },
    { code: 's_sh000300', name: '沪深300' },
  ];
  try {
    const text = await fetchSinaText(indices.map((i) => i.code).join(','));
    const lines = text.split('\n').filter(Boolean);
    const parsed = indices
      .map((idx, i) => parseSinaIndex(lines[i] || '', idx.code, idx.name))
      .filter((x): x is IndexItem => x !== null);
    if (parsed.length) {
      await cacheSet(cacheKey.indices, parsed, QUOTE_TTL());
      return parsed;
    }
  } catch {
    /* fallback */
  }
  return getMockIndices();
}

// 获取股票报价（失败时返回 mock，供行情展示兜底）
export async function getStockQuote(code: string, market?: string): Promise<QuoteData | null> {
  const live = await getLiveQuote(code, market);
  if (live) return live;
  return getMockQuote(code, STOCK_META[code]?.name);
}

/** 仅真实新浪行情，失败返回 null（不算 mock） */
export async function getLiveQuote(code: string, market?: string): Promise<QuoteData | null> {
  const key = cacheKey.quote(code, market);
  const cached = await cacheGet<QuoteData>(key);
  if (cached && cached.price > 0) return cached;

  try {
    const text = await fetchSinaText(formatSinaCode(code, market));
    const quote = parseSinaQuote(text, code);
    if (quote && quote.price > 0) {
      await cacheSet(key, quote, QUOTE_TTL());
      return quote;
    }
  } catch {
    /* network / parse fail */
  }
  return null;
}

// 获取批量股票报价
export async function getBatchQuotes(
  stocks: { code: string; market?: string; name?: string }[]
): Promise<QuoteData[]> {
  if (stocks.length === 0) return [];
  const batchKey = cacheKey.batch(stocks.map((s) => formatSinaCode(s.code, s.market)));
  const cached = await cacheGet<QuoteData[]>(batchKey);
  if (cached?.length) return cached;

  try {
    const text = await fetchSinaText(
      stocks.map((s) => formatSinaCode(s.code, s.market)).join(','),
      8000
    );
    const lines = text.split('\n').filter(Boolean);
    const parsed = stocks
      .map((s, i) => parseSinaQuote(lines[i] || '', s.code))
      .filter((x): x is QuoteData => x !== null && x.price > 0);
    if (parsed.length) {
      await cacheSet(batchKey, parsed, QUOTE_TTL());
      // 同步单票缓存，供 getLiveQuote 复用
      await Promise.all(
        parsed.map((q) => {
          const stock = stocks.find((s) => s.code === q.code);
          return cacheSet(cacheKey.quote(q.code, stock?.market), q, QUOTE_TTL());
        })
      );
      return parsed;
    }
  } catch {
    /* fallback */
  }
  return stocks.map((s) => getMockQuote(s.code, s.name || STOCK_META[s.code]?.name));
}

// 计算20日均线
function withMa20(items: KLineItem[]): KLineItem[] {
  return items.map((item, idx) => {
    const start = Math.max(0, idx - 19);
    const slice = items.slice(start, idx + 1);
    const ma20 = slice.reduce((a, b) => a + b.close, 0) / slice.length;
    return { ...item, ma20: Math.round(ma20 * 100) / 100 };
  });
}

/** 确定性种子 K 线（无随机，便于本地复现） */
export function generateSeedKLine(code: string, days = 120): KLineItem[] {
  const meta = STOCK_META[code] || { name: `股票${code}`, market: 'SZ' as const, base: 20 };
  const result: KLineItem[] = [];
  let price = meta.base;
  const now = new Date();
  const seed = parseInt(code.replace(/\D/g, '').slice(-4) || '1000', 10);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // skip weekends for more realistic series
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const wave = Math.sin((days - i + seed % 17) / 8) * 0.012;
    const drift = 0.0003;
    const open = price;
    const close = price * (1 + wave + drift);
    const high = Math.max(open, close) * (1 + Math.abs(wave) * 0.4);
    const low = Math.min(open, close) * (1 - Math.abs(wave) * 0.4);
    result.push({
      date: toDateStr(d),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 2_000_000 + ((seed * (i + 3)) % 8_000_000),
    });
    price = close;
  }
  return withMa20(result);
}

/** @deprecated 兼容旧调用，改为确定性种子 */
export function generateMockKLine(code: string, days = 60): KLineItem[] {
  return generateSeedKLine(code, days);
}

// 从数据库加载K线数据
async function loadKLineFromDb(code: string, days: number): Promise<KLineItem[]> {
  try {
    const safeDays = Math.min(Math.max(Number(days) || 60, 1), 500);
    const rows = await query<
      {
        trade_date: string | Date;
        open_price: number;
        high_price: number;
        low_price: number;
        close_price: number;
        volume: number;
        ma20: number | null;
      }[]
    >(
      `SELECT trade_date, open_price, high_price, low_price, close_price, volume, ma20
       FROM stock_history
       WHERE stock_code = ?
       ORDER BY trade_date DESC
       LIMIT ${safeDays}`,
      [code]
    );
    if (!rows.length) return [];
    const items = rows
      .reverse()
      .map((r) => ({
        date: toDateStr(r.trade_date),
        open: Number(r.open_price),
        high: Number(r.high_price),
        low: Number(r.low_price),
        close: Number(r.close_price),
        volume: Number(r.volume),
        ma20: r.ma20 != null ? Number(r.ma20) : undefined,
      }));
    return items.some((x) => x.ma20 == null) ? withMa20(items) : items;
  } catch {
    return [];
  }
}

// 从东方财富公开接口获取K线数据
async function fetchEastMoneyKLine(code: string, days: number): Promise<KLineItem[]> {
  const url =
    'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
    `?secid=${toEastMoneySecId(code)}` +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    `&klt=101&fqt=1&end=20500101&lmt=${days}`;
  const res = await axios.get(url, {
    timeout: 4000,
    headers: { Referer: 'https://quote.eastmoney.com' },
  });
  const klines: string[] = res.data?.data?.klines || [];
  if (!klines.length) return [];
  const items = klines.map((line) => {
    const [date, open, close, high, low, volume] = line.split(',');
    return {
      date,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseInt(volume, 10) || 0,
    };
  });
  return withMa20(items);
}

// 保存K线数据到数据库
export async function saveKLineToDb(code: string, items: KLineItem[]): Promise<void> {
  for (const item of items) {
    await query(
      `INSERT INTO stock_history
        (stock_code, trade_date, open_price, high_price, low_price, close_price, volume, ma20)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        open_price = VALUES(open_price),
        high_price = VALUES(high_price),
        low_price = VALUES(low_price),
        close_price = VALUES(close_price),
        volume = VALUES(volume),
        ma20 = VALUES(ma20)`,
      [
        code,
        item.date,
        item.open,
        item.high,
        item.low,
        item.close,
        item.volume,
        item.ma20 ?? null,
      ]
    );
  }
}

/**
 * K 线：先快速读库；东方财富成功则刷新。避免远程挂起导致一直用过期数据。
 */
export async function getKLine(
  code: string,
  days = 60
): Promise<{ kline: KLineItem[]; source: 'database' | 'eastmoney' | 'seed' }> {
  const need = Math.max(days, 120);
  const fromDb = await loadKLineFromDb(code, need);

  try {
    const remote = await fetchEastMoneyKLine(code, need);
    if (remote.length > 0) {
      try {
        await saveKLineToDb(code, remote);
      } catch {
        /* DB optional */
      }
      return { kline: remote.slice(-days), source: 'eastmoney' };
    }
  } catch {
    /* eastmoney 常超时，回退本地 */
  }

  if (fromDb.length >= Math.min(days, 20)) {
    return { kline: fromDb.slice(-days), source: 'database' };
  }

  const seed = generateSeedKLine(code, need);
  try {
    await saveKLineToDb(code, seed);
  } catch {
    /* ignore */
  }
  return { kline: seed.slice(-days), source: 'seed' };
}

export type MarkPrice = {
  price: number;
  prevClose: number;
  dayChange: number;
  dayChangePercent: number;
  source: 'sina' | 'kline' | 'none';
};

/**
 * 持仓计价：优先新浪实时价（可用），再回退 K 线收盘；并带昨收用于「当日涨跌」
 * （今日买入时成本≈现价，浮动盈亏为 0 是正常的，当日涨跌仍可反映行情）
 */
export async function resolveMarkPrice(code: string): Promise<MarkPrice> {
  const bars = await loadKLineFromDb(code, 8);
  const last = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : undefined;

  let price = 0;
  let prevClose = 0;
  let source: MarkPrice['source'] = 'none';

  try {
    const quote = await getLiveQuote(code);
    if (quote && quote.price > 0) {
      price = quote.price;
      prevClose = quote.prevClose > 0 ? quote.prevClose : prev?.close || last?.close || price;
      source = 'sina';
    }
  } catch {
    /* ignore */
  }

  if (!(price > 0) && last && last.close > 0) {
    price = last.close;
    prevClose = prev?.close || last.open || price;
    source = 'kline';
  }

  if (!(prevClose > 0)) prevClose = price;
  const dayChange = Math.round((price - prevClose) * 100) / 100;
  const dayChangePercent =
    prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0;

  return { price, prevClose, dayChange, dayChangePercent, source };
}

/** @deprecated 使用 resolveMarkPrice */
export async function getLatestClose(code: string): Promise<number | null> {
  const mark = await resolveMarkPrice(code);
  return mark.price > 0 ? mark.price : null;
}

// 探测行情源是否可用
export async function probeMarketSource(): Promise<{ ok: boolean; message: string }> {
  try {
    const quote = await getStockQuote('600519');
    if (quote && quote.price > 0) {
      return { ok: true, message: '行情源可用（新浪）' };
    }
    return { ok: false, message: '行情源不可用，将使用种子/缓存数据' };
  } catch {
    return { ok: false, message: '行情源探测失败' };
  }
}

// 获取模拟指数数据
function getMockIndices(): IndexItem[] {
  return [
    { code: '000001', name: '上证指数', price: 3120.45, change: 15.32, changePercent: 0.49 },
    { code: '399001', name: '深证成指', price: 9856.78, change: -23.15, changePercent: -0.23 },
    { code: '399006', name: '创业板指', price: 1923.56, change: 8.67, changePercent: 0.45 },
    { code: '000300', name: '沪深300', price: 3654.21, change: 5.43, changePercent: 0.15 },
  ];
}

// 获取模拟股票行情数据
function getMockQuote(code: string, name?: string): QuoteData {
  const meta = STOCK_META[code];
  const base = meta?.base || 10 + (parseInt(code.slice(-2), 10) || 5);
  return {
    code,
    name: name || meta?.name || `股票${code}`,
    price: base,
    change: 0.12,
    changePercent: 0.35,
    open: base * 0.995,
    prevClose: base * 0.998,
    high: base * 1.01,
    low: base * 0.99,
    volume: 3_500_000,
    amount: 500_000_000,
  };
}

export { getMockQuote, STOCK_META };
