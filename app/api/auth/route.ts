import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { googleOAuthSetup } from "@/lib/server/google-oauth";
import { fail, ok, readJson } from "@/lib/server/http";
import { clearSession, createSession, currentSession } from "@/lib/server/session";
import { migrateGuestData, mutate, storeBackend, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  const google = googleOAuthSetup();
  return ok({
    account: ctx?.account ?? null,
    auth: {
      googleConfigured: google.configured,
      googleMissing: google.missing,
      googleRedirectUri: google.redirectUri,
      emailDemoEnabled: process.env.NODE_ENV === "development",
      storage: storeBackend(),
    },
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ action: string; email?: string; code?: string; name?: string }>(req);
  if ((body.action === "request" || body.action === "verify") && process.env.NODE_ENV !== "development") {
    return fail("UNAVAILABLE", "Email sign-in requires a configured verification provider.", 503);
  }
  if (body.action === "request") {
    const email = (body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return fail("INVALID", "Enter an email address.");
    const code = String(randomInt(100000, 1000000));
    mutate((s) => {
      s.codes = s.codes.filter((c) => c.email !== email);
      s.codes.push({ email, code, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    });
    return ok({ sent: true, demoCode: code });
  }
  if (body.action === "verify") {
    const email = (body.email || "").trim().toLowerCase();
    const found = mutate((s) => s.codes.find((c) => c.email === email && c.code === body.code && Date.parse(c.expiresAt) > Date.now()));
    if (!found) return fail("INVALID", "That code is expired or incorrect.", 401);
    const account = mutate((s) => {
      let acc = s.accounts.find((a) => a.email === email && !a.closed);
      if (!acc) {
        acc = {
          id: uid("acct"),
          email,
          handle: email.split("@")[0],
          name: body.name || email.split("@")[0],
          createdAt: new Date().toISOString(),
          timezone: "America/Chicago",
          displayCurrency: "USD",
          density: "beginner",
          onboardingComplete: false,
          interests: [],
          wallet: null,
          closed: false,
          googleId: null,
          authProvider: "email",
          avatarUrl: null,
        };
        s.accounts.push(acc);
      }
      s.codes = s.codes.filter((c) => c.email !== email);
      return acc;
    });
    const guestId = cookies().get("thesis_guest")?.value;
    if (guestId && /^guest_[a-f0-9-]{36}$/.test(guestId)) {
      migrateGuestData(guestId, account.id);
      cookies().set("thesis_guest", "", { path: "/", maxAge: 0 });
    }
    createSession(account.id);
    return ok({ account });
  }
  if (body.action === "signout") {
    clearSession();
    return ok({ ok: true });
  }
  return fail("INVALID", "Unknown action");
}
