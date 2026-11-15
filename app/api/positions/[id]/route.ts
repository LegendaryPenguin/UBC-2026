import { createPublicClient, http, parseEventLogs, type Hash } from "viem";
import { arcTestnet, publicChainId, publicEscrow } from "@/lib/chain";
import { escrowAbi } from "@/lib/escrow/abi";
import type { PositionRecord, SignedQuote, ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession, thesisOwner } from "@/lib/server/session";
import { mutate, readStore, uid } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io"),
});
const claimedEventAbi = {
  type: "event",
  name: "Claimed",
  inputs: [
    { name: "id", type: "uint256", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

type StoredQuote = SignedQuote & { thesisId?: string; accountId?: string };
type ChainPosition = readonly [string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, number, number, bigint];

function ownedPosition(id: string, accountId: string) {
  return readStore().positions.find((position) => position.id === id && position.accountId === accountId);
}

async function refreshOnchainStatus(position: PositionRecord, quote: StoredQuote) {
  const escrow = publicEscrow();
  if (!escrow || !position.chainPositionId) throw new Error("The Arc escrow address or position ID is not configured.");
  if (publicChainId() !== arcTestnet.id || await arcClient.getChainId() !== arcTestnet.id) throw new Error("The configured RPC is not Arc testnet.");
  const [rawPosition, schedule] = await Promise.all([
    arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [BigInt(position.chainPositionId)] }),
    arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "schedule", args: [BigInt(position.chainPositionId)] }),
  ]);
  const fields = rawPosition as unknown as ChainPosition;
  if (fields[0].toLowerCase() !== quote.maker.toLowerCase() || fields[1].toLowerCase() !== quote.taker.toLowerCase() ||
    fields[2].toLowerCase() !== quote.familyHash.toLowerCase() || fields[3].toLowerCase() !== quote.payoffHash.toLowerCase() ||
    fields[4] !== BigInt(quote.maxPayout) || fields[5] !== BigInt(quote.premium) || fields[6] !== BigInt(quote.fee) ||
    fields[7] !== BigInt(quote.nonce) || fields[12] !== BigInt(quote.payouts.length) ||
    schedule.map(String).join(",") !== quote.payouts.join(",")) {
    throw new Error("The escrow position no longer matches the recorded signed quote.");
  }
  const onchainStatus = fields[11];
  let status: PositionRecord["status"];
  if (onchainStatus === 1) status = "open";
  else if (onchainStatus === 2) status = "resolved";
  else if (onchainStatus === 3) status = "voided";
  else if (onchainStatus === 4) status = "exited";
  else if (onchainStatus === 0) {
    const positionId = BigInt(position.chainPositionId);
    const acceptance = position.txHash
      ? await arcClient.getTransactionReceipt({ hash: position.txHash as Hash })
      : null;
    if (!acceptance) throw new Error("The acceptance receipt is not available to reconcile this position.");
    const logs = await arcClient.getLogs({
      address: escrow,
      event: claimedEventAbi,
      args: { id: positionId },
      fromBlock: acceptance.blockNumber,
      toBlock: "latest",
    });
    const claims = parseEventLogs({ abi: escrowAbi, logs, eventName: "Claimed", strict: false });
    if (!claims.some((log) => log.args.id === positionId)) throw new Error("The escrow reports a closed position, but no claim event was found.");
    status = "claimed";
  } else {
    throw new Error("The escrow returned an unknown position status.");
  }
  return { status, scenarioIndex: onchainStatus === 2 ? fields[10] : position.scenarioIndex };
}

async function verifyClaimReceipt(position: PositionRecord, quote: StoredQuote, txHash: string) {
  const escrow = publicEscrow();
  if (!escrow || !position.chainPositionId) throw new Error("The Arc escrow position is not configured.");
  if (publicChainId() !== arcTestnet.id || await arcClient.getChainId() !== arcTestnet.id) throw new Error("The configured RPC is not Arc testnet.");
  const receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash });
  if (receipt.status !== "success" || receipt.from.toLowerCase() !== quote.taker.toLowerCase() || receipt.to?.toLowerCase() !== escrow.toLowerCase()) {
    throw new Error("The receipt is not a successful claim from this position holder.");
  }
  const id = BigInt(position.chainPositionId);
  const claimLogs = parseEventLogs({
    abi: escrowAbi,
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase()),
    eventName: "Claimed",
    strict: false,
  }).filter((log) => log.args.id === id && log.args.to?.toLowerCase() === quote.taker.toLowerCase() &&
    log.args.amount === BigInt(quote.maxPayout) + BigInt(quote.premium));
  if (claimLogs.length !== 1) throw new Error("The receipt does not contain a matching holder claim event.");
  const onchain = await arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] });
  const fields = onchain as unknown as ChainPosition;
  if (fields[0].toLowerCase() !== quote.maker.toLowerCase() || fields[1].toLowerCase() !== quote.taker.toLowerCase() || fields[11] !== 0) {
    throw new Error("The escrow has not finalized this holder claim.");
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const accountId = thesisOwner();
  if (!accountId) return fail("AUTH", "Sign in required", 401);
  const position = ownedPosition(params.id, accountId);
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  if (position.mode !== "live" || !position.chainPositionId) return ok({ position, walletAddress: null });
  const quote = readStore().quotes.find((item) => item.id === position.quoteId && item.accountId === accountId) as StoredQuote | undefined;
  if (!quote) return ok({ position, walletAddress: null, syncWarning: "The signed quote record is unavailable; chain status was not changed." });
  try {
    const chain = await refreshOnchainStatus(position, quote);
    const updated = mutate((store) => {
      const record = store.positions.find((item) => item.id === position.id && item.accountId === accountId);
      if (!record) return null;
      const previousStatus = record.status;
      record.status = chain.status;
      if (chain.scenarioIndex !== null) record.scenarioIndex = chain.scenarioIndex;
      if (previousStatus !== chain.status && (chain.status === "resolved" || chain.status === "voided" || chain.status === "claimed")) {
        store.notifications.unshift({
          id: uid("n"),
          accountId,
          title: chain.status === "claimed" ? "Position claimed" : chain.status === "voided" ? "Position voided" : "Position resolved",
          body: chain.status === "claimed" ? "Arc confirmed that this position is no longer open." : "Arc escrow state updated. Review your claim and transaction status.",
          href: `/positions/${record.id}`,
          category: "trading",
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      return record;
    });
    return updated ? ok({ position: updated, walletAddress: quote.taker }) : fail("NOT_FOUND", "Position not found", 404);
  } catch (error) {
    return ok({ position, walletAddress: quote.taker, syncWarning: error instanceof Error ? error.message : "Arc position status could not be refreshed." });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = currentSession();
  const accountId = thesisOwner();
  if (!accountId) return fail("AUTH", "Sign in required", 401);
  let body: { action?: unknown; txHash?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide a position action as JSON.");
  }
  const position = ownedPosition(params.id, accountId);
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  if (body.action !== "claim") {
    if (body.action === "exit") return fail("UNAVAILABLE", "No funded buyback quote is available for this position.", 503);
    return fail("INVALID", "Unknown position action.");
  }
  if (position.status === "claimed") return ok({ position, duplicate: true });
  if (position.status !== "resolved" && position.status !== "voided") return fail("INVALID", "This position has no claimable outcome.");

  if (position.mode === "live") {
    if (!ctx) return fail("AUTH", "Sign in required to claim a live Arc position.", 401);
    if (typeof body.txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) return fail("INVALID", "Provide the confirmed Arc claim transaction hash.");
    const txHash = body.txHash;
    const quote = readStore().quotes.find((item) => item.id === position.quoteId && item.accountId === accountId) as StoredQuote | undefined;
    if (!quote) return fail("NOT_FOUND", "Signed quote not found", 404);
    try {
      await verifyClaimReceipt(position, quote, txHash);
    } catch (error) {
      return fail("ARC_CLAIM_UNVERIFIED", `${error instanceof Error ? error.message : "Claim receipt could not be verified."} Retry after Arc confirms the transaction.`, 503);
    }
    const amount = position.status === "voided"
      ? quote.premium
      : position.scenarioIndex === null ? undefined : position.payouts[position.scenarioIndex];
    if (amount === undefined) return fail("INVALID", "The recorded outcome does not match this payoff.");
    const updated = mutate((store) => {
      const record = store.positions.find((item) => item.id === position.id && item.accountId === accountId);
      if (!record) return null;
      const prior = store.transactions.some((transaction) => transaction.hash?.toLowerCase() === txHash.toLowerCase());
      record.status = "claimed";
      if (!prior) store.transactions.push({
        id: uid("tx"),
        accountId,
        type: "claim_live_quote",
        status: "confirmed",
        hash: txHash,
        amount,
        unit: "USDC",
        related: record.id,
        error: null,
        createdAt: new Date().toISOString(),
      });
      return record;
    });
    return updated ? ok({ position: updated }) : fail("NOT_FOUND", "Position not found", 404);
  }

  if (body.txHash) return fail("INVALID", "Paper claims have no chain receipt.");
  const amount = position.status === "voided"
    ? position.premium
    : position.scenarioIndex === null ? undefined : position.payouts[position.scenarioIndex];
  if (amount === undefined) return fail("INVALID", "The recorded outcome does not match this payoff.");
  const updated = mutate((store) => {
    const record = store.positions.find((item) => item.id === position.id && item.accountId === accountId);
    if (!record) return null;
    if (record.status === "claimed") return record;
    record.status = "claimed";
    store.transactions.push({
      id: uid("tx"),
      accountId: record.accountId,
      type: "claim_paper",
      status: "confirmed",
      hash: null,
      amount,
      unit: "USDC",
      related: record.id,
      error: null,
      createdAt: new Date().toISOString(),
    });
    return record;
  });
  return updated ? ok({ position: updated }) : fail("NOT_FOUND", "Position not found", 404);
}
