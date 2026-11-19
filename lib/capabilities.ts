import { geminiApiHealth } from "@/lib/gemini/client";

export type CapabilityState = "available" | "unavailable" | "degraded" | "unqualified";

export interface Capability {
  id: string;
  label: string;
  state: CapabilityState;
  reason: string;
}

export function capabilities(): Record<string, Capability> {
  const escrow = Boolean(process.env.NEXT_PUBLIC_ESCROW);
  const maker = Boolean(process.env.MAKER_PRIVATE_KEY);
  const eleven = Boolean(process.env.ELEVENLABS_API_KEY);
  const elevenAgent = eleven && Boolean(process.env.ELEVENLABS_AGENT_ID);
  const grok = Boolean(process.env.XAI_API_KEY);
  const qn = Boolean(process.env.QUICKNODE_STREAMS_SECRET);
  const geminiTradeEnabled = process.env.GEMINI_TRADE_ENABLED === "true";
  const geminiTradeQualified = process.env.GEMINI_TRADE_QUALIFIED === "true";
  const circle = Boolean(process.env.CIRCLE_API_KEY);
  return {
    escrow: {
      id: "escrow",
      label: "Arc escrow",
      state: escrow ? "available" : "unavailable",
      reason: escrow ? "Contract address configured" : "NEXT_PUBLIC_ESCROW is empty. Live acceptance is disabled.",
    },
    maker: {
      id: "maker",
      label: "Firm quotes",
      state: escrow && maker ? "available" : "unavailable",
      reason: maker ? "Maker key present" : "MAKER_PRIVATE_KEY is not set.",
    },
    voice: {
      id: "voice",
      label: "ElevenLabs voice",
      state: eleven ? "available" : "unavailable",
      reason: eleven ? "API key present" : "ELEVENLABS_API_KEY is not set. Use text instead.",
    },
    realtimeVoice: {
      id: "realtimeVoice",
      label: "ElevenLabs realtime agent",
      state: elevenAgent ? "available" : "unavailable",
      reason: elevenAgent ? "Private WebRTC agent configured" : "ELEVENLABS_AGENT_ID is not set. Push-to-talk and text remain available.",
    },
    grok: {
      id: "grok",
      label: "Grok research",
      state: grok ? "available" : "degraded",
      reason: grok ? "xAI key present" : "XAI_API_KEY missing. Local research prompts still run.",
    },
    streams: {
      id: "streams",
      label: "QuickNode Streams",
      state: qn ? "available" : "unavailable",
      reason: qn ? "Webhook secret present" : "QUICKNODE_STREAMS_SECRET is not set. Direct RPC remains the claim path.",
    },
    geminiTrade: {
      id: "geminiTrade",
      label: "Native Gemini orders",
      state: !geminiTradeQualified ? "unqualified" : geminiTradeEnabled ? "available" : "unavailable",
      reason: !geminiTradeQualified
        ? "Native order submission is disabled until a sandbox order, status lookup, and position/fill retrieval have been verified. Market data and paper execution remain available."
        : geminiTradeEnabled
          ? "The verified Gemini sandbox order path is enabled."
          : "The sandbox flow is qualified, but order submission is disabled by GEMINI_TRADE_ENABLED.",
    },
    circle: {
      id: "circle",
      label: "Circle funding",
      state: circle ? "unqualified" : "unavailable",
      reason: "No fiat or CCTP provider is wired. Direct Arc USDC transfer is the supported route.",
    },
  };
}

export function statusSnapshot() {
  const caps = capabilities();
  const gemini = geminiApiHealth();
  return {
    updatedAt: new Date().toISOString(),
    services: [
      { id: "gemini", label: "Gemini prediction markets", state: gemini.state, note: gemini.note },
      { id: "geminiTrade", label: "Gemini native orders", state: caps.geminiTrade.state, note: caps.geminiTrade.reason },
      { id: "research", label: "Research model", state: caps.grok.state, note: caps.grok.reason },
      { id: "voice", label: "Voice", state: caps.voice.state, note: caps.voice.reason },
      { id: "realtimeVoice", label: "Realtime voice", state: caps.realtimeVoice.state, note: caps.realtimeVoice.reason },
      { id: "quotes", label: "Quote service", state: caps.maker.state, note: caps.maker.reason },
      { id: "arc", label: "Arc RPC", state: "available" as const, note: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io" },
      { id: "indexer", label: "Stream indexer", state: caps.streams.state, note: caps.streams.reason },
      { id: "funding", label: "Funding providers", state: caps.circle.state, note: caps.circle.reason },
      { id: "notifications", label: "Notifications", state: "available" as const, note: "In-app inbox" },
    ],
  };
}
