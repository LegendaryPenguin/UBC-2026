import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate } from "@/lib/server/store";

export async function PATCH(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<Record<string, unknown>>(req);
  const account = mutate((s) => {
    const a = s.accounts.find((x) => x.id === ctx.account.id);
    if (!a) return null;
    const allowed = [
      "name",
      "handle",
      "timezone",
      "displayCurrency",
      "density",
      "onboardingComplete",
      "interests",
      "wallet",
      "closed",
    ];
    for (const key of allowed) {
      if (key in body) (a as unknown as Record<string, unknown>)[key] = body[key];
    }
    return a;
  });
  return ok({ account });
}
