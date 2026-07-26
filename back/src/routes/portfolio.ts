import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import {
  diagnosePortfolio,
  portfolioToReportPayload,
} from '../services/portfolioService';
import { createResearchReport } from '../services/reportService';

const router = Router();

router.get('/diagnose', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = await diagnosePortfolio(req.userId!);
    res.json(success(data));
  } catch (err) {
    console.error(err);
    res.status(500).json(error('组合诊断失败'));
  }
});

router.post('/diagnose/export', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const diagnosis = await diagnosePortfolio(req.userId!);
    const payload = portfolioToReportPayload(diagnosis);
    const created = await createResearchReport({
      userId: req.userId!,
      reportType: 'portfolio',
      payload,
    });
    res.json(success(created, '组合诊断报告已生成'));
  } catch (err) {
    console.error(err);
    res.status(500).json(error('导出失败'));
  }
});

export default router;
