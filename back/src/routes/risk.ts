import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getRiskProfile, saveRiskProfile } from '../services/riskService';

const router = Router();

router.get(
  '/profile',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const profile = await getRiskProfile(req.userId!);
    res.json(success(profile));
  })
);

router.post(
  '/profile',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { answers } = req.body as { answers?: number[] };
    if (!Array.isArray(answers) || answers.length === 0) {
      res.status(400).json(error('请提交测评答案'));
      return;
    }
    try {
      const profile = await saveRiskProfile(req.userId!, answers);
      res.json(success(profile, '风险测评已保存'));
    } catch (e) {
      res.status(400).json(error(e instanceof Error ? e.message : '保存失败'));
    }
  })
);

export default router;
