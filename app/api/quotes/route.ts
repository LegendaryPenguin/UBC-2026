import { getTopic } from "@/lib/gemini/catalog";
import { compileView } from "@/lib/payoffs/compile";
import { parseUsdc } from "@/lib/format";
import { quotePremium } from "@/lib/pricing";
import { signQuote } from "@/lib/escrow/quote";
import { capabilities } from "@/lib/capabilities";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";
import { publicEscrow, publicUsdc, publicChainId } from "@/lib/chain";
import type { SignedQuote } from "@/lib/domain/types";

export async function POST(req: Request) {
  const body = await readJson<{
    thesisId: string;
    mode: string;
    maxPayout: string;
    taker?: string;
    template?: "directional" | "range" | "outside" | "stepped";
  }>(req);
  const thesis = mutate((s) => s.theses.find((t) => t.id === body.thesisId));
  if (!thesis) return fail("NOT_FOUND", "Confirm a view first.", 404);
  const family = await getTopic(thesis.topicSlug, body.mode === "live" ? "live" : "replay");
  if (!family) return fail("UNSUPPORTED_FAMILY", "Family unavailable");
  const maxPayout = parseUsdc(body.maxPayout || "100");
  try {
    const spec = compileView(
      family,
      body.template || thesis.template,
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
    const fee = priced.premium / 100n;
    const caps = capabilities();
    const taker = (body.taker as `0x${string}` | undefined) || "0x0000000000000000000000000000000000000000";
    const key = process.env.MAKER_PRIVATE_KEY as `0x${string}` | undefined;
    let quote: SignedQuote;
    if (caps.maker.state === "available" && key && publicEscrow()) {
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
      });
    } else {
      quote = {
        id: uid("q"),
        status: body.mode === "paper" ? "available" : "unavailable",
        maker: "0x0000000000000000000000000000000000000000",
        taker,
        escrow: publicEscrow() || "0x0000000000000000000000000000000000000000",
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
        signature: "0x",
        payouts: spec.rows.map((r) => r.payout.toString()),
        scenarioLabels: spec.rows.map((r) => r.label),
        unavailableReason:
          body.mode === "paper"
            ? undefined
            : caps.maker.reason,
      };
    }
    quote.id = uid("q");
    mutate((s) => {
      s.quotes.push(quote);
      thesis.status = "quoted";
    });
    const ctx = currentSession();
    if (ctx) {
      mutate((s) => {
        s.notifications.unshift({
          id: uid("n"),
          accountId: ctx.account.id,
          title: "Quote ready",
          body: priced.note,
          href: `/quotes/${quote.id}`,
          category: "trading",
          read: false,
          createdAt: new Date().toISOString(),
        });
      });
    }
    return ok({ quote, spec, note: priced.note, paper: body.mode === "paper" });
  } catch (err) {
    return fail("INCOMPATIBLE_RULES", err instanceof Error ? err.message : "Compile failed");
  }
}
