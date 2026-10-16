import type { EntityId, PageQuery } from "@/types/api";
export type Decimal = string;
export type AssetType = "STOCK" | "ETF";
export interface PortfolioPosition {
  id: EntityId;
  assetType: AssetType;
  dictionaryId: EntityId;
  symbol: string;
  nameSnapshot: string;
  currentQuantity: number;
  remainingCost: Decimal | null;
  realizedPnl: Decimal | null;
  actionCashIncome: Decimal;
  costStatus: string;
  pnlStatus: string;
  pendingActionCount: number;
  currentCycleStartTradeId: EntityId | null;
  version: number;
  lastBusinessAt?: string;
  remark?: string;
  asOf?: string;
  averageCost?: Decimal | null;
  valuationPrice?: Decimal | null;
  valuationAt?: string | null;
  valuationSource?: string | null;
  marketValue?: Decimal | null;
  unrealizedPnl?: Decimal | null;
  unrealizedRate?: Decimal | null;
  totalPnl?: Decimal | null;
  valuationStatus?: string;
  message?: string | null;
}
export interface PortfolioTrade {
  id: EntityId;
  positionId: EntityId;
  nameSnapshot: string;
  tradeType: "OPENING" | "BUY" | "SELL";
  businessDate: string;
  businessTime: string | null;
  quantity: number;
  price: Decimal | null;
  grossAmount: Decimal | null;
  openingCost: Decimal | null;
  openingUnitCost: Decimal | null;
  openingCostVerified: boolean | null;
  actualFee: Decimal | null;
  settlementAmount: Decimal | null;
  brokerReference?: BrokerReference | null;
  feeSource?: string | null;
  feeMode: string;
  cycleStartTradeId: EntityId | null;
  confirmedCycleStartTradeId: EntityId | null;
  replacesTradeId: EntityId | null;
  voidReason: string | null;
  feeDetails: string | null;
  estimatedFee: Decimal | null;
  amountDifferenceReason: string | null;
  confirmationScope: "CYCLE" | "TRADE" | null;
  confirmedNetPnl: Decimal | null;
  confirmationNote: string | null;
  confirmationStatus: string;
  basePnl: Decimal | null;
  allocatedCost: Decimal | null;
  pnlAdjustment: Decimal | null;
  finalPnl: Decimal | null;
  recordStatus: string;
  calculationStatus: string;
  remark?: string;
}
export interface TradeInput {
  positionId?: EntityId;
  assetType?: AssetType;
  dictionaryId?: EntityId;
  expectedVersion?: number;
  tradeType: "OPENING" | "BUY" | "SELL";
  businessDate: string;
  businessTime?: string;
  quantity: number;
  price?: Decimal;
  grossAmount?: Decimal;
  amountDifferenceReason?: string;
  openingCost?: Decimal;
  openingUnitCost?: Decimal;
  openingCostVerified?: boolean;
  estimatedFee?: Decimal;
  brokerReference?: BrokerReferenceInput;
  actualFee?: Decimal;
  settlementAmount?: Decimal;
  feeDetails?: string;
  confirmationScope?: "CYCLE" | "TRADE";
  confirmedNetPnl?: Decimal;
  confirmationNote?: string;
  remark?: string;
}
export interface PortfolioAction {
  taxAmount?: Decimal | null;
  remark?: string;
  id: EntityId;
  positionId: EntityId;
  actionType: string;
  businessDate: string;
  businessTime: string | null;
  cycleStartTradeId: EntityId | null;
  quantityDelta: number | null;
  costDelta: Decimal | null;
  cashIncome: Decimal | null;
  reason: string;
  evidenceNote: string | null;
  recordStatus: string;
}
export interface ActionInput {
  taxAmount?: Decimal;
  remark?: string;
  positionId: EntityId;
  expectedVersion: number;
  actionType: string;
  businessDate: string;
  businessTime?: string;
  cycleStartTradeId?: EntityId;
  quantityDelta?: number;
  costDelta?: Decimal;
  cashIncome?: Decimal;
  reason: string;
  evidenceNote?: string;
  pending: boolean;
}
export interface PortfolioValuation {
  id: EntityId;
  positionId: EntityId;
  valuationAt: string;
  valuationPrice: Decimal;
  source: string;
  recordStatus: string;
  remark?: string;
}
export interface ValuationInput {
  positionId: EntityId;
  expectedVersion: number;
  valuationAt: string;
  valuationPrice: Decimal;
  remark?: string;
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
export interface PortfolioPreview {
  canSave: boolean;
  message: string | null;
  before: PortfolioPosition | null;
  after: PortfolioPosition | null;
  trade: PortfolioTrade | null;
  suggestedGrossAmount: Decimal | null;
}
export interface PortfolioQuery extends Partial<PageQuery> {
  sortBy?: "remainingCost" | "unrealizedPnl";
  sortDirection?: "ASC" | "DESC";
  keyword?: string;
  positionId?: EntityId;
  assetType?: string;
  holdingOnly?: boolean;
  asOf?: string;
  tradeType?: string;
  recordStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  actionType?: string;
  tradeSide?: string;
  enabled?: boolean;
}
export interface VoidInput {
  id: EntityId;
  expectedVersion: number;
  reason: string;
}
export interface ReplaceInput<T> {
  id: EntityId;
  reason: string;
  replacement: T;
}
export interface PortfolioInstrument {
  id: EntityId;
  assetType: AssetType;
  symbol: string;
  code: string;
  name: string;
  market: string;
}
export interface PortfolioPositionAnalysis {
  position: PortfolioPosition;
  costEntries: Array<{
    recordId: EntityId;
    type: string;
    businessDate: string;
    businessTime: string | null;
    entrySeq: number;
    quantityDelta: number;
    costDelta: Decimal | null;
    costBalance: Decimal | null;
    quantityBalance: number;
  }>;
}
export interface PortfolioSummaryMetrics {
  status: string;
  message: string | null;
  positionCount: number;
  holdingCount: number;
  valuedHoldingCount: number;
  reliableHoldingCount: number;
  coveredHoldingCount: number;
  totalCost: Decimal | null;
  partialCost: Decimal | null;
  totalRealizedPnl: Decimal | null;
  partialRealizedPnl: Decimal | null;
  actionCashIncome: Decimal | null;
  partialMarketValue: Decimal | null;
  partialUnrealizedPnl: Decimal | null;
  totalMarketValue: Decimal | null;
  totalUnrealizedPnl: Decimal | null;
  totalPnl: Decimal | null;
  valuationCoverageRate: Decimal | null;
}
export interface PortfolioDashboard extends PortfolioSummaryMetrics {
  asOf: string;
  categories: Array<
    PortfolioSummaryMetrics & { assetType: AssetType; name: string }
  >;
  costAllocation: Array<{
    positionId: EntityId;
    assetType: AssetType;
    symbol: string;
    name: string;
    amount: Decimal;
    costStatus: string;
  }>;
  incomeItems: Array<{
    type: string;
    name: string;
    amount: Decimal | null;
    partialAmount: Decimal | null;
    status: string;
  }>;
  recentTrades: Array<{
    id: EntityId;
    positionId: EntityId;
    symbol: string;
    name: string;
    tradeType: string;
    businessDate: string;
    businessTime: string | null;
    quantity: number;
    price: Decimal | null;
    grossAmount: Decimal | null;
    feeMode: string;
    finalPnl: Decimal | null;
  }>;
}

export type PortfolioCommandContext = Pick<
  PortfolioPosition,
  | "id"
  | "assetType"
  | "dictionaryId"
  | "symbol"
  | "nameSnapshot"
  | "currentQuantity"
  | "version"
>;

export interface BrokerReferenceInput {
  costBefore?: Decimal;
  costAfter?: Decimal;
  quantityAfter?: number;
  acceptInferredFee?: boolean;
}
export interface BrokerReference {
  referenceType: "OBSERVATION" | "BUY" | "PARTIAL" | "CLOSING";
  quantityBefore: number;
  quantitySold: number;
  quantityRemaining: number;
  costBefore: Decimal | null;
  costAfter: Decimal | null;
  costBeforeTotal: Decimal | null;
  costAfterTotal: Decimal | null;
  grossAmount: Decimal;
  sellPrice: Decimal | null;
  inferredFee: Decimal | null;
  feeApplied: Decimal | null;
  feeAdjustment: Decimal | null;
  feeSource: string | null;
  referencePnl: Decimal | null;
  referenceGrossPnl: Decimal | null;
  referenceNetPnl: Decimal | null;
  calculationVersion: string;
  message: string | null;
}
