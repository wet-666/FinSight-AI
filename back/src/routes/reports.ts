import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import {
  createResearchReport,
  getReport,
  listReports,
  resolveReportFile,
  type ReportPayload,
  type ReportType,
} from '../services/reportService';
import { LEGAL_DISCLAIMER } from '../agents/types';
import {
  diagnosePortfolio,
  portfolioToReportPayload,
} from '../services/portfolioService';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await listReports(req.userId!);
    res.json(success(rows));
  } catch {
    res.json(success([]));
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const report = await getReport(req.userId!, Number(req.params.id));
  if (!report) {
    res.status(404).json(error('报告不存在', 404));
    return;
  }
  res.json(success(report));
});

router.get('/:id/download/:format', authMiddleware, async (req: AuthRequest, res: Response) => {
  const format = req.params.format as 'md' | 'html' | 'pdf';
  if (!['md', 'html', 'pdf'].includes(format)) {
    res.status(400).json(error('格式仅支持 md/html/pdf'));
    return;
  }
  const report = await getReport(req.userId!, Number(req.params.id));
  if (!report) {
    res.status(404).json(error('报告不存在', 404));
    return;
  }
  const filePath = resolveReportFile(report, format);
  if (!filePath) {
    // fallback: stream markdown body
    if (format === 'md' || format === 'html') {
      const content =
        format === 'md'
          ? report.markdown_body
          : `<pre>${report.markdown_body}</pre>`;
      res.setHeader(
        'Content-Type',
        format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report_${report.id}.${format}"`
      );
      res.send(content);
      return;
    }
    res.status(404).json(error('文件尚未生成'));
    return;
  }
  res.download(filePath, `zhi_touyan_report_${report.id}.${format}`);
});

router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { reportType, stockCode, payload } = req.body as {
    reportType: ReportType;
    stockCode?: string;
    payload?: ReportPayload;
  };

  if (!reportType) {
    res.status(400).json(error('请指定 reportType'));
    return;
  }

  try {
    let finalPayload = payload;
    if (reportType === 'portfolio') {
      const diagnosis = await diagnosePortfolio(req.userId!);
      finalPayload = portfolioToReportPayload(diagnosis);
    }
    if (!finalPayload?.title || !finalPayload.summary) {
      res.status(400).json(error('payload 不完整'));
      return;
    }
    if (!finalPayload.disclaimer) finalPayload.disclaimer = LEGAL_DISCLAIMER;

    const created = await createResearchReport({
      userId: req.userId!,
      reportType,
      stockCode,
      payload: finalPayload,
    });
    res.json(success(created, '报告已生成'));
  } catch (err) {
    console.error(err);
    res.status(500).json(error('报告生成失败'));
  }
});

export default router;
