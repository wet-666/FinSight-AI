import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { generateOutlook, getOutlookHistory, LEGAL_DISCLAIMER } from '../services/outlookService';

const router = Router();

router.get('/disclaimer', (_req, res) => {
  res.json(success({ text: LEGAL_DISCLAIMER }));
});

router.post(
  '/generate',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { stockCode, stockName, horizonDays = 30 } = req.body;
    if (!stockCode) {
      res.status(400).json(error('请选择股票'));
      return;
    }
    const days = [7, 30, 90].includes(Number(horizonDays)) ? Number(horizonDays) : 30;
    const result = await generateOutlook(req.userId!, stockCode, stockName, days);
    res.json(success(result));
  })
);

router.get(
  '/history',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const history = await getOutlookHistory(req.userId!);
    res.json(success(history));
  })
);

export default router;
