import type {
  AlertRule,
  NotificationItem,
  PositionRecord,
  SignedQuote,
  ThesisHistoryRecord,
  ThesisRevision,
} from "@/lib/domain/types";
import { legacyJsonPath, readKv, readLegacyJsonFile, writeKv } from "@/lib/server/db";

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
  googleId?: string | null;
  authProvider?: "email" | "google";
  avatarUrl?: string | null;
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

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  action?: { type: string; label: string; href?: string };
  marketOptions?: { slug: string; title: string; contract?: string; eventTicker?: string }[];
}

export interface ConversationRecord {
  id: string;
  accountId: string;
  kind: "general" | "thesis";
  thesisId: string | null;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  summary?: string;
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
  conversations: ConversationRecord[];
  exports: ExportJob[];
  resolutionReports: ResolutionReport[];
  streamNonces: { nonce: string; receivedAt: string }[];
  streamEvents: { key: string; transactionHash: string; eventName: string; positionId: string; at: string }[];
  maker: MakerPolicy;
  nonce: number;
  incidents: { id: string; title: string; body: string; at: string; state: string }[];
}

const STORE_KEY = "app_store_v1";

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
    conversations: [],
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

function hydrate(raw: string | null): StoreShape {
  if (!raw) return empty();
  try {
    const stored = JSON.parse(raw) as Partial<StoreShape>;
    const defaults = empty();
    return {
      ...defaults,
      ...stored,
      maker: { ...defaults.maker, ...(stored.maker || {}) },
      thesisHistory: stored.thesisHistory || [],
      geminiConnections: stored.geminiConnections || [],
      geminiOrderIntents: stored.geminiOrderIntents || [],
      conversations: stored.conversations || [],
      resolutionReports: stored.resolutionReports || [],
      streamNonces: stored.streamNonces || [],
      streamEvents: stored.streamEvents || [],
      accounts: (stored.accounts || []).map((account) => ({
        ...account,
        googleId: account.googleId ?? null,
        authProvider: account.authProvider ?? (account.googleId ? "google" : "email"),
        avatarUrl: account.avatarUrl ?? null,
      })),
    };
  } catch {
    return empty();
  }
}

function load(): StoreShape {
  if (mem) return mem;
  const fromDb = readKv(STORE_KEY);
  if (fromDb) {
    mem = hydrate(fromDb);
    return mem;
  }
  const legacy = readLegacyJsonFile();
  mem = hydrate(legacy);
  if (legacy) writeKv(STORE_KEY, JSON.stringify(mem));
  return mem;
}

function save(next: StoreShape) {
  mem = next;
  writeKv(STORE_KEY, JSON.stringify(next));
}

export function storeBackend() {
  load();
  return { kind: "sqlite" as const, legacyJson: legacyJsonPath() };
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

export function migrateGuestData(guestId: string, accountId: string): number {
  if (!/^guest_[a-f0-9-]{36}$/.test(guestId) || !accountId) return 0;
  return mutate((store) => {
    const collections: { accountId?: string }[][] = [
      store.theses as (ThesisRevision & { accountId?: string })[],
      store.thesisHistory,
      store.watchlists,
      store.alerts,
      store.notifications,
      store.quotes,
      store.positions,
      store.transactions,
      store.journals,
      store.tickets,
      store.publications,
      store.comments,
      store.funding,
      store.orders,
      store.geminiOrderIntents,
      store.conversations,
      store.exports,
    ];
    let moved = 0;
    for (const records of collections) {
      for (const record of records) {
        if (record.accountId === guestId) {
          record.accountId = accountId;
          moved += 1;
        }
      }
    }
    return moved;
  });
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
