import axios from 'axios';
import { query } from '../config/database';
import type { IndexItem, KLineItem, QuoteData } from '@shared/types/dashboard';

export type { QuoteData };

const SINA_QUOTE_URL = 'https://hq.sinajs.cn/list=';

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

function formatSinaCode(code: string, market?: string): string {
  if (code.startsWith('s_') || code.startsWith('sh') || code.startsWith('sz')) {
    return code;
  }
  const m = market || STOCK_META[code]?.market || (code.startsWith('6') || code.startsWith('5') ? 'SH' : 'SZ');
  return `${m === 'SH' ? 'sh' : 'sz'}${code}`;
}

function toEastMoneySecId(code: string): string {
  const market = STOCK_META[code]?.market || (code.startsWith('6') || code.startsWith('5') ? 'SH' : 'SZ');
  return `${market === 'SH' ? '1' : '0'}.${code}`;
}

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

export async function getMarketIndices(): Promise<IndexItem[]> {
  const indices = [
    { code: 's_sh000001', name: '上证指数' },
    { code: 's_sz399001', name: '深证成指' },
    { code: 's_sz399006', name: '创业板指' },
    { code: 's_sh000300', name: '沪深300' },
  ];
  try {
    const res = await axios.get(`${SINA_QUOTE_URL}${indices.map((i) => i.code).join(',')}`, {
      responseType: 'text',
      headers: { Referer: 'https://finance.sina.com.cn' },
      timeout: 5000,
    });
    const lines = String(res.data).split('\n').filter(Boolean);
    const parsed = indices
      .map((idx, i) => parseSinaIndex(lines[i] || '', idx.code, idx.name))
      .filter((x): x is IndexItem => x !== null);
    if (parsed.length) return parsed;
  } catch {
    /* fallback */
  }
  return getMockIndices();
}

export async function getStockQuote(code: string, market?: string): Promise<QuoteData | null> {
  try {
    const res = await axios.get(`${SINA_QUOTE_URL}${formatSinaCode(code, market)}`, {
      responseType: 'text',
      headers: { Referer: 'https://finance.sina.com.cn' },
      timeout: 5000,
    });
    const quote = parseSinaQuote(String(res.data), code);
    if (quote && quote.price > 0) return quote;
  } catch {
    /* fallback */
  }
  return getMockQuote(code, STOCK_META[code]?.name);
}

export async function getBatchQuotes(
  stocks: { code: string; market?: string; name?: string }[]
): Promise<QuoteData[]> {
  if (stocks.length === 0) return [];
  try {
    const res = await axios.get(
      `${SINA_QUOTE_URL}${stocks.map((s) => formatSinaCode(s.code, s.market)).join(',')}`,
      {
        responseType: 'text',
        headers: { Referer: 'https://finance.sina.com.cn' },
        timeout: 8000,
      }
    );
    const lines = String(res.data).split('\n').filter(Boolean);
    const parsed = stocks
      .map((s, i) => parseSinaQuote(lines[i] || '', s.code))
      .filter((x): x is QuoteData => x !== null && x.price > 0);
    if (parsed.length) return parsed;
  } catch {
    /* fallback */
  }
  return stocks.map((s) => getMockQuote(s.code, s.name || STOCK_META[s.code]?.name));
}

function withMa20(items: KLineItem[]): KLineItem[] {
  return items.map((item, idx) => {
    const start = Math.max(0, idx - 19);
    const slice = items.slice(start, idx + 1);
    const ma20 = slice.reduce((a, b) => a + b.close, 0) / slice.length;
    return { ...item, ma20: Math.round(ma20 * 100) / 100 };
  });
}

/** 确定性种子 K 线（无随机，便于演示复现） */
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
      date: d.toISOString().slice(0, 10),
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

async function loadKLineFromDb(code: string, days: number): Promise<KLineItem[]> {
  try {
    const rows = await query<
      {
        trade_date: string;
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
       LIMIT ?`,
      [code, days]
    );
    if (!rows.length) return [];
    const items = rows
      .reverse()
      .map((r) => ({
        date: String(r.trade_date).slice(0, 10),
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

async function fetchEastMoneyKLine(code: string, days: number): Promise<KLineItem[]> {
  const url =
    'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
    `?secid=${toEastMoneySecId(code)}` +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    `&klt=101&fqt=1&end=20500101&lmt=${days}`;
  const res = await axios.get(url, {
    timeout: 8000,
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
 * K 线主路径：数据库 → 东方财富公开接口入库 → 确定性种子数据
 */
export async function getKLine(
  code: string,
  days = 60
): Promise<{ kline: KLineItem[]; source: 'database' | 'eastmoney' | 'seed' }> {
  const fromDb = await loadKLineFromDb(code, days);
  if (fromDb.length >= Math.min(days, 20)) {
    return { kline: fromDb.slice(-days), source: 'database' };
  }

  try {
    const remote = await fetchEastMoneyKLine(code, Math.max(days, 120));
    if (remote.length > 0) {
      try {
        await saveKLineToDb(code, remote);
      } catch {
        /* DB optional for demo */
      }
      return { kline: remote.slice(-days), source: 'eastmoney' };
    }
  } catch {
    /* network fail */
  }

  const seed = generateSeedKLine(code, Math.max(days, 120));
  try {
    await saveKLineToDb(code, seed);
  } catch {
    /* ignore */
  }
  return { kline: seed.slice(-days), source: 'seed' };
}

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

function getMockIndices(): IndexItem[] {
  return [
    { code: '000001', name: '上证指数', price: 3120.45, change: 15.32, changePercent: 0.49 },
    { code: '399001', name: '深证成指', price: 9856.78, change: -23.15, changePercent: -0.23 },
    { code: '399006', name: '创业板指', price: 1923.56, change: 8.67, changePercent: 0.45 },
    { code: '000300', name: '沪深300', price: 3654.21, change: 5.43, changePercent: 0.15 },
  ];
}

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
