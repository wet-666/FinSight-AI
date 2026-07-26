import type {
  BacktestConfig,
  BacktestTrade,
  BacktestResult,
} from '@shared/types/backtest';

export type { BacktestConfig, BacktestTrade, BacktestResult };

interface DayData {
  date: string;
  close: number;
  sentiment: number;
  ma20: number;
}

function calcMA20(closes: number[], idx: number): number {
  const start = Math.max(0, idx - 19);
  const slice = closes.slice(start, idx + 1);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calcSharpe(equityCurve: { value: number }[], riskFreeDaily = 0.00008): number {
  if (equityCurve.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    const cur = equityCurve[i].value;
    if (prev > 0) returns.push((cur - prev) / prev);
  }
  if (!returns.length) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const dailySharpe = (mean - riskFreeDaily) / std;
  return Math.round(dailySharpe * Math.sqrt(252) * 100) / 100;
}

/** 策略回测引擎：情绪阈值 + MA20，附带夏普/回撤/基准对比 */
export function runBacktest(
  kline: { date: string; close: number; ma20?: number }[],
  sentiment: { date: string; score: number }[],
  config: BacktestConfig,
  benchmark?: { date: string; close: number }[]
): BacktestResult {
  const sentimentMap = new Map(sentiment.map((s) => [s.date, s.score]));
  const closes = kline.map((k) => k.close);

  const days: DayData[] = kline.map((k, i) => ({
    date: k.date,
    close: k.close,
    sentiment: sentimentMap.get(k.date) ?? 0,
    ma20: k.ma20 ?? calcMA20(closes, i),
  }));

  const trades: BacktestTrade[] = [];
  let cash = config.initialCapital;
  let shares = 0;
  let peak = config.initialCapital;
  let maxDrawdown = 0;
  let wins = 0;
  let closedTrades = 0;
  let buyPrice = 0;
  let tradedNotional = 0;

  const equityCurve: { date: string; value: number }[] = [];

  for (const day of days) {
    const portfolioValue = cash + shares * day.close;
    equityCurve.push({ date: day.date, value: Math.round(portfolioValue * 100) / 100 });

    if (portfolioValue > peak) peak = portfolioValue;
    const dd = peak > 0 ? (peak - portfolioValue) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const sentimentOk = day.sentiment >= config.sentimentThreshold;
    const priceBelowMa = config.useMa20 ? day.close < day.ma20 : true;

    if (shares === 0 && sentimentOk && priceBelowMa) {
      const buyShares = Math.floor(cash / day.close / 100) * 100;
      if (buyShares >= 100) {
        shares = buyShares;
        const cost = shares * day.close;
        cash -= cost;
        tradedNotional += cost;
        buyPrice = day.close;
        trades.push({
          date: day.date,
          type: 'buy',
          price: day.close,
          shares,
          reason: `情绪${day.sentiment.toFixed(2)}≥${config.sentimentThreshold}${config.useMa20 ? '，价格低于MA20' : ''}`,
        });
      }
    }

    if (shares > 0) {
      const sellSignal =
        day.sentiment < 0 || (config.useMa20 && day.close > day.ma20 * 1.05);

      if (sellSignal) {
        const proceeds = shares * day.close;
        cash += proceeds;
        tradedNotional += proceeds;
        if (day.close > buyPrice) wins++;
        closedTrades++;
        trades.push({
          date: day.date,
          type: 'sell',
          price: day.close,
          shares,
          reason: day.sentiment < 0 ? '情绪转弱' : '价格突破MA20上方5%',
        });
        shares = 0;
      }
    }
  }

  if (shares > 0 && days.length > 0) {
    const lastDay = days[days.length - 1];
    cash += shares * lastDay.close;
    tradedNotional += shares * lastDay.close;
    if (lastDay.close > buyPrice) wins++;
    closedTrades++;
    trades.push({
      date: lastDay.date,
      type: 'sell',
      price: lastDay.close,
      shares,
      reason: '回测结束平仓',
    });
    shares = 0;
  }

  const finalValue = cash;
  const totalReturn = (finalValue - config.initialCapital) / config.initialCapital;
  const winRate = closedTrades > 0 ? wins / closedTrades : 0;
  const turnover =
    config.initialCapital > 0
      ? Math.round((tradedNotional / config.initialCapital) * 100) / 100
      : 0;

  // 买入持有基准（同标的）或外部基准
  const benchSource =
    benchmark && benchmark.length >= 2
      ? benchmark
      : kline.map((k) => ({ date: k.date, close: k.close }));
  const firstClose = benchSource[0]?.close || 1;
  const benchmarkCurve = benchSource.map((b) => ({
    date: b.date,
    value:
      Math.round((config.initialCapital * (b.close / firstClose)) * 100) / 100,
  }));
  const lastBench = benchmarkCurve[benchmarkCurve.length - 1]?.value || config.initialCapital;
  const benchmarkReturn = (lastBench - config.initialCapital) / config.initialCapital;

  return {
    trades,
    equityCurve,
    benchmarkCurve,
    totalReturn: Math.round(totalReturn * 10000) / 10000,
    benchmarkReturn: Math.round(benchmarkReturn * 10000) / 10000,
    excessReturn: Math.round((totalReturn - benchmarkReturn) * 10000) / 10000,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    sharpeRatio: calcSharpe(equityCurve),
    winRate: Math.round(winRate * 10000) / 10000,
    tradeCount: trades.filter((t) => t.type === 'buy').length,
    turnover,
    finalValue: Math.round(finalValue * 100) / 100,
  };
}

export function describeStrategy(config: BacktestConfig): string {
  let desc = `当情绪≥${config.sentimentThreshold}`;
  if (config.useMa20) desc += '且股价低于20日均线';
  desc += '时买入；情绪转弱或价格突破MA20上方5%时卖出';
  return desc;
}
