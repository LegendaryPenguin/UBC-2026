export const USDC_DECIMALS = 6;
export const USDC_SCALE = 1_000_000n;

export type DataMode = "live" | "replay" | "synthetic";
export type Freshness = "fresh" | "stale" | "unavailable" | "replay" | "synthetic";
export type MarketStatus =
  | "approved"
  | "active"
  | "closed"
  | "under_review"
  | "settled"
  | "invalid"
  | "unknown";

export type ViewTemplate = "binary" | "directional" | "range" | "outside" | "stepped";
export type Direction = "yes" | "no";

export interface SourceEvent {
  id: string;
  ticker: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  category: string;
  status: MarketStatus;
  expiryDate: string | null;
  effectiveDate: string | null;
  payloadHash: string;
  fetchedAt: string;
  sourceAgency: string | null;
  sourceIndex: string | null;
}

export interface SourceContract {
  id: string;
  instrumentSymbol: string;
  eventId: string;
  ticker: string;
  label: string;
  description?: string | null;
  termsUrl: string | null;
  source?: string | null;
  strike?: { value: string | null; type: string | null; availableAt: string | null } | null;
  expiryDate: string | null;
  effectiveDate: string | null;
  status: MarketStatus;
  resolutionSide: "yes" | "no" | null;
  resolvedAt: string | null;
  bid: string | null;
  ask: string | null;
  noBid?: string | null;
  noAsk?: string | null;
  lastTrade: string | null;
  priceHistory?: PricePoint[] | null;
  orderBook?: MarketDepthSnapshot | null;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface MarketDepthSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  receivedAt: string;
  sourceTime: string | null;
}

export interface PricePoint {
  timestamp: string;
  price: string;
}

export interface QuoteSnapshot {
  instrumentSymbol: string;
  bid: string | null;
  ask: string | null;
  lastTrade: string | null;
  sourceTime: string | null;
  receivedTime: string;
  freshness: Freshness;
}

export interface Predicate {
  id: string;
  contractId: string;
  instrumentSymbol: string;
  label: string;
  kind: "gte";
  threshold: number;
  unit: string;
}

export interface Scenario {
  id: string;
  index: number;
  label: string;
  detail: string;
  minInclusive: number | null;
  maxExclusive: number | null;
  predicateYes: Record<string, boolean>;
}

export interface MarketFamily {
  id: string;
  slug: string;
  version: string;
  mode: DataMode;
  title: string;
  question: string;
  observationTime: string | null;
  sourceEvent: SourceEvent;
  contracts: SourceContract[];
  predicates: Predicate[];
  scenarios: Scenario[];
  closeTime: string | null;
  longstopTime: string | null;
  familyHash: string;
  quotesAvailable: boolean;
  freshness: Freshness;
  fetchedAt: string;
}

export interface ThesisRevision {
  id: string;
  title?: string;
  archived?: boolean;
  topicSlug: string;
  familyId: string;
  familyVersion: string;
  template: ViewTemplate;
  direction: Direction | null;
  lowerThreshold: number | null;
  upperThreshold: number | null;
  rationale: string;
  invalidation: string;
  evidenceIds: string[];
  status: "draft" | "confirmed" | "quoted";
  revision: number;
  createdAt: string;
  updatedAt: string;
  savedConstruction?: {
    basket: { contractId: string; side: Direction; payoutAmount: string; enabled: boolean }[];
    max: string;
    thesisRevision: number;
    familyVersion: string;
    savedAt: string;
  } | null;
}

export type ThesisSnapshot = Pick<
  ThesisRevision,
  | "topicSlug"
  | "familyId"
  | "familyVersion"
  | "template"
  | "direction"
  | "lowerThreshold"
  | "upperThreshold"
  | "rationale"
  | "invalidation"
  | "evidenceIds"
  | "status"
>;

export interface ThesisHistoryRecord {
  id: string;
  thesisId: string;
  accountId: string;
  revision: number;
  recordedAt: string;
  reason: string;
  snapshot: ThesisSnapshot;
  reflection?: string;
  reflectionUpdatedAt?: string;
}

export interface PayoffRow {
  scenarioId: string;
  label: string;
  detail: string;
  payout: bigint;
}

export interface PayoffSpec {
  familyId: string;
  familyVersion: string;
  familyHash: string;
  template: ViewTemplate;
  maxPayout: bigint;
  rows: PayoffRow[];
  payoffHash: string;
  sourceContractIds: string[];
  notes: string[];
}

export interface ComparisonSet {
  custom: PayoffSpec;
  ticket: PayoffSpec | null;
  twoTicket: PayoffSpec | null;
}

export type QuoteStatus =
  | "requested"
  | "available"
  | "accepted"
  | "expired"
  | "invalidated"
  | "unavailable";

export interface SignedQuote {
  id: string;
  status: QuoteStatus;
  maker: `0x${string}`;
  taker: `0x${string}`;
  escrow: `0x${string}`;
  token: `0x${string}`;
  familyHash: `0x${string}`;
  payoffHash: `0x${string}`;
  maxPayout: string;
  premium: string;
  fee: string;
  nonce: string;
  issuedAt: number;
  deadline: number;
  chainId: number;
  longstop: number;
  finalizationDelay: number;
  signature: `0x${string}`;
  payouts: string[];
  scenarioLabels: string[];
  unavailableReason?: string;
}

export interface EvidenceItem {
  id: string;
  stance?: "supports" | "challenges" | "context";
  url: string;
  publisher: string;
  title: string;
  publishedAt: string;
  retrievedAt: string;
  excerpt: string;
  mode: DataMode;
}

export const ERROR_CODES = [
  "UNSUPPORTED_FAMILY",
  "INCOMPATIBLE_RULES",
  "STALE_DATA",
  "MARKET_CLOSED",
  "QUOTE_EXPIRED",
  "INSUFFICIENT_MAKER_COLLATERAL",
  "INSUFFICIENT_USER_BALANCE",
  "WRONG_CHAIN",
  "SPEC_CHANGED",
  "SOURCE_UNRESOLVED",
  "SOURCE_INCONSISTENT",
  "ALREADY_CLAIMED",
  "INDEXER_BEHIND",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface PositionRecord {
  id: string;
  accountId: string;
  thesisId: string;
  quoteId: string;
  mode: string;
  chainPositionId: string | null;
  txHash: string | null;
  status: "pending" | "open" | "resolved" | "voided" | "claimed" | "exited";
  scenarioIndex: number | null;
  payouts: string[];
  labels: string[];
  maxPayout: string;
  premium: string;
  fee: string;
  longstop: number;
  finalizationDelay: number;
  familyId: string;
  topicSlug: string;
  sourceTicker?: string;
  sourceContractIds?: string[];
  createdAt: string;
}

export interface AlertRule {
  id: string;
  accountId: string;
  name: string;
  type: string;
  topicSlug: string | null;
  positionId: string | null;
  threshold: string;
  channel: "inbox";
  paused: boolean;
  createdAt: string;
  triggeredAt?: string;
}

export interface NotificationItem {
  id: string;
  accountId: string;
  title: string;
  body: string;
  href: string;
  category: "trading" | "research" | "security";
  read: boolean;
  createdAt: string;
}
