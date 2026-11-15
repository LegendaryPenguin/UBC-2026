import { createPublicClient, createWalletClient, http, parseEventLogs, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, publicChainId, publicEscrow } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow/abi";
import { getEvent } from "@/lib/gemini/client";
import { settledGeminiOutcome } from "@/lib/gemini/settlement";
import type { PositionRecord, SignedQuote } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { isOperatorRequest, operatorSecretConfigured } from "@/lib/server/operator";
import { mutate, readStore, uid } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type StoredQuote = SignedQuote & { thesisId?: string; accountId?: string };
type ChainPosition = readonly [string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, number, number, bigint, bigint, number, number, bigint, string];
type SettlementAction = "propose" | "finalize" | "void";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io";
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

function authorize(req: Request) {
  if (!operatorSecretConfigured()) return fail("UNAVAILABLE", "Operator access is not configured.", 503);
  if (!isOperatorRequest(req)) return fail("AUTH", "Operator access required.", 401);
  return null;
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  const store = readStore();
  const positions = store.positions
    .filter((position) => position.mode === "live" && position.chainPositionId && position.status === "open")
    .map((position) => ({
      id: position.id,
      chainPositionId: position.chainPositionId,
      topicSlug: position.topicSlug,
      status: position.status,
      longstop: position.longstop,
      finalizationDelay: position.finalizationDelay,
      labels: position.labels,
      latestReport: store.resolutionReports.findLast((report) => report.positionId === position.id) || null,
    }));
  return ok({ positions });
}

export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  let body: { positionId?: unknown; action?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide an operations action as JSON.");
  }
  if (!body || typeof body !== "object") return fail("INVALID", "Provide an operations action as a JSON object.");
  if (typeof body.positionId !== "string" || body.positionId.length > 120) return fail("INVALID", "Choose a valid position.");
  if (body.action !== "propose" && body.action !== "finalize" && body.action !== "void") {
    return fail("INVALID", "Choose propose, finalize, or void.");
  }
  const action = body.action as SettlementAction;
  const escrow = publicEscrow();
  const resolverKey = process.env.RESOLVER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!escrow) return fail("UNAVAILABLE", "NEXT_PUBLIC_ESCROW is not configured.", 503);
  if (!resolverKey) return fail("UNAVAILABLE", "RESOLVER_PRIVATE_KEY is not configured.", 503);
  if (publicChainId() !== arcTestnet.id) return fail("UNAVAILABLE", "Settlement is restricted to the configured Arc testnet.", 503);

  const position = readStore().positions.find((item) => item.id === body.positionId);
  if (!position || position.mode !== "live" || !position.chainPositionId || !position.txHash) {
    return fail("NOT_FOUND", "Live Arc position not found.", 404);
  }
  const quote = readStore().quotes.find((item) => item.id === position.quoteId && item.accountId === position.accountId) as StoredQuote | undefined;
  if (!quote || quote.signature === "0x") return fail("NOT_FOUND", "The signed position quote is unavailable.", 404);

  try {
    if (await publicClient.getChainId() !== arcTestnet.id) return fail("WRONG_CHAIN", "The configured RPC is not Arc testnet.", 503);
    const code = await publicClient.getCode({ address: escrow });
    if (!code || code === "0x") return fail("UNAVAILABLE", "No escrow contract is deployed at the configured address.", 503);
    const account = privateKeyToAccount(resolverKey);
    const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });
    const id = BigInt(position.chainPositionId);
    const [rawPosition, schedule, block] = await Promise.all([
      publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] }),
      publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "schedule", args: [id] }),
      publicClient.getBlock({ blockTag: "latest" }),
    ]);
    const fields = rawPosition as unknown as ChainPosition;
    if (fields[0].toLowerCase() !== quote.maker.toLowerCase() || fields[1].toLowerCase() !== quote.taker.toLowerCase() ||
      fields[2].toLowerCase() !== quote.familyHash.toLowerCase() || fields[3].toLowerCase() !== quote.payoffHash.toLowerCase() ||
      fields[4] !== BigInt(quote.maxPayout) || fields[5] !== BigInt(quote.premium) || fields[6] !== BigInt(quote.fee) ||
      fields[7] !== BigInt(quote.nonce) || fields[12] !== BigInt(quote.payouts.length) ||
      fields[13] !== BigInt(quote.longstop) || fields[14] !== quote.finalizationDelay ||
      schedule.map(String).join(",") !== quote.payouts.join(",")) {
      return fail("SOURCE_INCONSISTENT", "The onchain position does not match its signed quote and payout schedule.", 409);
    }
    if (fields[11] !== 1) return fail("INVALID", "This onchain position is no longer open.", 409);

    let source: ReturnType<typeof settledGeminiOutcome> | null = null;
    if (action === "propose" || action === "finalize") {
      const resolver = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "resolver" });
      if (resolver.toLowerCase() !== account.address.toLowerCase()) {
        return fail("AUTH", "RESOLVER_PRIVATE_KEY does not match the escrow's authorized resolver.", 503);
      }
      let fetched;
      try {
        fetched = await getEvent(position.topicSlug.toUpperCase());
      } catch {
        return fail("SOURCE_UNAVAILABLE", "Gemini's current event result could not be fetched. No settlement transaction was sent.", 503);
      }
      if (fetched.event.ticker.toLowerCase() !== position.topicSlug.toLowerCase()) {
        return fail("SOURCE_INCONSISTENT", "Gemini returned a different event ticker.", 409);
      }
      try {
        source = settledGeminiOutcome({
          event: fetched.event,
          fetchedAt: fetched.fetchedAt,
          payloadHash: fetched.hash,
          expectedFamilyHash: quote.familyHash,
          expectedPayouts: quote.payouts,
          expectedLabels: quote.scenarioLabels,
        });
      } catch (error) {
        return fail("SOURCE_UNRESOLVED", error instanceof Error ? error.message : "Gemini's source result is not settlement-ready.", 409);
      }
    }

    if (action === "propose") {
      const outcome = source!;
      const finalizesAt = fields[16] + BigInt(quote.finalizationDelay);
      if (outcome.scenario.index > 0xffff_ffff) return fail("INVALID", "The source scenario index is out of range.", 409);
      if (block.timestamp + BigInt(quote.finalizationDelay) >= fields[13]) {
        return fail("LONGSTOP", "There is not enough time left before the immutable longstop to start the correction window.", 409);
      }
      const alreadyProposed = fields[16] > 0n && fields[15] === outcome.scenario.index &&
        fields[17].toLowerCase() === outcome.evidenceHash.toLowerCase();
      if (alreadyProposed) {
        return ok({ alreadyProposed: true, proposal: { scenarioIndex: fields[15], evidenceHash: fields[17], proposedAt: Number(fields[16]), finalizesAt: Number(finalizesAt) } });
      }
      const correcting = fields[16] > 0n;
      const hash = await walletClient.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "proposeOutcome",
        args: [id, outcome.scenario.index, outcome.evidenceHash],
      });
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      } catch {
        return ok({ pending: true, transactionHash: hash, note: "Proposal submission may still be confirming. Check the onchain proposal before retrying." }, 202);
      }
      if (receipt.status !== "success") return fail("TX_REVERTED", "Arc reverted the outcome proposal.", 409);
      const events = parseEventLogs({ abi: escrowAbi, logs: receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase()), eventName: "OutcomeProposed", strict: false });
      const verified = events.some((event) => event.args.id === id && event.args.scenarioIndex === outcome.scenario.index &&
        event.args.evidenceHash?.toLowerCase() === outcome.evidenceHash.toLowerCase());
      if (!verified) return fail("TX_UNVERIFIED", "The proposal receipt does not contain the requested escrow event.", 503);
      const [updatedPosition] = await Promise.all([
        publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] }),
      ]);
      const updated = updatedPosition as unknown as ChainPosition;
      if (updated[16] === 0n || updated[15] !== outcome.scenario.index || updated[17].toLowerCase() !== outcome.evidenceHash.toLowerCase()) {
        return fail("TX_UNVERIFIED", "Arc did not retain the expected proposal. Reconcile the position before continuing.", 503);
      }
      const report = mutate((store) => {
        store.resolutionReports.push({
          id: uid("report"), positionId: position.id, action: correcting ? "corrected" : "proposed",
          ticker: fetchedTicker(outcome), sourceEventId: sourceEventId(outcome), sourceFetchedAt: outcome.fetchedAt,
          payloadHash: outcome.payloadHash, evidenceHash: outcome.evidenceHash,
          scenarioIndex: outcome.scenario.index, scenarioLabel: outcome.scenario.label,
          transactionHash: hash, createdAt: new Date().toISOString(), sourceSnapshot: outcome.rawSource,
        });
        store.transactions.push({
          id: uid("tx"), accountId: position.accountId, type: correcting ? "settlement_correction_proposed" : "settlement_proposed",
          status: "confirmed", hash, amount: "0", unit: "USDC", related: position.id, error: null, createdAt: new Date().toISOString(),
        });
        return store.resolutionReports[store.resolutionReports.length - 1];
      });
      return ok({ report, transactionHash: hash, proposal: { scenarioIndex: updated[15], evidenceHash: updated[17], proposedAt: Number(updated[16]), finalizesAt: Number(updated[16] + BigInt(quote.finalizationDelay)) } }, 201);
    }

    if (action === "finalize") {
      const outcome = source!;
      if (fields[16] === 0n) return fail("INVALID", "No result has been proposed onchain.", 409);
      if (fields[15] !== outcome.scenario.index || fields[17].toLowerCase() !== outcome.evidenceHash.toLowerCase()) {
        return fail("SOURCE_CHANGED", "Gemini's final result differs from the current proposal. Submit a correction proposal to restart the delay.", 409);
      }
      const finalizesAt = fields[16] + BigInt(quote.finalizationDelay);
      if (block.timestamp < finalizesAt) return fail("SETTLEMENT_NOT_READY", `The correction window ends at ${new Date(Number(finalizesAt) * 1000).toISOString()}.`, 409);
      if (block.timestamp >= fields[13]) return fail("LONGSTOP", "The longstop has passed; the contract only permits a refund void now.", 409);
      const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: "finalizeOutcome", args: [id] });
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      } catch {
        return ok({ pending: true, transactionHash: hash, note: "Finalization may still be confirming. Check the onchain position before retrying." }, 202);
      }
      if (receipt.status !== "success") return fail("TX_REVERTED", "Arc reverted the settlement finalization.", 409);
      const events = parseEventLogs({ abi: escrowAbi, logs: receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase()), eventName: "Resolved", strict: false });
      if (!events.some((event) => event.args.id === id && event.args.scenarioIndex === outcome.scenario.index &&
        event.args.evidenceHash?.toLowerCase() === outcome.evidenceHash.toLowerCase())) {
        return fail("TX_UNVERIFIED", "The finalization receipt does not contain the expected source-bound result.", 503);
      }
      const updatedPosition = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] });
      const updated = updatedPosition as unknown as ChainPosition;
      if (updated[11] !== 2 || updated[10] !== outcome.scenario.index) return fail("TX_UNVERIFIED", "Arc did not retain the expected final scenario.", 503);
      const report = mutate((store) => {
        store.resolutionReports.push({
          id: uid("report"), positionId: position.id, action: "finalized", ticker: fetchedTicker(outcome),
          sourceEventId: sourceEventId(outcome), sourceFetchedAt: outcome.fetchedAt, payloadHash: outcome.payloadHash,
          evidenceHash: outcome.evidenceHash, scenarioIndex: outcome.scenario.index, scenarioLabel: outcome.scenario.label,
          transactionHash: hash, createdAt: new Date().toISOString(), sourceSnapshot: outcome.rawSource,
        });
        updateLocalPosition(store, position, "resolved", outcome.scenario.index, hash, "Position resolved", `Arc finalized ${outcome.scenario.label} after the correction window.`);
        return store.resolutionReports[store.resolutionReports.length - 1];
      });
      return ok({ report, transactionHash: hash, status: "resolved" }, 201);
    }

    if (block.timestamp < fields[13]) return fail("LONGSTOP_NOT_REACHED", `The immutable refund longstop is ${new Date(Number(fields[13]) * 1000).toISOString()}.`, 409);
    const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: "voidPosition", args: [id] });
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    } catch {
      return ok({ pending: true, transactionHash: hash, note: "The void may still be confirming. Check the onchain position before retrying." }, 202);
    }
    if (receipt.status !== "success") return fail("TX_REVERTED", "Arc reverted the longstop refund.", 409);
    const voids = parseEventLogs({ abi: escrowAbi, logs: receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase()), eventName: "Voided", strict: false });
    if (!voids.some((event) => event.args.id === id)) return fail("TX_UNVERIFIED", "The void receipt does not contain the expected escrow event.", 503);
    const updatedPosition = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] });
    const updated = updatedPosition as unknown as ChainPosition;
    if (updated[11] !== 3) return fail("TX_UNVERIFIED", "Arc did not retain the longstop refund status.", 503);
    const report = mutate((store) => {
      store.resolutionReports.push({
        id: uid("report"), positionId: position.id, action: "voided", ticker: position.topicSlug.toUpperCase(),
        sourceEventId: position.familyId, sourceFetchedAt: null, payloadHash: null, evidenceHash: null,
        scenarioIndex: null, scenarioLabel: null, transactionHash: hash, createdAt: new Date().toISOString(),
      });
      updateLocalPosition(store, position, "voided", null, hash, "Position voided", "The Arc longstop passed before finalization; the contract permits the recorded premium refund.");
      return store.resolutionReports[store.resolutionReports.length - 1];
    });
    return ok({ report, transactionHash: hash, status: "voided" }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Arc settlement could not be completed.";
    return fail("SETTLEMENT_FAILED", message, 503);
  }
}

function fetchedTicker(outcome: ReturnType<typeof settledGeminiOutcome>) {
  return outcome.family.sourceEvent.ticker;
}

function sourceEventId(outcome: ReturnType<typeof settledGeminiOutcome>) {
  return outcome.family.sourceEvent.id;
}

function updateLocalPosition(
  store: ReturnType<typeof readStore>,
  position: PositionRecord,
  status: "resolved" | "voided",
  scenarioIndex: number | null,
  hash: Hash,
  title: string,
  body: string,
) {
  const record = store.positions.find((item) => item.id === position.id);
  if (record) {
    record.status = status;
    record.scenarioIndex = scenarioIndex;
  }
  store.transactions.push({
    id: uid("tx"), accountId: position.accountId, type: `settlement_${status}`, status: "confirmed", hash,
    amount: "0", unit: "USDC", related: position.id, error: null, createdAt: new Date().toISOString(),
  });
  store.notifications.unshift({
    id: uid("n"), accountId: position.accountId, title, body, href: `/positions/${position.id}`,
    category: "trading", read: false, createdAt: new Date().toISOString(),
  });
}
