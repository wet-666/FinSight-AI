/** SSE 单帧：与前端 fetch + ReadableStream 按 `data: {...}` 解析的契约对齐 */
export function formatSseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
