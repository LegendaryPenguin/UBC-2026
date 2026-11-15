import { createPublicClient, http, parseEventLogs, type Hash } from "viem";
import { arcTestnet, publicChainId, publicEscrow, publicUsdc } from "@/lib/chain";
import { erc20Abi, escrowAbi } from "@/lib/escrow/abi";
import type { PositionRecord, SignedQuote, ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession, thesisOwner } from "@/lib/server/session";
import { mutate, readStore, uid } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io"),
});

type StoredQuote = SignedQuote & { thesisId?: string; accountId?: string; recordedScenarioIndex?: number };
type AcceptanceChainData = {
  chainPositionId: string;
  status: PositionRecord["status"];
  scenarioIndex: number | null;
};

async function verifyArcAcceptance(quote: StoredQuote, txHash: string): Promise<AcceptanceChainData> {
  const escrow = publicEscrow();
  if (!escrow || quote.signature === "0x") throw new Error("This quote is not an active Arc offer.");
  if (quote.escrow.toLowerCase() !== escrow.toLowerCase() || quote.token.toLowerCase() !== publicUsdc().toLowerCase() ||
    quote.chainId !== publicChainId() || publicChainId() !== arcTestnet.id) {
    throw new Error("The quote network or contract does not match the configured Arc deployment.");
  }
  const chainId = await arcClient.getChainId();
  if (chainId !== quote.chainId) throw new Error("The configured RPC is connected to a different network.");
  const code = await arcClient.getCode({ address: escrow });
  if (!code || code === "0x") throw new Error("No escrow contract is deployed at the configured address.");
  const receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash });
  if (receipt.status !== "success") throw new Error("The Arc acceptance transaction reverted.");
  if (receipt.from.toLowerCase() !== quote.taker.toLowerCase() || receipt.to?.toLowerCase() !== escrow.toLowerCase()) {
    throw new Error("The confirmed transaction sender or destination does not match this offer.");
  }
  const matching = parseEventLogs({
    abi: escrowAbi,
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === escrow.toLowerCase()),
    eventName: "QuoteAccepted",
    strict: false,
  }).filter((log) => {
    const args = log.args;
    return args.taker?.toLowerCase() === quote.taker.toLowerCase() &&
      args.maker?.toLowerCase() === quote.maker.toLowerCase() &&
      args.payoffHash?.toLowerCase() === quote.payoffHash.toLowerCase() &&
      args.premium != null && args.maxPayout != null &&
      args.premium === BigInt(quote.premium) && args.maxPayout === BigInt(quote.maxPayout);
  });
  if (matching.length !== 1) throw new Error("The confirmed receipt does not contain exactly one matching escrow acceptance.");
  const id = matching[0].args.id;
  if (id === undefined) throw new Error("The acceptance receipt did not include an onchain position ID.");
  const [position, schedule] = await Promise.all([
    arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "positions", args: [id] }),
    arcClient.readContract({ address: escrow, abi: escrowAbi, functionName: "schedule", args: [id] }),
  ]);
  const fields = position as unknown as readonly [
    string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, number, number, bigint,
  ];
  if (fields[0].toLowerCase() !== quote.maker.toLowerCase() || fields[1].toLowerCase() !== quote.taker.toLowerCase() ||
    fields[2].toLowerCase() !== quote.familyHash.toLowerCase() || fields[3].toLowerCase() !== quote.payoffHash.toLowerCase() ||
    fields[4] !== BigInt(quote.maxPayout) || fields[5] !== BigInt(quote.premium) || fields[6] !== BigInt(quote.fee) ||
    fields[7] !== BigInt(quote.nonce) || fields[12] !== BigInt(quote.payouts.length) ||
    schedule.map(String).join(",") !== quote.payouts.join(",")) {
    throw new Error("The onchain position terms do not match the signed offer.");
  }
  const status = fields[11];
  if (status !== 1 && status !== 2 && status !== 3) {
    throw new Error("The onchain position is not in an open, resolved, or voided state. Reconciliation is required.");
  }
  return {
    chainPositionId: id.toString(),
    status: status === 1 ? "open" : status === 2 ? "resolved" : "voided",
    scenarioIndex: status === 2 ? fields[10] : null,
  };
}

export async function GET() {
  const owner = thesisOwner();
  if (!owner) return ok({ positions: [] });
  return ok({ positions: readStore().positions.filter((position) => position.accountId === owner) });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  let body: { quoteId?: unknown; mode?: unknown; txHash?: unknown; chainPositionId?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide a quote acceptance as JSON.");
  }
  if (typeof body.quoteId !== "string" || body.quoteId.length > 100) return fail("INVALID", "Choose a valid quote.");
  if (body.mode === "live") {
    if (!ctx) return fail("AUTH", "Sign in is required to record an Arc position.", 401);
    if (typeof body.txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash) || body.chainPositionId !== undefined) {
      return fail("INVALID", "Provide the confirmed Arc transaction hash. The chain position ID is read from its receipt.");
    }
    const accountId = ctx.account.id;
    const quote = readStore().quotes.find((item) => item.id === body.quoteId && item.accountId === accountId) as StoredQuote | undefined;
    if (!quote || !quote.thesisId) return fail("NOT_FOUND", "Quote not found", 404);
    const existing = readStore().positions.find((position) => position.accountId === accountId && position.quoteId === quote.id);
    if (existing) {
      if (existing.txHash?.toLowerCase() === body.txHash.toLowerCase()) return ok({ position: existing, duplicate: true });
      return fail("QUOTE_ALREADY_RECORDED", "This quote already has a position record.", 409);
    }
    const thesis = readStore().theses.find((item) => item.id === quote.thesisId &&
      (item as ThesisRevision & { accountId?: string }).accountId === accountId);
    if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);

    let chain: AcceptanceChainData;
    try {
      chain = await verifyArcAcceptance(quote, body.txHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Arc acceptance could not be verified.";
      return fail("ARC_RECEIPT_UNVERIFIED", `${message} Retry synchronization after the RPC is available; do not accept the offer again.`, 503);
    }
    const now = new Date().toISOString();
    const position = mutate((store) => {
      const duplicate = store.positions.find((item) => item.accountId === accountId && item.quoteId === quote.id);
      if (duplicate) return { position: duplicate, duplicate: true };
      const record: PositionRecord = {
        id: uid("pos"),
        accountId,
        thesisId: thesis.id,
        quoteId: quote.id,
        mode: "live",
        chainPositionId: chain.chainPositionId,
        txHash: body.txHash as string,
        status: chain.status,
        scenarioIndex: chain.scenarioIndex,
        payouts: quote.payouts,
        labels: quote.scenarioLabels,
        maxPayout: quote.maxPayout,
        premium: quote.premium,
        fee: quote.fee,
        familyId: thesis.familyId,
        topicSlug: thesis.topicSlug,
        createdAt: now,
      };
      store.positions.push(record);
      const transactionExists = store.transactions.some((transaction) => transaction.hash?.toLowerCase() === (body.txHash as string).toLowerCase());
      if (!transactionExists) store.transactions.push({
        id: uid("tx"),
        accountId,
        type: "accept_live_quote",
        status: "confirmed",
        hash: body.txHash as string,
        amount: (BigInt(quote.premium) + BigInt(quote.fee)).toString(),
        unit: "USDC",
        related: record.id,
        error: null,
        createdAt: now,
      });
      const storedQuote = store.quotes.find((item) => item.id === quote.id);
      if (storedQuote) storedQuote.status = "accepted";
      store.journals.push({
        id: uid("j"),
        accountId,
        thesisId: thesis.id,
        positionId: record.id,
        snapshot: { quote: storedQuote || quote, thesisId: thesis.id },
        reflection: "",
        tags: [],
        createdAt: now,
      });
      store.notifications.unshift({
        id: uid("n"),
        accountId,
        title: "Arc position confirmed",
        body: "The escrow acceptance was verified from the Arc transaction receipt.",
        href: `/positions/${record.id}`,
        category: "trading",
        read: false,
        createdAt: now,
      });
      return { position: record, duplicate: false };
    });
    return ok(position, 201);
  }

  if (body.mode !== "paper") return fail("INVALID", "Choose live or paper mode.");
  if (body.txHash || body.chainPositionId) return fail("INVALID", "Paper positions have no chain receipt.");
  const owner = thesisOwner();
  if (!owner) return fail("NOT_FOUND", "Quote not found", 404);
  const quote = readStore().quotes.find((item) => item.id === body.quoteId && item.accountId === owner) as StoredQuote | undefined;
  if (!quote) return fail("NOT_FOUND", "Quote not found", 404);
  const existingPaper = readStore().positions.find((item) => item.accountId === owner && item.quoteId === quote.id);
  if (existingPaper) return ok({ position: existingPaper, duplicate: true });
  if (quote.signature !== "0x" || quote.status !== "available" || quote.deadline * 1000 <= Date.now()) {
    return fail("QUOTE_EXPIRED", "Request a new paper quote.");
  }
  const thesis = readStore().theses.find((item) => item.id === quote.thesisId &&
    (item as ThesisRevision & { accountId?: string }).accountId === owner);
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  const position = mutate((store) => {
    const duplicate = store.positions.find((item) => item.accountId === owner && item.quoteId === quote.id);
    if (duplicate) return duplicate;
    const record: PositionRecord = {
      id: uid("pos"),
      accountId: owner || "",
      thesisId: thesis.id,
      quoteId: quote.id,
      mode: "paper",
      chainPositionId: null,
      txHash: null,
      status: quote.recordedScenarioIndex === undefined ? "open" : "resolved",
      scenarioIndex: quote.recordedScenarioIndex ?? null,
      payouts: quote.payouts,
      labels: quote.scenarioLabels,
      maxPayout: quote.maxPayout,
      premium: quote.premium,
      fee: quote.fee,
      familyId: thesis.familyId,
      topicSlug: thesis.topicSlug,
      createdAt: new Date().toISOString(),
    };
    store.positions.push(record);
    store.quotes.find((item) => item.id === quote.id)!.status = "accepted";
    store.transactions.push({
      id: uid("tx"),
      accountId: owner || "",
      type: "accept_paper_quote",
      status: "confirmed",
      hash: null,
      amount: quote.premium,
      unit: "USDC",
      related: record.id,
      error: null,
      createdAt: new Date().toISOString(),
    });
    store.journals.push({
      id: uid("j"),
      accountId: owner || "",
      thesisId: thesis.id,
      positionId: record.id,
      snapshot: { quote, thesisId: thesis.id },
      reflection: "",
      tags: [],
      createdAt: new Date().toISOString(),
    });
    return record;
  });
  return ok({ position });
}
