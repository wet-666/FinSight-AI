import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  getPortfolioSummary,
  placeOrder,
  getOrders,
  updatePortfolioOrder,
  resetAccount,
} from '../services/tradingService';

const router = Router();

router.get(
  '/portfolio',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await getPortfolioSummary(req.userId!);
    res.json(success(data));
  })
);

router.post(
  '/order',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { stockCode, stockName, side, shares } = req.body;
    if (!stockCode || !side || !shares) {
      res.status(400).json(error('参数不完整'));
      return;
    }
    try {
      const data = await placeOrder(req.userId!, {
        stockCode,
        stockName: stockName || stockCode,
        side,
        shares: Number(shares),
      });
      res.json(success(data, side === 'buy' ? '买入成功' : '卖出成功'));
    } catch (e) {
      res.status(400).json(error(e instanceof Error ? e.message : '交易失败'));
    }
  })
);

router.get(
  '/orders',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orders = await getOrders(req.userId!);
    res.json(success(orders));
  })
);

router.put(
  '/portfolio/order',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json(error('参数错误'));
      return;
    }
    await updatePortfolioOrder(req.userId!, items);
    const data = await getPortfolioSummary(req.userId!);
    res.json(success(data, '组合顺序已更新'));
  })
);

router.post(
  '/reset',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await resetAccount(req.userId!);
    res.json(success(data, '模拟账户已重置为100万'));
  })
);

export default router;
