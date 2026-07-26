import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { execute, query } from '../config/database';
import { LEGAL_DISCLAIMER } from '../agents/types';
import type { ReportType, ReportPayload } from '@shared/types/report';

export type { ReportType, ReportPayload };

const REPORT_DIR = path.join(process.cwd(), 'storage', 'reports');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function buildMarkdown(payload: ReportPayload): string {
  const lines: string[] = [
    `# ${payload.title}`,
    '',
    `> 生成时间：${new Date().toLocaleString('zh-CN')}`,
    payload.stockCode ? `> 标的：${payload.stockCode}` : '',
    '',
    '## 摘要',
    payload.summary,
    '',
  ];

  if (payload.metrics && Object.keys(payload.metrics).length) {
    lines.push('## 关键指标', '');
    for (const [k, v] of Object.entries(payload.metrics)) {
      lines.push(`- **${k}**：${v}`);
    }
    lines.push('');
  }

  for (const sec of payload.sections) {
    lines.push(`## ${sec.heading}`, '', sec.body, '');
  }

  lines.push('## 合规声明', '', payload.disclaimer || LEGAL_DISCLAIMER, '');
  return lines.filter((l) => l !== undefined).join('\n');
}

export function markdownToHtml(markdown: string, title: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const body = escaped
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- \*\*(.+?)\*\*：(.+)$/gm, '<li><strong>$1</strong>：$2</li>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 820px; margin: 40px auto; line-height: 1.7; color: #222; }
    h1 { border-bottom: 2px solid #0052d9; padding-bottom: 8px; }
    h2 { margin-top: 28px; color: #0052d9; }
    blockquote { color: #666; border-left: 3px solid #ddd; padding-left: 12px; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
  <p>${body}</p>
  <script>/* printable research memo */</script>
</body>
</html>`;
}

async function writePdf(filePath: string, payload: ReportPayload, markdown: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(18).text(payload.title, { underline: true });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`生成时间：${new Date().toLocaleString('zh-CN')}`);
    if (payload.stockCode) doc.text(`标的：${payload.stockCode}`);
    doc.moveDown();
    doc.fillColor('#000').fontSize(11).text(markdown, { align: 'left' });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function createResearchReport(params: {
  userId: number;
  reportType: ReportType;
  stockCode?: string;
  payload: ReportPayload;
}): Promise<{ id: number; title: string }> {
  ensureDir(REPORT_DIR);
  const { userId, reportType, stockCode = '', payload } = params;
  const markdown = buildMarkdown(payload);
  const html = markdownToHtml(markdown, payload.title);

  const inserted = await execute(
    `INSERT INTO research_reports
      (user_id, report_type, stock_code, title, content_json, markdown_body, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, reportType, stockCode, payload.title, JSON.stringify(payload), markdown]
  );

  let reportId = inserted.insertId;
  if (!reportId) {
    const rows = await query<{ id: number }[]>(
      `SELECT id FROM research_reports WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    reportId = rows[0]?.id;
  }

  const base = path.join(REPORT_DIR, `report_${reportId}`);
  const fileMd = `${base}.md`;
  const fileHtml = `${base}.html`;
  const filePdf = `${base}.pdf`;

  fs.writeFileSync(fileMd, markdown, 'utf-8');
  fs.writeFileSync(fileHtml, html, 'utf-8');
  try {
    await writePdf(filePdf, payload, markdown);
  } catch {
    // PDF 可选失败时仍标记 ready（MD/HTML 可用）
    fs.writeFileSync(filePdf.replace(/\.pdf$/, '.pdf.txt'), markdown, 'utf-8');
  }

  await query(
    `UPDATE research_reports
     SET status = 'ready', file_md = ?, file_html = ?, file_pdf = ?
     WHERE id = ?`,
    [fileMd, fileHtml, filePdf, reportId]
  );

  return { id: reportId, title: payload.title };
}

export async function listReports(userId: number) {
  return query(
    `SELECT id, report_type, stock_code, title, status, created_at
     FROM research_reports WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
}

export async function getReport(userId: number, id: number) {
  const rows = await query<
    {
      id: number;
      report_type: string;
      stock_code: string;
      title: string;
      markdown_body: string;
      content_json: string;
      status: string;
      file_md: string;
      file_html: string;
      file_pdf: string;
      created_at: string;
    }[]
  >(`SELECT * FROM research_reports WHERE id = ? AND user_id = ?`, [id, userId]);
  return rows[0] || null;
}

export function resolveReportFile(
  report: { file_md: string; file_html: string; file_pdf: string },
  format: 'md' | 'html' | 'pdf'
): string | null {
  const map = { md: report.file_md, html: report.file_html, pdf: report.file_pdf };
  const p = map[format];
  if (p && fs.existsSync(p)) return p;
  return null;
}
