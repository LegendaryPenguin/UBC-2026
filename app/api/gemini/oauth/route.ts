import crypto from "node:crypto";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/server/session";
import { fail, ok, readJson } from "@/lib/server/http";
import {
  buildAuthorizationUrl,
  exchangeGeminiCode,
  geminiOAuthSetup,
  getGeminiConnection,
  revokeGeminiConnection,
  storeGeminiTokens,
} from "@/lib/gemini/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "gemini_oauth_state";
const VERIFIER_COOKIE = "gemini_oauth_verifier";
const FLOW_MAX_AGE = 600;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function clearFlowCookies() {
  cookies().set(STATE_COOKIE, "", cookieOptions(0));
  cookies().set(VERIFIER_COOKIE, "", cookieOptions(0));
}

function publicConnection(accountId: string) {
  const connection = getGeminiConnection(accountId);
  if (!connection) return null;
  return {
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt,
    expiresAt: connection.expiresAt,
    scopes: connection.scopes,
    canReadOrders: connection.scopes.includes("orders:read"),
    canTrade: connection.scopes.includes("orders:create"),
    canReadBalances: connection.scopes.includes("balances:read"),
  };
}

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const setup = geminiOAuthSetup();
  return ok({
    configured: setup.configured,
    missing: setup.missing,
    connection: publicConnection(ctx.account.id),
  });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ action: string; code?: string; state?: string; access?: "read" | "trade" }>(req);

  if (body.action === "start") {
    const setup = geminiOAuthSetup();
    if (!setup.configured) return fail("GEMINI_OAUTH_NOT_CONFIGURED", `Set ${setup.missing.join(", ")} before connecting a Gemini account.`, 503);
    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const access = body.access === "trade" ? "trade" : "read";
    try {
      const authorizationUrl = buildAuthorizationUrl(state, verifier, access === "trade");
      cookies().set(STATE_COOKIE, state, cookieOptions(FLOW_MAX_AGE));
      cookies().set(VERIFIER_COOKIE, verifier, cookieOptions(FLOW_MAX_AGE));
      return ok({ authorizationUrl, access });
    } catch (error) {
      return fail("GEMINI_OAUTH_NOT_CONFIGURED", error instanceof Error ? error.message : "Gemini OAuth is not configured", 503);
    }
  }

  if (body.action === "callback") {
    const expectedState = cookies().get(STATE_COOKIE)?.value || "";
    const verifier = cookies().get(VERIFIER_COOKIE)?.value || "";
    clearFlowCookies();
    if (!body.code || !body.state || !expectedState || !verifier) return fail("GEMINI_OAUTH_STATE", "The Gemini sign-in expired. Start the connection again.", 400);
    const expected = Buffer.from(expectedState);
    const actual = Buffer.from(body.state);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return fail("GEMINI_OAUTH_STATE", "Gemini returned an invalid sign-in state. Start the connection again.", 400);
    }
    try {
      const tokens = await exchangeGeminiCode(body.code, verifier);
      const connection = storeGeminiTokens(ctx.account.id, tokens);
      return ok({ connection: publicConnection(connection.accountId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini connection failed";
      return fail("GEMINI_OAUTH_FAILED", message, 502);
    }
  }

  return fail("INVALID", "Unknown Gemini OAuth action");
}

export async function DELETE() {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  try {
    await revokeGeminiConnection(ctx.account.id);
    return ok({ disconnected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini disconnection failed";
    return fail("GEMINI_REVOKE_FAILED", message, 502);
  }
}
