import type { EntityId, PageQuery } from "@/types/api";

export type Decimal = string;
export type AssetType = "STOCK" | "ETF";

export interface PortfolioPosition {
  id: EntityId;
  assetType: AssetType;
  dictionaryId: EntityId;
  symbol: string;
  nameSnapshot: string;
  quantity: number;
  totalCost: Decimal;
  marketValue: Decimal;
  tradeDate: string;
  averageCost: Decimal | null;
  referencePrice: Decimal | null;
  unrealizedPnl: Decimal;
  unrealizedRate: Decimal | null;
  remark?: string | null;
}

export interface PortfolioDaily {
  id: EntityId;
  positionId: EntityId;
  tradeDate: string;
  quantity: number;
  marketValue: Decimal;
  totalCost: Decimal;
  averageCost: Decimal | null;
  referencePrice: Decimal | null;
  unrealizedPnl: Decimal;
  unrealizedRate: Decimal | null;
  remark?: string | null;
}

export interface PortfolioDailyInput {
  positionId?: EntityId;
  assetType?: AssetType;
  dictionaryId?: EntityId;
  tradeDate: string;
  quantity: number;
  marketValue: Decimal;
  totalCost: Decimal;
  remark?: string;
}

export interface PortfolioQuery extends Partial<PageQuery> {
  keyword?: string;
  assetType?: string;
  positionId?: EntityId;
  holdingOnly?: boolean;
}

export interface PortfolioInstrument {
  id: EntityId;
  assetType: AssetType;
  symbol: string;
  code: string;
  name: string;
  market: string;
}

export interface PortfolioAudit {
  id: EntityId;
  operation: string;
  targetType: string;
  targetId: EntityId;
  operationReason: string | null;
  beforeData: string | null;
  afterData: string | null;
}

export interface PortfolioPositionDetail {
  position: PortfolioPosition;
  records: PortfolioDaily[];
}

export interface PortfolioSummary {
  positionCount: number;
  holdingCount: number;
  totalCost: Decimal;
  totalMarketValue: Decimal;
  totalUnrealizedPnl: Decimal;
}

export interface PortfolioDashboard extends PortfolioSummary {
  categories: Array<PortfolioSummary & { assetType: AssetType; name: string }>;
  positions: PortfolioPosition[];
}
