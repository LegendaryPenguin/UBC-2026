import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createCodeVerifier,
  createOAuthState,
  googleAuthorizeUrl,
  googleOAuthSetup,
  safeReturnTo,
} from "@/lib/server/google-oauth";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";
const VERIFIER_COOKIE = "google_oauth_verifier";
const RETURN_COOKIE = "google_oauth_return";

export async function GET(req: Request) {
  const setup = googleOAuthSetup();
  const url = new URL(req.url);
  if (url.searchParams.get("status") === "1") {
    return ok({ configured: setup.configured, missing: setup.missing, redirectUri: setup.redirectUri });
  }
  if (!setup.configured) {
    return fail("UNAVAILABLE", `Google sign-in is not configured. Add ${setup.missing.join(", ")} to .env.local.`, 503);
  }

  const state = createOAuthState();
  const verifier = createCodeVerifier();
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const jar = cookies();
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" };
  jar.set(STATE_COOKIE, state, cookieOpts);
  jar.set(VERIFIER_COOKIE, verifier, cookieOpts);
  jar.set(RETURN_COOKIE, returnTo, cookieOpts);

  return NextResponse.redirect(googleAuthorizeUrl(state, verifier));
}
