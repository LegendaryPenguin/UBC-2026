import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  return ok({ account: ctx.account });
}

export async function PATCH(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<Record<string, unknown>>(req);
  if ("name" in body && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) return fail("INVALID", "Name must contain 1–100 characters.");
  if ("handle" in body && (typeof body.handle !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(body.handle.trim()))) return fail("INVALID", "Handle must be 3–30 letters, numbers, or underscores.");
  if ("timezone" in body) {
    if (typeof body.timezone !== "string" || body.timezone.length > 80) return fail("INVALID", "Enter a supported timezone.");
    try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }); } catch { return fail("INVALID", "Enter a supported timezone, such as America/Chicago."); }
  }
  if ("density" in body && body.density !== "beginner" && body.density !== "compact") return fail("INVALID", "Choose beginner or compact explanations.");
  if ("displayCurrency" in body && body.displayCurrency !== "USD") return fail("INVALID", "Only USD display is currently supported.");
  if ("interests" in body && (!Array.isArray(body.interests) || body.interests.length > 10 || body.interests.some((item) => typeof item !== "string" || !["crypto", "macro", "politics", "Crypto", "Macro", "Politics"].includes(item)))) return fail("INVALID", "Choose from the supported research interests.");
  if ("onboardingComplete" in body && typeof body.onboardingComplete !== "boolean") return fail("INVALID", "Preference completion must be true or false.");
  if ("closed" in body && typeof body.closed !== "boolean") return fail("INVALID", "Account status is invalid.");
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
