export interface PortfolioDiagnosis {
  empty?: boolean;
  message?: string;
  totalValue?: number;
  positionCount?: number;
  concentration?: number;
  sentimentExposure?: number;
  sentimentLabel?: string;
  industryWeights?: { industry: string; weight: number }[];
  radar?: {
    concentration: number;
    diversification: number;
    sentiment: number;
    liquidity: number;
  };
  risks?: string[];
  suggestions?: string[];
  disclaimer?: string;
}
