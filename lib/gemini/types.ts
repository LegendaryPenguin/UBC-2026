export type GeminiStatus =
  | "approved"
  | "active"
  | "closed"
  | "under_review"
  | "settled"
  | "invalid";

export interface GeminiPrices {
  buy?: { yes?: string; no?: string };
  sell?: { yes?: string; no?: string };
  bestBid?: string;
  bestAsk?: string;
  lastTradePrice?: string;
}

export interface GeminiPricePoint {
  timestamp: string;
  price: string;
}

export interface GeminiOrderbookLevel {
  side?: "buy" | "sell";
  price: string;
  quantity: string;
}

export interface GeminiOrderbook {
  bids?: GeminiOrderbookLevel[];
  asks?: GeminiOrderbookLevel[];
}

export interface GeminiContract {
  id: string;
  label: string;
  abbreviatedName?: string | null;
  description?: unknown;
  ticker?: string;
  instrumentSymbol?: string;
  status?: string;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  resolutionSide?: string | null;
  resolvedAt?: string | null;
  termsAndConditionsUrl?: string | null;
  source?: string | null;
  settlementValue?: string | null;
  marketState?: string | null;
  quantityMinimum?: string | null;
  quantityIncrement?: string | null;
  priceMinimum?: string | null;
  priceIncrement?: string | null;
  strike?: { value?: string | null; type?: string | null; availableAt?: string | null } | null;
  prices?: GeminiPrices | null;
  priceHistory?: GeminiPricePoint[] | null;
}

export interface GeminiEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string | null;
  category?: string;
  ticker: string;
  status: string;
  type?: string;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  startTime?: string | null;
  resolvedAt?: string | null;
  volume?: string | null;
  liquidity?: string | null;
  template?: string | null;
  source?: string | null;
  settlement?: { value?: string | null } | null;
  termsLink?: string | null;
  sourceDetails?: { agency?: string; index?: string } | null;
  contractOrderbooks?: Record<string, GeminiOrderbook> | null;
  contracts?: GeminiContract[];
  events?: GeminiEvent[];
}

export interface GeminiListResponse {
  data: GeminiEvent[];
  pagination?: { limit: number; offset: number; total: number };
}

export type GeminiCollection = "events" | "events/upcoming" | "events/recently-settled";

export interface GeminiListParams {
  status?: GeminiStatus | GeminiStatus[];
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function cleanGeminiRichText(text: string): string {
  return text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1").replace(/\s+/g, " ").trim();
}

export function geminiRichText(value: unknown): string {
  if (typeof value === "string") return cleanGeminiRichText(value);
  if (Array.isArray(value)) return cleanGeminiRichText(value.map(geminiRichText).filter(Boolean).join(" "));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") return cleanGeminiRichText(record.value);
    return cleanGeminiRichText([record.text, record.content, record.children].map(geminiRichText).filter(Boolean).join(" "));
  }
  return "";
}

export function flattenEvents(events: GeminiEvent[]): GeminiEvent[] {
  const result: GeminiEvent[] = [];
  const seen = new Set<string>();
  const visit = (event: GeminiEvent) => {
    const key = event.id || event.ticker;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(event);
    for (const child of event.events ?? []) visit(child);
  };
  for (const event of events) visit(event);
  return result;
}

export function geminiBinaryTopicSlug(ticker: string, contractId: string) {
  const slugPart = (value: string, max: number) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-+$/g, "");
  return `gm-${slugPart(ticker, 34)}-${slugPart(contractId, 38)}`.slice(0, 79).replace(/-+$/g, "");
}
