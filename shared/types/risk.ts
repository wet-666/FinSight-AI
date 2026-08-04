export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

export interface RiskProfile {
  score: number;
  level: RiskLevel;
  levelLabel: string;
  answers: number[];
  /** 单票买入后持仓市值上限占组合总资产比例 */
  maxPositionWeight: number;
  /** 回测推荐参数 */
  backtestDefaults: {
    sentimentThreshold: number;
    useMa20: boolean;
  };
  hint: string;
  updatedAt?: string;
}
