import type { EntityId, PageQuery } from "@/types/api";
export type Decimal = string;
export type AssetType = "STOCK" | "ETF";
export type SnapshotOperation = "INITIAL" | "BUY" | "SELL" | "ADJUST";
export interface PortfolioPosition {
  id: EntityId;
  assetType: AssetType;
  dictionaryId: EntityId;
  symbol: string;
  nameSnapshot: string;
  currentQuantity: number;
  totalCost: Decimal | null;
  marketValue: Decimal | null;
  snapshotAt: string | null;
  averageCost: Decimal | null;
  referencePrice: Decimal | null;
  unrealizedPnl: Decimal | null;
  unrealizedRate: Decimal | null;
  version: number;
  remark?: string | null;
  snapshotComplete: boolean;
}
export interface PortfolioSnapshot {
  id: EntityId;
  positionId: EntityId;
  snapshotAt: string;
  operationType: SnapshotOperation;
  quantity: number;
  marketValue: Decimal;
  totalCost: Decimal;
  unrealizedPnl: Decimal;
  unrealizedRate: Decimal | null;
  averageCost: Decimal | null;
  referencePrice: Decimal | null;
  remark?: string | null;
}
export interface SnapshotInput {
  positionId?: EntityId;
  expectedVersion?: number;
  assetType?: AssetType;
  dictionaryId?: EntityId;
  snapshotAt: string;
  operationType: SnapshotOperation;
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
export interface PortfolioPositionAnalysis {
  position: PortfolioPosition;
  snapshots: PortfolioSnapshot[];
}
export interface PortfolioSummary {
  positionCount: number;
  holdingCount: number;
  completePositionCount: number;
  pendingPositionCount: number;
  totalCost: Decimal | null;
  totalMarketValue: Decimal | null;
  totalUnrealizedPnl: Decimal | null;
}
export interface PortfolioDashboard extends PortfolioSummary {
  categories: Array<PortfolioSummary & { assetType: AssetType; name: string }>;
  positions: PortfolioPosition[];
}
