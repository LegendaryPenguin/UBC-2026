import { createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createPublicClient, http, parseEventLogs, type Hash, type Log } from "viem";
import { arcTestnet, publicChainId, publicEscrow } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow/abi";
import { fail, ok } from "@/lib/server/http";
import { mutate, readStore, uid } from "@/lib/server/store";
import type { PositionRecord, SignedQuote } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WIRE_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io";
const arcClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

type CandidateLog = {
  address: string;
  data: string;
  topics: string[];
  transactionHash: Hash;
  logIndex: string | null;
};
type ChainPosition = readonly [string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, number, number, bigint, bigint, number, number, bigint, string];
type EventEvidence = {
  key: string;
  transactionHash: Hash;
  eventName: string;
  positionId: bigint;
  scenarioIndex?: number;
  evidenceHash?: string;
  actor?: string;
  sender: string;
};

async function readBoundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_WIRE_BYTES) {
      await reader.cancel();
      throw new Error("Payload exceeds the 5 MB limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

function headerValue(record: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
}

function collectCandidateLogs(value: unknown, inheritedTx = "", result: CandidateLog[] = [], seen = new Set<object>()): CandidateLog[] {
  if (Array.isArray(value)) {
    for (const child of value) collectCandidateLogs(child, inheritedTx, result, seen);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  if (seen.has(value)) return result;
  seen.add(value);
  const object = value as Record<string, unknown>;
  const txHash = headerValue(object, ["transactionHash", "transaction_hash", "txHash", "tx_hash"]) || inheritedTx;
  const address = headerValue(object, ["address", "contractAddress", "contract_address"]);
  const data = headerValue(object, ["data", "logData", "log_data"]);
  const topics = Array.isArray(object.topics) ? object.topics.filter((topic): topic is string => typeof topic === "string") : null;
  if (address && data && topics && txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) && /^0x[a-fA-F0-9]*$/.test(data)) {
    const index = headerValue(object, ["logIndex", "log_index", "index"]);
    result.push({ address, data, topics, transactionHash: txHash as Hash, logIndex: index });
  }
  for (const [key, child] of Object.entries(object)) {
    if (key !== "topics" && key !== "data" && key !== "logData" && key !== "log_data") {
      collectCandidateLogs(child, txHash || inheritedTx, result, seen);
    }
  }
  return result;
}

function sameLog(candidate: CandidateLog, log: Log) {
  let logIndexMatches = candidate.logIndex === null;
  if (candidate.logIndex !== null && log.logIndex != null) {
    try { logIndexMatches = BigInt(candidate.logIndex) === BigInt(log.logIndex); } catch { logIndexMatches = false; }
  }
  return candidate.address.toLowerCase() === log.address.toLowerCase() &&
    candidate.data.toLowerCase() === log.data.toLowerCase() &&
    candidate.topics.length === log.topics.length &&
    candidate.topics.every((topic, index) => topic.toLowerCase() === log.topics[index]?.toLowerCase()) &&
    logIndexMatches;
}

function decodeEvents(logs: Log[], transactionHash: Hash, sender: string): EventEvidence[] {
  const result: EventEvidence[] = [];
  const add = (eventName: string, logsForEvent: Log[], scenarioIndex?: number) => {
    for (const log of logsForEvent) {
      const args = (log as Log & { args?: Record<string, unknown> }).args;
      const id = args?.id;
      if (typeof id !== "bigint") continue;
      const parsedScenario = typeof args?.scenarioIndex === "number" ? args.scenarioIndex : scenarioIndex;
      const index = log.logIndex == null ? String(result.length) : String(log.logIndex);
      result.push({
        key: `${transactionHash.toLowerCase()}:${index}`,
        transactionHash,
        eventName,
        positionId: id,
        scenarioIndex: parsedScenario,
        evidenceHash: typeof args?.evidenceHash === "string" ? args.evidenceHash : undefined,
        actor: typeof args?.to === "string" ? args.to : undefined,
        sender,
      });
    }
  };
  const byAddress = logs.filter((log) => {
    const escrow = publicEscrow();
    return escrow && log.address.toLowerCase() === escrow.toLowerCase();
  });
  add("Resolved", parseEventLogs({ abi: escrowAbi, logs: byAddress, eventName: "Resolved", strict: false }));
  add("Voided", parseEventLogs({ abi: escrowAbi, logs: byAddress, eventName: "Voided", strict: false }));
  add("Claimed", parseEventLogs({ abi: escrowAbi, logs: byAddress, eventName: "Claimed", strict: false }));
  add("BoughtBack", parseEventLogs({ abi: escrowAbi, logs: byAddress, eventName: "BoughtBack", strict: false }));
  return result;
}

export async function POST(req: Request) {
  const secret = process.env.QUICKNODE_STREAMS_SECRET;
  const escrow = publicEscrow();
  if (!secret || !escrow) return fail("UNAVAILABLE", "QuickNode Streams and Arc escrow are not configured.", 503);
  const nonce = req.headers.get("x-qn-nonce");
  const timestamp = req.headers.get("x-qn-timestamp");
  const signature = req.headers.get("x-qn-signature");
  if (!nonce || nonce.length > 256 || !timestamp || !/^\d{10,13}$/.test(timestamp) || !signature || !/^[a-fA-F0-9]{64}$/.test(signature)) {
    return fail("AUTH", "Missing or malformed QuickNode signature headers.", 401);
  }
  const stampNumber = Number(timestamp);
  const stampSeconds = stampNumber > 10_000_000_000 ? Math.floor(stampNumber / 1000) : stampNumber;
  if (Math.abs(Math.floor(Date.now() / 1000) - stampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return fail("AUTH", "QuickNode signature timestamp is outside the five minute acceptance window.", 401);
  }

  let payload: string;
  try {
    const wireBody = await readBoundedBody(req);
    const decoded = req.headers.get("content-encoding")?.toLowerCase() === "gzip"
      ? gunzipSync(wireBody, { maxOutputLength: MAX_JSON_BYTES })
      : wireBody;
    if (decoded.byteLength > MAX_JSON_BYTES) return fail("INVALID", "Decoded payload exceeds the 20 MB limit.", 413);
    payload = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch (error) {
    return fail("INVALID", error instanceof Error ? error.message : "Webhook body could not be decoded.", 400);
  }

  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(nonce + timestamp + payload, "utf8").digest();
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return fail("AUTH", "Bad QuickNode signature.", 401);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return fail("INVALID", "Signed payload is not valid JSON.");
  }
  const duplicateNonce = readStore().streamNonces.some((item) => item.nonce === nonce);
  if (duplicateNonce) return ok({ accepted: 0, duplicate: true });
  if (publicChainId() !== arcTestnet.id) return fail("WRONG_CHAIN", "The configured RPC is not Arc testnet.", 503);

  try {
    if (await arcClient.getChainId() !== arcTestnet.id) return fail("WRONG_CHAIN", "The configured RPC is not Arc testnet.", 503);
    const contractCode = await arcClient.getCode({ address: escrow });
    if (!contractCode || contractCode === "0x") return fail("UNAVAILABLE", "No escrow contract is deployed at the configured address.", 503);
    const candidates = collectCandidateLogs(parsed).filter((log) => log.address.toLowerCase() === escrow.toLowerCase());
    const byTransaction = new Map<Hash, CandidateLog[]>();
    for (const candidate of candidates) byTransaction.set(candidate.transactionHash, [...(byTransaction.get(candidate.transactionHash) || []), candidate]);
    const verified: EventEvidence[] = [];
    for (const [hash, candidateLogs] of byTransaction) {
      const receipt = await arcClient.getTransactionReceipt({ hash });
      if (receipt.status !== "success" || receipt.to?.toLowerCase() !== escrow.toLowerCase()) continue;
      const matching = receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase() && candidateLogs.some((candidate) => sameLog(candidate, log)));
      if (matching.length === 0) continue;
      verified.push(...decodeEvents(matching, hash, receipt.from));
    }

    const freshEvents: EventEvidence[] = [];
    for (const event of verified) {
      const duplicate = readStore().streamEvents.some((stored) => stored.key === event.key);
      if (duplicate) continue;
      const position = readStore().positions.find((item) => item.mode === "live" && item.chainPositionId === event.positionId.toString());
      if (!position) continue;
      const quote = readStore().quotes.find((item) => item.id === position.quoteId && item.accountId === position.accountId) as (SignedQuote & { accountId?: string }) | undefined;
      if (!quote) continue;
      const [rawPosition, schedule] = await Promise.all([
        arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [event.positionId] }),
        arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "schedule", args: [event.positionId] }),
      ]);
      const fields = rawPosition as unknown as ChainPosition;
      if (fields[0].toLowerCase() !== quote.maker.toLowerCase() || fields[1].toLowerCase() !== quote.taker.toLowerCase() ||
        fields[2].toLowerCase() !== quote.familyHash.toLowerCase() || fields[3].toLowerCase() !== quote.payoffHash.toLowerCase() ||
        fields[4] !== BigInt(quote.maxPayout) || fields[5] !== BigInt(quote.premium) || fields[6] !== BigInt(quote.fee) ||
        fields[7] !== BigInt(quote.nonce) || fields[12] !== BigInt(quote.payouts.length) ||
        fields[13] !== BigInt(quote.longstop) || fields[14] !== quote.finalizationDelay ||
        schedule.map(String).join(",") !== quote.payouts.join(",")) continue;

      const matchesOnchain = event.eventName === "Resolved"
        ? fields[11] === 2 && fields[10] === event.scenarioIndex && Boolean(event.evidenceHash) && fields[17].toLowerCase() === event.evidenceHash!.toLowerCase()
        : event.eventName === "Voided"
          ? fields[11] === 3
          : event.eventName === "Claimed"
            ? fields[11] === 0 && event.actor?.toLowerCase() === event.sender.toLowerCase() &&
              [quote.taker, quote.maker].some((address) => address.toLowerCase() === event.actor?.toLowerCase())
            : fields[11] === 4;
      if (!matchesOnchain) continue;
      freshEvents.push(event);
    }

    const accepted = mutate((store) => {
      if (store.streamNonces.some((item) => item.nonce === nonce)) return false;
      const now = new Date().toISOString();
      store.streamNonces.push({ nonce, receivedAt: now });
      store.streamNonces = store.streamNonces.slice(-50_000);
      for (const event of freshEvents) {
        if (store.streamEvents.some((stored) => stored.key === event.key)) continue;
        const position = store.positions.find((item) => item.mode === "live" && item.chainPositionId === event.positionId.toString());
        if (!position) continue;
        store.streamEvents.push({ key: event.key, transactionHash: event.transactionHash, eventName: event.eventName, positionId: position.id, at: now });
        store.streamEvents = store.streamEvents.slice(-50_000);
        const priorStatus = position.status;
        if (event.eventName === "Resolved") {
          position.status = "resolved";
          position.scenarioIndex = event.scenarioIndex ?? null;
        } else if (event.eventName === "Voided") {
          position.status = "voided";
          position.scenarioIndex = null;
        } else if (event.eventName === "Claimed") {
          position.status = "claimed";
        } else if (event.eventName === "BoughtBack") {
          position.status = "exited";
        }
        if (priorStatus !== position.status) {
          store.notifications.unshift({
            id: uid("n"), accountId: position.accountId,
            title: event.eventName === "Resolved" ? "Position resolved" : event.eventName === "Voided" ? "Position voided" : event.eventName === "Claimed" ? "Position claimed" : "Position bought back",
            body: "QuickNode delivered the event and Arc RPC confirmed the matching escrow state.",
            href: `/positions/${position.id}`, category: "trading", read: false, createdAt: now,
          });
          store.transactions.push({
            id: uid("tx"), accountId: position.accountId, type: `stream_${event.eventName.toLowerCase()}`,
            status: "confirmed", hash: event.transactionHash, amount: "0", unit: "USDC", related: position.id,
            error: null, createdAt: now,
          });
        }
      }
      return true;
    });
    return ok({ accepted: accepted ? freshEvents.length : 0, duplicate: !accepted });
  } catch {
    return fail("STREAM_PROCESSING", "Signed Stream data could not be reconciled with Arc. QuickNode can retry this delivery.", 503);
  }
}
