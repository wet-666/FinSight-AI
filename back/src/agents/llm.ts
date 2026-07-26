import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';

export function getLLM(): ChatOpenAI | null {
  if (!config.openai.apiKey) return null;
  return new ChatOpenAI({
    openAIApiKey: config.openai.apiKey,
    configuration: { baseURL: config.openai.baseURL },
    modelName: config.openai.model,
    temperature: 0.3,
  });
}

export function extractJson<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
