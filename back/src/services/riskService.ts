import { query } from '../config/database';
import type { RiskLevel, RiskProfile } from '@shared/types/risk';

const LEVEL_META: Record<
  RiskLevel,
  {
    label: string;
    maxPositionWeight: number;
    sentimentThreshold: number;
    useMa20: boolean;
    hint: string;
  }
> = {
  conservative: {
    label: '保守型',
    maxPositionWeight: 0.2,
    sentimentThreshold: 0.4,
    useMa20: true,
    hint: '建议单票仓位不超过总资产 20%，回测提高情绪门槛并开启 MA20，优先学习稳健策略。',
  },
  moderate: {
    label: '稳健型',
    maxPositionWeight: 0.35,
    sentimentThreshold: 0.2,
    useMa20: true,
    hint: '建议单票仓位不超过总资产 35%，可结合舆情与均线做均衡模拟。',
  },
  aggressive: {
    label: '积极型',
    maxPositionWeight: 0.5,
    sentimentThreshold: 0.1,
    useMa20: false,
    hint: '建议单票仓位不超过总资产 50%，可尝试更灵活参数，但仍需注意模拟仓位控制。',
  },
};

export function scoreToLevel(score: number): RiskLevel {
  if (score <= 8) return 'conservative';
  if (score <= 12) return 'moderate';
  return 'aggressive';
}

export function buildRiskProfile(
  score: number,
  answers: number[],
  updatedAt?: string
): RiskProfile {
  const level = scoreToLevel(score);
  const meta = LEVEL_META[level];
  return {
    score,
    level,
    levelLabel: meta.label,
    answers,
    maxPositionWeight: meta.maxPositionWeight,
    backtestDefaults: {
      sentimentThreshold: meta.sentimentThreshold,
      useMa20: meta.useMa20,
    },
    hint: meta.hint,
    updatedAt,
  };
}

function parseAnswers(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getRiskProfile(userId: number): Promise<RiskProfile | null> {
  const rows = await query<
    { score: number; level: RiskLevel; answers: unknown; updated_at: string | Date }[]
  >('SELECT score, level, answers, updated_at FROM risk_profiles WHERE user_id = ?', [userId]);
  if (!rows.length) return null;
  const row = rows[0]!;
  return buildRiskProfile(
    Number(row.score),
    parseAnswers(row.answers),
    row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  );
}

export async function saveRiskProfile(
  userId: number,
  answers: number[]
): Promise<RiskProfile> {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('请完成全部题目');
  }
  const score = answers.reduce((a, b) => a + Number(b || 0), 0);
  const level = scoreToLevel(score);

  await query(
    `INSERT INTO risk_profiles (user_id, score, level, answers)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), level = VALUES(level), answers = VALUES(answers)`,
    [userId, score, level, JSON.stringify(answers)]
  );

  return buildRiskProfile(score, answers, new Date().toISOString());
}

/** 无测评时的默认仓位上限（偏稳健） */
export function defaultMaxPositionWeight(): number {
  return LEVEL_META.moderate.maxPositionWeight;
}
