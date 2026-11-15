import fs from "node:fs";
import path from "node:path";
import type {
  AlertRule,
  NotificationItem,
  PositionRecord,
  SignedQuote,
  ThesisHistoryRecord,
  ThesisRevision,
} from "@/lib/domain/types";

export type AppMode = "research" | "paper" | "live" | "hackathon";

export interface Account {
  id: string;
  email: string;
  handle: string;
  name: string;
  createdAt: string;
  timezone: string;
  displayCurrency: string;
  density: "beginner" | "compact";
  onboardingComplete: boolean;
  interests: string[];
  wallet: string | null;
  closed: boolean;
}

export interface Session {
  id: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Watchlist {
  id: string;
  accountId: string;
  name: string;
  slugs: string[];
  notes: string;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  type: string;
  status: "pending" | "confirmed" | "failed" | "unknown";
  hash: string | null;
  amount: string;
  unit: string;
  related: string | null;
  error: string | null;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  accountId: string;
  thesisId: string;
  positionId: string | null;
  snapshot: unknown;
  reflection: string;
  tags: string[];
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  accountId: string;
  category: string;
  body: string;
  status: "open" | "closed";
  createdAt: string;
  messages: { at: string; from: string; text: string }[];
}

export interface Publication {
  id: string;
  accountId: string;
  thesisId: string;
  token: string;
  includeRationale: boolean;
  access: "unlisted" | "public";
  createdAt: string;
  snapshot?: { topicSlug: string; rationale?: string };
}

export interface Comment {
  id: string;
  thesisId: string;
  accountId: string;
  text: string;
  createdAt: string;
}

export interface FundingIntent {
  id: string;
  accountId: string;
  route: string;
  amount: string;
  status: "awaiting_transfer" | "detected" | "unavailable";
  createdAt: string;
}

export interface VenueOrder {
  id: string;
  accountId: string;
  symbol: string;
  side: string;
  status: "blocked";
  reason: string;
  createdAt: string;
}

export interface GeminiConnection {
  accountId: string;
  clientId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  scopes: string[];
  expiresAt: string;
  connectedAt: string;
  updatedAt: string;
}

export interface GeminiOrderIntent {
  id: string;
  accountId: string;
  thesisId?: string;
  symbol: string;
  ticker: string;
  side: "buy" | "sell";
  outcome: "yes" | "no";
  quantity: string;
  price: string;
  status: "submitting" | "accepted" | "rejected" | "unknown";
  venueOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  message: string;
}

export interface ExportJob {
  id: string;
  accountId: string;
  kind: string;
  status: "ready";
  createdAt: string;
  href: string;
}

export interface ResolutionReport {
  id: string;
  positionId: string;
  action: "proposed" | "corrected" | "finalized" | "voided";
  ticker: string;
  sourceEventId: string;
  sourceFetchedAt: string | null;
  payloadHash: string | null;
  evidenceHash: string | null;
  scenarioIndex: number | null;
  scenarioLabel: string | null;
  transactionHash: string | null;
  createdAt: string;
  sourceSnapshot?: unknown;
}

export interface MakerPolicy {
  spreadBps: number;
  paused: boolean;
  familyCaps: Record<string, string>;
}

export interface StoreShape {
  accounts: Account[];
  sessions: Session[];
  codes: { email: string; code: string; expiresAt: string }[];
  theses: ThesisRevision[];
  thesisHistory: ThesisHistoryRecord[];
  watchlists: Watchlist[];
  alerts: AlertRule[];
  notifications: NotificationItem[];
  quotes: (SignedQuote & { thesisId?: string; accountId?: string; mode?: string; recordedScenarioIndex?: number })[];
  positions: PositionRecord[];
  transactions: TransactionRecord[];
  journals: JournalEntry[];
  tickets: SupportTicket[];
  publications: Publication[];
  comments: Comment[];
  funding: FundingIntent[];
  orders: VenueOrder[];
  geminiConnections: GeminiConnection[];
  geminiOrderIntents: GeminiOrderIntent[];
  exports: ExportJob[];
  resolutionReports: ResolutionReport[];
  streamNonces: { nonce: string; receivedAt: string }[];
  streamEvents: { key: string; transactionHash: string; eventName: string; positionId: string; at: string }[];
  maker: MakerPolicy;
  nonce: number;
  incidents: { id: string; title: string; body: string; at: string; state: string }[];
}

const FILE = path.join(process.cwd(), ".data", "store.json");

function empty(): StoreShape {
  return {
    accounts: [],
    sessions: [],
    codes: [],
    theses: [],
    thesisHistory: [],
    watchlists: [],
    alerts: [],
    notifications: [],
    quotes: [],
    positions: [],
    transactions: [],
    journals: [],
    tickets: [],
    publications: [],
    comments: [],
    funding: [],
    orders: [],
    geminiConnections: [],
    geminiOrderIntents: [],
    exports: [],
    resolutionReports: [],
    streamNonces: [],
    streamEvents: [],
    maker: { spreadBps: 400, paused: false, familyCaps: {} },
    nonce: 1,
    incidents: [],
  };
}

let mem: StoreShape | null = null;

function load(): StoreShape {
  if (mem) return mem;
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const stored = JSON.parse(raw) as Partial<StoreShape>;
    const defaults = empty();
    mem = {
      ...defaults,
      ...stored,
      maker: { ...defaults.maker, ...(stored.maker || {}) },
      thesisHistory: stored.thesisHistory || [],
      geminiConnections: stored.geminiConnections || [],
      geminiOrderIntents: stored.geminiOrderIntents || [],
      resolutionReports: stored.resolutionReports || [],
      streamNonces: stored.streamNonces || [],
      streamEvents: stored.streamEvents || [],
    };
  } catch {
    mem = empty();
  }
  return mem;
}

function save(next: StoreShape) {
  mem = next;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
}

export function mutate<T>(fn: (s: StoreShape) => T): T {
  const s = load();
  const result = fn(s);
  save(s);
  return result;
}

export function readStore(): StoreShape {
  return load();
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
