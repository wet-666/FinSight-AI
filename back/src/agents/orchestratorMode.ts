import type { OrchestratorResult } from './types';

/**
 * 编排结束后的对外模式：
 * - demo：未配置 Key，全程模板
 * - llm：至少有一个 Agent 真正用上了模型 JSON
 * - llm_fallback：配了 Key，但三次都解析失败，回退模板（必须明示，避免静默当真话）
 */
export function resolveOrchestratorMode(
  requestedMode: 'llm' | 'demo',
  llmHits: number
): OrchestratorResult['mode'] {
  if (requestedMode === 'llm' && llmHits === 0) return 'llm_fallback';
  return requestedMode;
}
