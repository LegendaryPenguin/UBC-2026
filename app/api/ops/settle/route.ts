import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";

export async function POST(req: Request) {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret || req.headers.get("x-operator") !== secret) return fail("AUTH", "Operator required", 401);
  const body = await readJson<{ positionId: string; action: "resolve" | "void"; scenarioIndex?: number }>(req);
  const position = mutate((s) => s.positions.find((p) => p.id === body.positionId));
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  if (body.action === "void") position.status = "voided";
  if (body.action === "resolve") {
    if (body.scenarioIndex == null) return fail("INVALID", "Scenario required");
    position.status = "resolved";
    position.scenarioIndex = body.scenarioIndex;
  }
  return ok({ position, note: "Offchain status only. Onchain resolve still requires the resolver key." });
}
