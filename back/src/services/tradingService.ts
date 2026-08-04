import { query, execute } from '../config/database';
import { resolveMarkPrice } from './marketService';
import { defaultMaxPositionWeight, getRiskProfile } from './riskService';
import type { SimAccount as SharedSimAccount } from '@shared/types/trading';

const INITIAL_CASH = 1_000_000;
const COMMISSION_RATE = 0.0003; // 模拟佣金万三

export type SimAccount = SharedSimAccount & { initial_cash: number };

export interface SimPosition {
  id: number;
  stock_code: string;
  stock_name: string;
  shares: number;
  avg_cost: number;
  sort_order: number;
  weight: number;
}

/** MySQL DECIMAL 默认以字符串返回，必须转 number，否则会出现 "723901.46"+市值 字符串拼接 */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAccount(row: { cash_balance?: unknown; initial_cash?: unknown }): SimAccount {
  return {
    cash_balance: num(row.cash_balance, INITIAL_CASH),
    initial_cash: num(row.initial_cash, INITIAL_CASH),
  };
}

function normalizePosition(row: Record<string, unknown>): SimPosition {
  return {
    id: num(row.id),
    stock_code: String(row.stock_code ?? ''),
    stock_name: String(row.stock_name ?? ''),
    shares: num(row.shares),
    avg_cost: num(row.avg_cost),
    sort_order: num(row.sort_order),
    weight: num(row.weight),
  };
}

export async function ensureAccount(userId: number): Promise<SimAccount> {
  const rows = await query<Record<string, unknown>[]>(
    'SELECT cash_balance, initial_cash FROM sim_accounts WHERE user_id = ?',
    [userId]
  );
  if (rows.length > 0) return normalizeAccount(rows[0]!);

  await query(
    'INSERT INTO sim_accounts (user_id, cash_balance, initial_cash) VALUES (?, ?, ?)',
    [userId, INITIAL_CASH, INITIAL_CASH]
  );
  return { cash_balance: INITIAL_CASH, initial_cash: INITIAL_CASH };
}

export async function getPositions(userId: number): Promise<SimPosition[]> {
  const rows = await query<Record<string, unknown>[]>(
    'SELECT * FROM sim_positions WHERE user_id = ? AND shares > 0 ORDER BY sort_order ASC',
    [userId]
  );
  return rows.map(normalizePosition);
}

export async function getOrders(userId: number, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await query<Record<string, unknown>[]>(
    `SELECT * FROM sim_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [userId]
  );
  return rows.map((r) => ({
    ...r,
    shares: num(r.shares),
    price: num(r.price),
    amount: num(r.amount),
  }));
}

export async function getPortfolioSummary(userId: number) {
  const account = await ensureAccount(userId);
  const positions = await getPositions(userId);

  let marketValue = 0;
  let unrealizedPnl = 0;
  const enriched = [];

  for (const pos of positions) {
    const mark = await resolveMarkPrice(pos.stock_code);
    const price = mark.price > 0 ? mark.price : pos.avg_cost;
    const mv = price * pos.shares;
    const cost = pos.avg_cost * pos.shares;
    const profit = mv - cost;
    marketValue += mv;
    unrealizedPnl += profit;
    enriched.push({
      ...pos,
      currentPrice: Math.round(price * 100) / 100,
      prevClose: Math.round(mark.prevClose * 100) / 100,
      dayChange: mark.dayChange,
      dayChangePercent: mark.dayChangePercent,
      marketValue: Math.round(mv * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitRate: cost > 0 ? Math.round((profit / cost) * 10000) / 100 : 0,
      priceSource: mark.source,
    });
  }

  const totalAssets = account.cash_balance + marketValue;
  const totalReturn = totalAssets - account.initial_cash;
  const totalReturnRate =
    account.initial_cash > 0
      ? Math.round((totalReturn / account.initial_cash) * 10000) / 100
      : 0;

  // 累计佣金（买入/卖出均按成交额万三、最低5元估算）
  const orderRows = await query<{ amount: number | string }[]>(
    'SELECT amount FROM sim_orders WHERE user_id = ?',
    [userId]
  );
  let feesPaid = 0;
  for (const o of orderRows) {
    feesPaid += Math.max(num(o.amount) * COMMISSION_RATE, 5);
  }
  feesPaid = Math.round(feesPaid * 100) / 100;

  return {
    account,
    positions: enriched,
    marketValue: Math.round(marketValue * 100) / 100,
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnRate,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    feesPaid,
    isSimulated: true,
  };
}

export async function placeOrder(
  userId: number,
  params: { stockCode: string; stockName: string; side: 'buy' | 'sell'; shares: number }
) {
  const { stockCode, stockName, side, shares } = params;
  if (shares <= 0 || shares % 100 !== 0) {
    throw new Error('交易数量必须为100的整数倍');
  }

  const mark = await resolveMarkPrice(stockCode);
  const price = num(mark.price);
  if (price <= 0) throw new Error('行情价格异常，请稍后重试');

  const amount = price * shares;
  const commission = Math.max(amount * COMMISSION_RATE, 5);
  const account = await ensureAccount(userId);

  if (side === 'buy') {
    const totalCost = amount + commission;
    if (account.cash_balance < totalCost) {
      throw new Error(`可用资金不足，需要 ¥${totalCost.toFixed(2)}`);
    }

    // 按风险测评限制单票仓位（无测评则按稳健型默认上限）
    const summary = await getPortfolioSummary(userId);
    const profile = await getRiskProfile(userId);
    const maxWeight = profile?.maxPositionWeight ?? defaultMaxPositionWeight();
    const existingPos = summary.positions.find((p) => p.stock_code === stockCode);
    const existingMv = existingPos ? Number(existingPos.marketValue || 0) : 0;
    const projectedMv = existingMv + amount;
    const projectedAssets = summary.totalAssets; // 现金换仓后总资产近似不变
    const projectedWeight = projectedAssets > 0 ? projectedMv / projectedAssets : 1;
    if (projectedWeight > maxWeight + 1e-6) {
      const levelText = profile ? profile.levelLabel : '稳健型（未测评默认）';
      const maxMv = projectedAssets * maxWeight;
      throw new Error(
        `超过${levelText}单票仓位上限 ${(maxWeight * 100).toFixed(0)}%（买入后约 ${(projectedWeight * 100).toFixed(1)}%，上限约 ¥${maxMv.toFixed(0)}）。可去「风险测评」调整偏好，或减少买入数量。`
      );
    }

    await query('UPDATE sim_accounts SET cash_balance = cash_balance - ? WHERE user_id = ?', [
      totalCost,
      userId,
    ]);

    const existing = await query<Record<string, unknown>[]>(
      'SELECT * FROM sim_positions WHERE user_id = ? AND stock_code = ?',
      [userId, stockCode]
    );

    if (existing.length > 0) {
      const pos = normalizePosition(existing[0]!);
      const newShares = pos.shares + shares;
      const newAvg = (pos.avg_cost * pos.shares + price * shares) / newShares;
      await query(
        'UPDATE sim_positions SET shares = ?, avg_cost = ?, stock_name = ? WHERE id = ?',
        [newShares, newAvg, stockName, pos.id]
      );
    } else {
      const maxOrder = await query<{ m: number | string }[]>(
        'SELECT COALESCE(MAX(sort_order), 0) as m FROM sim_positions WHERE user_id = ?',
        [userId]
      );
      await query(
        `INSERT INTO sim_positions (user_id, stock_code, stock_name, shares, avg_cost, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, stockCode, stockName, shares, price, num(maxOrder[0]?.m) + 1]
      );
    }
  } else {
    const existing = await query<Record<string, unknown>[]>(
      'SELECT * FROM sim_positions WHERE user_id = ? AND stock_code = ?',
      [userId, stockCode]
    );
    if (existing.length === 0) {
      throw new Error('持仓不足，无法卖出');
    }
    const pos = normalizePosition(existing[0]!);
    if (pos.shares < shares) {
      throw new Error('持仓不足，无法卖出');
    }

    const proceeds = amount - commission;
    await query('UPDATE sim_accounts SET cash_balance = cash_balance + ? WHERE user_id = ?', [
      proceeds,
      userId,
    ]);

    const remain = pos.shares - shares;
    if (remain === 0) {
      await query('DELETE FROM sim_positions WHERE id = ?', [pos.id]);
    } else {
      await query('UPDATE sim_positions SET shares = ? WHERE id = ?', [remain, pos.id]);
    }
  }

  await execute(
    `INSERT INTO sim_orders (user_id, stock_code, stock_name, side, shares, price, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, stockCode, stockName, side, shares, price, amount]
  );

  // 买入后自动加入自选股（已存在则忽略）
  if (side === 'buy') {
    try {
      const market =
        stockCode.startsWith('6') || stockCode.startsWith('5') ? 'SH' : 'SZ';
      await query(
        `INSERT IGNORE INTO watchlist (user_id, stock_code, stock_name, market)
         VALUES (?, ?, ?, ?)`,
        [userId, stockCode, stockName || stockCode, market]
      );
    } catch {
      /* watchlist optional */
    }
  }

  return getPortfolioSummary(userId);
}

export async function updatePortfolioOrder(
  userId: number,
  items: { stockCode: string; sortOrder: number; weight?: number }[]
) {
  for (const item of items) {
    await query(
      'UPDATE sim_positions SET sort_order = ?, weight = ? WHERE user_id = ? AND stock_code = ?',
      [item.sortOrder, item.weight ?? 0, userId, item.stockCode]
    );
  }
}

export async function resetAccount(userId: number) {
  await query('DELETE FROM sim_orders WHERE user_id = ?', [userId]);
  await query('DELETE FROM sim_positions WHERE user_id = ?', [userId]);
  await query(
    'UPDATE sim_accounts SET cash_balance = initial_cash WHERE user_id = ?',
    [userId]
  );
  return getPortfolioSummary(userId);
}
