import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleOAuthSetup,
  safeReturnTo,
} from "@/lib/server/google-oauth";
import { createSession } from "@/lib/server/session";
import { migrateGuestData, mutate, uid } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";
const VERIFIER_COOKIE = "google_oauth_verifier";
const RETURN_COOKIE = "google_oauth_return";

function clearOAuthCookies() {
  const jar = cookies();
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, RETURN_COOKIE]) {
    jar.set(name, "", { path: "/", maxAge: 0 });
  }
}

function redirectWithError(appUrl: string, returnTo: string, message: string) {
  const target = new URL("/auth", appUrl);
  target.searchParams.set("returnTo", returnTo);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

export async function GET(req: Request) {
  const setup = googleOAuthSetup();
  const url = new URL(req.url);
  const jar = cookies();
  const returnTo = safeReturnTo(jar.get(RETURN_COOKIE)?.value);
  const expectedState = jar.get(STATE_COOKIE)?.value || "";
  const verifier = jar.get(VERIFIER_COOKIE)?.value || "";
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const oauthError = url.searchParams.get("error");

  if (!setup.configured) {
    clearOAuthCookies();
    return redirectWithError(setup.appUrl, returnTo, "Google sign-in is not configured on this server.");
  }
  if (oauthError) {
    clearOAuthCookies();
    return redirectWithError(setup.appUrl, returnTo, oauthError === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed (${oauthError}).`);
  }
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    clearOAuthCookies();
    return redirectWithError(setup.appUrl, returnTo, "Google sign-in expired. Try again.");
  }

  try {
    const tokens = await exchangeGoogleCode(code, verifier);
    const profile = await fetchGoogleProfile(tokens.access_token);
    if (!profile.email_verified) {
      clearOAuthCookies();
      return redirectWithError(setup.appUrl, returnTo, "Verify your Google email, then try again.");
    }

    const email = profile.email.trim().toLowerCase();
    const account = mutate((store) => {
      let existing = store.accounts.find((item) => !item.closed && (item.googleId === profile.sub || item.email === email));
      if (!existing) {
        existing = {
          id: uid("acct"),
          email,
          handle: (profile.given_name || email.split("@")[0] || "researcher").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "researcher",
          name: profile.name || profile.given_name || email.split("@")[0],
          createdAt: new Date().toISOString(),
          timezone: "America/Chicago",
          displayCurrency: "USD",
          density: "beginner",
          onboardingComplete: false,
          interests: [],
          wallet: null,
          closed: false,
          googleId: profile.sub,
          authProvider: "google",
          avatarUrl: profile.picture || null,
        };
        store.accounts.push(existing);
      } else {
        existing.googleId = profile.sub;
        existing.authProvider = "google";
        existing.avatarUrl = profile.picture || existing.avatarUrl || null;
        if (profile.name) existing.name = profile.name;
        if (!existing.email) existing.email = email;
      }
      return existing;
    });

    const guestId = jar.get("thesis_guest")?.value;
    if (guestId && /^guest_[a-f0-9-]{36}$/.test(guestId)) {
      migrateGuestData(guestId, account.id);
      jar.set("thesis_guest", "", { path: "/", maxAge: 0 });
    }

    createSession(account.id);
    clearOAuthCookies();
    return NextResponse.redirect(new URL(returnTo, setup.appUrl));
  } catch (cause) {
    clearOAuthCookies();
    const message = cause instanceof Error ? cause.message : "Google sign-in failed.";
    return redirectWithError(setup.appUrl, returnTo, message);
  }
}
