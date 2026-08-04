/**
 * 页面展示用：把常见 Markdown 记号转成可读 HTML。
 * 导出报告仍走后端 markdownToHtml，不受影响。
 */
export function formatAiText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = String(raw);

  // 先转义，避免原始 HTML 注入
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 去掉单独成行的 --- / ***
  text = text.replace(/^\s*([-*_]){3,}\s*$/gm, '');

  // 标题 ## / ### → 加粗行
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>');

  // **bold** / __bold__
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // 行内 *italic* / _italic_
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

  // 残留星号清理
  text = text.replace(/\*/g, '');

  // 无序列表
  text = text.replace(/^\s*[-•]\s+(.+)$/gm, '• $1');

  // 换行
  text = text.replace(/\n/g, '<br/>');

  return text;
}

/** 纯文本场景：去掉 markdown 记号 */
export function stripAiMarkdown(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\*/g, '')
    .trim();
}
