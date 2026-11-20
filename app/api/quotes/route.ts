import { getTopic } from "@/lib/gemini/catalog";
import { compileView } from "@/lib/payoffs/compile";
import { thesisViewLabel } from "@/lib/payoffs/display";
import { parseUsdc } from "@/lib/format";
import { quotePremium } from "@/lib/pricing";
import { signQuote } from "@/lib/escrow/quote";
import { capabilities } from "@/lib/capabilities";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession, thesisOwner } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";
import { publicEscrow, publicUsdc, publicChainId } from "@/lib/chain";
import { DEFAULT_FINALIZATION_DELAY_SECONDS } from "@/lib/escrow/policy";
import type { SignedQuote } from "@/lib/domain/types";
import { isAddress, zeroAddress } from "viem";

export async function POST(req: Request) {
  const body = await readJson<{
    thesisId: string;
    mode: string;
    maxPayout: string;
    taker?: string;
  }>(req);
  const ctx = currentSession();
  const owner = thesisOwner();
  if (!owner) return fail("NOT_FOUND", "Thesis not found.", 404);
  const thesis = mutate((s) => s.theses.find((t) => {
    return t.id === body.thesisId && (t as typeof t & { accountId?: string }).accountId === owner;
  }));
  if (!thesis) return fail("NOT_FOUND", "Confirm a view first.", 404);
  if (body.mode !== "live" && body.mode !== "paper" && body.mode !== "replay") {
    return fail("INVALID", "Select live, paper, or replay mode.");
  }
  if (body.mode === "live" && !ctx) return fail("AUTH", "Sign in before requesting an Arc quote.", 401);
  if (thesis.status !== "confirmed" && thesis.status !== "quoted") {
    return fail("INVALID", "Confirm the thesis before requesting a quote.");
  }
  const live = body.mode === "live";
  const family = await getTopic(thesis.topicSlug, live ? "live" : "replay");
  if (!family) return fail("UNSUPPORTED_FAMILY", "Family unavailable");
  const longstop = family.longstopTime ? Math.floor(Date.parse(family.longstopTime) / 1000) : 0;
  const finalizationDelay = DEFAULT_FINALIZATION_DELAY_SECONDS;
  const escrow = publicEscrow();
  const key = process.env.MAKER_PRIVATE_KEY as `0x${string}` | undefined;
  if (live) {
    if (!body.taker || !isAddress(body.taker) || body.taker === zeroAddress) {
      return fail("INVALID", "Connect a wallet before requesting a live quote.");
    }
    if (!family.quotesAvailable || family.freshness !== "fresh") {
      return fail("UNAVAILABLE", "This market's settlement rules and current quote eligibility have not been verified.", 503);
    }
    if (!Number.isFinite(longstop) || longstop <= Math.floor(Date.now() / 1000) + finalizationDelay) {
      return fail("SOURCE_UNRESOLVED", "This market has no future settlement longstop with enough time for the correction window.", 503);
    }
    if (!escrow || !key) return fail("UNAVAILABLE", capabilities().maker.reason, 503);
  }
  try {
    const maxPayout = parseUsdc(body.maxPayout || "100");
    const spec = compileView(
      family,
      thesis.template,
      {
        threshold: thesis.lowerThreshold,
        direction: thesis.direction,
        lower: thesis.lowerThreshold,
        upper: thesis.upperThreshold,
      },
      maxPayout,
    );
    const spread = mutate((s) => s.maker.spreadBps);
    const paused = mutate((s) => s.maker.paused);
    if (paused) return fail("UNAVAILABLE", "Maker quoting is paused.");
    const priced = quotePremium(family, spec, spread);
    const note = live ? priced.note : priced.usedMids
      ? "Estimated from recorded Gemini prices and a simulated maker spread."
      : "Simulated premium using a fallback estimate. The recorded markets have no usable bid and ask.";
    const fee = priced.premium / 100n;
    const taker = (body.taker as `0x${string}` | undefined) || zeroAddress;
    let quote: SignedQuote;
    if (live && key && escrow) {
      const nonce = BigInt(mutate((s) => s.nonce++));
      quote = await signQuote({
        makerKey: key,
        taker,
        familyHash: spec.familyHash as `0x${string}`,
        payoffHash: spec.payoffHash as `0x${string}`,
        maxPayout: spec.maxPayout,
        premium: priced.premium,
        fee,
        nonce,
        payouts: spec.rows.map((r) => r.payout),
        scenarioLabels: spec.rows.map((r) => r.label),
        longstop,
        finalizationDelay,
      });
    } else {
      quote = {
        id: uid("q"),
        status: body.mode === "paper" ? "available" : "unavailable",
        maker: zeroAddress,
        taker,
        escrow: zeroAddress,
        token: publicUsdc(),
        familyHash: spec.familyHash as `0x${string}`,
        payoffHash: spec.payoffHash as `0x${string}`,
        maxPayout: spec.maxPayout.toString(),
        premium: priced.premium.toString(),
        fee: fee.toString(),
        nonce: "0",
        issuedAt: Math.floor(Date.now() / 1000),
        deadline: Math.floor(Date.now() / 1000) + 600,
        chainId: publicChainId(),
        longstop,
        finalizationDelay,
        signature: "0x",
        payouts: spec.rows.map((r) => r.payout.toString()),
        scenarioLabels: spec.rows.map((r) => r.label),
        unavailableReason: body.mode === "replay" ? "Historical estimate. Switch to paper mode to simulate acceptance." : undefined,
      };
    }
    quote.id = uid("q");
    const recordedScenario = body.mode === "paper" &&
      family.sourceEvent.status === "settled" &&
      family.predicates.every((predicate) => family.contracts.some((contract) =>
        contract.id === predicate.contractId && contract.status === "settled" && contract.resolutionSide !== null
      ))
      ? family.scenarios.find((scenario) => family.predicates.every((predicate) => {
        const contract = family.contracts.find((item) => item.id === predicate.contractId);
        return scenario.predicateYes[predicate.id] === (contract?.resolutionSide === "yes");
      }))
      : undefined;
    const storedQuote = { ...quote, sourceTicker: family.sourceEvent.ticker, sourceContractIds: spec.sourceContractIds };
    mutate((s) => {
      const firstVersion = s.thesisHistory.find((version) => version.thesisId === thesis.id && version.accountId === owner);
      const sourceThesis = {
        title: thesis.title || family.title,
        originalObservation: firstVersion?.snapshot.rationale || undefined,
        confirmedView: thesisViewLabel(thesis, family, { exact: true }),
        observationTime: family.observationTime,
        rationale: thesis.rationale,
        invalidation: thesis.invalidation,
        revision: thesis.revision,
      };
      s.quotes.push({ ...storedQuote, thesisId: thesis.id, accountId: owner, mode: body.mode, recordedScenarioIndex: recordedScenario?.index, sourceThesis });
      thesis.status = "quoted";
    });
    if (ctx) {
      mutate((s) => {
        s.notifications.unshift({
          id: uid("n"),
          accountId: ctx.account.id,
          title: live ? "Quote ready" : "Simulation ready",
          body: note,
          href: `/quotes/${quote.id}`,
          category: "trading",
          read: false,
          createdAt: new Date().toISOString(),
        });
      });
    }
    return ok({
      quote: storedQuote,
      spec: {
        ...spec,
        maxPayout: spec.maxPayout.toString(),
        rows: spec.rows.map((row) => ({ ...row, payout: row.payout.toString() })),
      },
      note,
      paper: body.mode === "paper",
    });
  } catch (err) {
    return fail("INCOMPATIBLE_RULES", err instanceof Error ? err.message : "Compile failed");
  }
}
