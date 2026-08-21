import type { AgentStage } from './types';

/** 从 agent_runs.stages 读回阶段列表；脏 JSON 返回空数组，避免回放接口整段 500 */
export function parseStages(raw: unknown): AgentStage[] {
  if (Array.isArray(raw)) return raw as AgentStage[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as AgentStage[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
