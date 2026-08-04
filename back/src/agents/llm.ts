import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { config } from '../config';

/** 创建 ChatOpenAI；对 Qwen3 思考模型关闭 thinking，避免 content 为空 */
export function getLLM(options?: { temperature?: number; maxTokens?: number }): ChatOpenAI | null {
  if (!config.openai.apiKey) return null;
  const model = config.openai.model;
  const isThinkingFamily = /qwen3/i.test(model) && !/instruct/i.test(model);
  return new ChatOpenAI({
    openAIApiKey: config.openai.apiKey,
    configuration: { baseURL: config.openai.baseURL },
    modelName: model,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? 800,
    timeout: config.openai.timeoutMs,
    ...(isThinkingFamily
      ? {
          modelKwargs: {
            enable_thinking: false,
          },
        }
      : {}),
  });
}

export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

//从模型消息中取可用文本：优先 content，兼容 reasoning_content
export function pickModelText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const msg = raw as { content?: unknown; reasoning_content?: string };
    if (typeof msg.content === 'string' && msg.content.trim()) return msg.content;
    if (Array.isArray(msg.content)) {
      const joined = msg.content
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && 'text' in p) return String((p as { text: string }).text);
          return '';
        })
        .join('');
      if (joined.trim()) return joined;
    }
    if (typeof msg.reasoning_content === 'string') return msg.reasoning_content;
  }
  return String(raw ?? '');
}

/** 带重试的 JSON 调用，失败返回 null（由 Agent 使用本地模板） */
export async function invokeLLMJson<T extends object>(params: {
  system: string;
  user: string;
  retries?: number;
}): Promise<{ data: T | null; raw: string; usedLlm: boolean }> {
  const llm = getLLM();
  if (!llm) return { data: null, raw: '', usedLlm: false };

  const retries = params.retries ?? 1;
  let lastRaw = '';

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await llm.invoke([
        new SystemMessage(params.system),
        new HumanMessage(
          i === 0
            ? params.user
            : `${params.user}\n\n请严格只输出合法 JSON 对象，不要 markdown，不要解释。`
        ),
      ]);
      lastRaw = pickModelText(res.content ?? res);
      // 部分供应商把正文放在 additional_kwargs
      if (!lastRaw.trim() && res.additional_kwargs) {
        lastRaw = pickModelText(res.additional_kwargs);
      }
      const parsed = extractJson<T>(lastRaw);
      if (parsed) return { data: parsed, raw: lastRaw, usedLlm: true };
    } catch (err) {
      console.error(`[LLM] invoke failed (attempt ${i + 1}):`, err);
      lastRaw = '';
    }
  }

  return { data: null, raw: lastRaw, usedLlm: true };
}

/** 健康检查：真实打一次极短补全 */
export async function probeLLM(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!config.openai.apiKey) {
    return { ok: false, message: '未配置 OPENAI_API_KEY，Agent 将走 demo 模式' };
  }
  const llm = getLLM({ temperature: 0, maxTokens: 32 });
  if (!llm) {
    return { ok: false, message: 'LLM 实例创建失败' };
  }
  const started = Date.now();
  try {
    const res = await llm.invoke([new HumanMessage('只回复：ok')]);
    const text = pickModelText(res.content ?? res).trim();
    const latencyMs = Date.now() - started;
    if (!text) {
      return {
        ok: false,
        message: `模型 ${config.openai.model} 返回空 content（可能是思考模型），请换 Instruct 模型或关闭 thinking`,
        latencyMs,
      };
    }
    return {
      ok: true,
      message: `LLM 可用（${config.openai.model}，${latencyMs}ms）`,
      latencyMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `LLM 探测失败: ${msg.slice(0, 160)}`,
      latencyMs: Date.now() - started,
    };
  }
}
