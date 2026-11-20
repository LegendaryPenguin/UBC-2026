import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
};

export function googleOAuthSetup() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").replace(/\/$/, "");
  const redirectUri = (process.env.GOOGLE_REDIRECT_URI?.trim() || `${appUrl}/api/auth/google/callback`);
  const missing = [
    ...(!clientId ? ["GOOGLE_CLIENT_ID"] : []),
    ...(!clientSecret ? ["GOOGLE_CLIENT_SECRET"] : []),
  ];
  return {
    clientId,
    clientSecret,
    redirectUri,
    appUrl,
    configured: missing.length === 0,
    missing,
  };
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function createCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function googleAuthorizeUrl(state: string, codeVerifier: string) {
  const setup = googleOAuthSetup();
  if (!setup.configured) throw new Error(`Missing Google OAuth configuration: ${setup.missing.join(", ")}`);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", setup.clientId);
  url.searchParams.set("redirect_uri", setup.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const setup = googleOAuthSetup();
  if (!setup.configured) throw new Error(`Missing Google OAuth configuration: ${setup.missing.join(", ")}`);
  const body = new URLSearchParams({
    code,
    client_id: setup.clientId,
    client_secret: setup.clientSecret,
    redirect_uri: setup.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<{ access_token: string; id_token?: string; token_type: string; expires_in: number }>;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google profile lookup failed (${response.status})`);
  const profile = await response.json() as GoogleProfile;
  if (!profile.sub || !profile.email) throw new Error("Google profile was missing required identity fields");
  return profile;
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
