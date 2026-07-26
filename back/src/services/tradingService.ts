import { query } from '../config/database';
import { getStockQuote } from './marketService';
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

export async function ensureAccount(userId: number): Promise<SimAccount> {
  const rows = await query<SimAccount[]>(
    'SELECT cash_balance, initial_cash FROM sim_accounts WHERE user_id = ?',
    [userId]
  );
  if (rows.length > 0) return rows[0];

  await query(
    'INSERT INTO sim_accounts (user_id, cash_balance, initial_cash) VALUES (?, ?, ?)',
    [userId, INITIAL_CASH, INITIAL_CASH]
  );
  return { cash_balance: INITIAL_CASH, initial_cash: INITIAL_CASH };
}

export async function getPositions(userId: number): Promise<SimPosition[]> {
  return query<SimPosition[]>(
    'SELECT * FROM sim_positions WHERE user_id = ? AND shares > 0 ORDER BY sort_order ASC',
    [userId]
  );
}

export async function getOrders(userId: number, limit = 20) {
  return query(
    'SELECT * FROM sim_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
}

export async function getPortfolioSummary(userId: number) {
  const account = await ensureAccount(userId);
  const positions = await getPositions(userId);

  let marketValue = 0;
  let totalCost = 0;
  const enriched = [];

  for (const pos of positions) {
    const quote = await getStockQuote(pos.stock_code);
    const price = quote?.price ?? pos.avg_cost;
    const mv = price * pos.shares;
    const cost = pos.avg_cost * pos.shares;
    marketValue += mv;
    totalCost += cost;
    enriched.push({
      ...pos,
      currentPrice: price,
      marketValue: Math.round(mv * 100) / 100,
      profit: Math.round((mv - cost) * 100) / 100,
      profitRate: cost > 0 ? Math.round(((mv - cost) / cost) * 10000) / 100 : 0,
    });
  }

  const totalAssets = account.cash_balance + marketValue;
  const totalReturn = totalAssets - account.initial_cash;
  const totalReturnRate =
    account.initial_cash > 0
      ? Math.round((totalReturn / account.initial_cash) * 10000) / 100
      : 0;

  return {
    account,
    positions: enriched,
    marketValue: Math.round(marketValue * 100) / 100,
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnRate,
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

  const quote = await getStockQuote(stockCode);
  if (!quote) throw new Error('无法获取行情，请稍后重试');

  const price = quote.price;
  const amount = price * shares;
  const commission = Math.max(amount * COMMISSION_RATE, 5);
  const account = await ensureAccount(userId);

  if (side === 'buy') {
    const totalCost = amount + commission;
    if (account.cash_balance < totalCost) {
      throw new Error(`可用资金不足，需要 ¥${totalCost.toFixed(2)}`);
    }

    await query('UPDATE sim_accounts SET cash_balance = cash_balance - ? WHERE user_id = ?', [
      totalCost,
      userId,
    ]);

    const existing = await query<SimPosition[]>(
      'SELECT * FROM sim_positions WHERE user_id = ? AND stock_code = ?',
      [userId, stockCode]
    );

    if (existing.length > 0) {
      const pos = existing[0];
      const newShares = pos.shares + shares;
      const newAvg =
        (pos.avg_cost * pos.shares + price * shares) / newShares;
      await query(
        'UPDATE sim_positions SET shares = ?, avg_cost = ?, stock_name = ? WHERE id = ?',
        [newShares, newAvg, stockName, pos.id]
      );
    } else {
      const maxOrder = await query<{ m: number }[]>(
        'SELECT COALESCE(MAX(sort_order), 0) as m FROM sim_positions WHERE user_id = ?',
        [userId]
      );
      await query(
        `INSERT INTO sim_positions (user_id, stock_code, stock_name, shares, avg_cost, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, stockCode, stockName, shares, price, (maxOrder[0]?.m ?? 0) + 1]
      );
    }
  } else {
    const existing = await query<SimPosition[]>(
      'SELECT * FROM sim_positions WHERE user_id = ? AND stock_code = ?',
      [userId, stockCode]
    );
    if (existing.length === 0 || existing[0].shares < shares) {
      throw new Error('持仓不足，无法卖出');
    }

    const pos = existing[0];
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

  await query(
    `INSERT INTO sim_orders (user_id, stock_code, stock_name, side, shares, price, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, stockCode, stockName, side, shares, price, amount]
  );

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
