import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const position = mutate((s) => s.positions.find((p) => p.id === params.id));
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  return ok({ position });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<{ action: string; scenarioIndex?: number; txHash?: string }>(req);
  const position = mutate((s) => s.positions.find((p) => p.id === params.id));
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  if (body.action === "claim") {
    if (position.mode !== "paper" && !body.txHash) {
      return fail("UNAVAILABLE", "Live claims require a transaction hash.");
    }
    position.status = "claimed";
    mutate((s) => {
      s.transactions.push({
        id: `tx_${Date.now()}`,
        accountId: position.accountId,
        type: "claim",
        status: "confirmed",
        hash: body.txHash || null,
        amount: position.payouts[position.scenarioIndex ?? 0] || "0",
        unit: "USDC",
        related: position.id,
        error: null,
        createdAt: new Date().toISOString(),
      });
    });
  }
  if (body.action === "resolve" && body.scenarioIndex != null) {
    position.status = "resolved";
    position.scenarioIndex = body.scenarioIndex;
  }
  if (body.action === "void") position.status = "voided";
  if (body.action === "exit") {
    if (position.mode !== "paper") {
      return fail("UNAVAILABLE", "Live exits require a funded buyback on the escrow contract.");
    }
    position.status = "exited";
  }
  return ok({ position });
}
