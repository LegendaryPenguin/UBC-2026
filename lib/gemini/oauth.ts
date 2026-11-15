import crypto from "node:crypto";
import { mutate, readStore, type GeminiConnection } from "@/lib/server/store";

const AUTH_URL = "https://exchange.gemini.com/auth";
const TOKEN_URL = "https://exchange.gemini.com/auth/token";
const REVOKE_URL = "https://exchange.gemini.com/auth/token/revoke";
const DEFAULT_SCOPES = ["orders:read", "balances:read"];

export interface GeminiOAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
}

export function geminiOAuthSetup() {
  const clientId = process.env.GEMINI_OAUTH_CLIENT_ID?.trim() || "";
  const redirectUri = process.env.GEMINI_OAUTH_REDIRECT_URI?.trim() || "";
  const encryptionKey = process.env.GEMINI_TOKEN_ENCRYPTION_KEY?.trim() || "";
  const validEncryptionKey = encryptionKey && Buffer.from(encryptionKey, "base64url").length === 32;
  const missing = [
    ...(!clientId ? ["GEMINI_OAUTH_CLIENT_ID"] : []),
    ...(!redirectUri ? ["GEMINI_OAUTH_REDIRECT_URI"] : []),
    ...(!validEncryptionKey ? ["GEMINI_TOKEN_ENCRYPTION_KEY (32-byte base64url value)"] : []),
  ];
  return { clientId, redirectUri, configured: missing.length === 0, missing };
}

function encryptionKey(): Buffer {
  const value = process.env.GEMINI_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("Gemini token encryption is not configured");
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("Gemini token encryption key must be 32 bytes, base64url encoded");
  return key;
}

export function encryptGeminiToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptGeminiToken(value: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Stored Gemini token has an invalid format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getGeminiConnection(accountId: string): GeminiConnection | null {
  return readStore().geminiConnections.find((connection) => connection.accountId === accountId) ?? null;
}

export function buildAuthorizationUrl(state: string, codeVerifier: string, requestTradingScope: boolean) {
  const setup = geminiOAuthSetup();
  if (!setup.configured) throw new Error(`Missing Gemini OAuth configuration: ${setup.missing.join(", ")}`);
  const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", setup.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", setup.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", [...DEFAULT_SCOPES, ...(requestTradingScope ? ["orders:create"] : [])].join(","));
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeGeminiCode(code: string, codeVerifier: string): Promise<GeminiOAuthTokens> {
  const setup = geminiOAuthSetup();
  if (!setup.configured) throw new Error(`Missing Gemini OAuth configuration: ${setup.missing.join(", ")}`);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: setup.clientId,
      code,
      redirect_uri: setup.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gemini token exchange failed (${response.status})`);
  const tokens = await response.json() as Partial<GeminiOAuthTokens>;
  if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) {
    throw new Error("Gemini returned an incomplete OAuth token response");
  }
  return tokens as GeminiOAuthTokens;
}

export function storeGeminiTokens(accountId: string, tokens: GeminiOAuthTokens): GeminiConnection {
  const setup = geminiOAuthSetup();
  const now = new Date().toISOString();
  const connection: GeminiConnection = {
    accountId,
    clientId: setup.clientId,
    accessTokenCiphertext: encryptGeminiToken(tokens.access_token),
    refreshTokenCiphertext: encryptGeminiToken(tokens.refresh_token),
    scopes: (tokens.scope || "").split(/[ ,]+/).filter(Boolean),
    expiresAt: new Date(Date.now() + Math.max(0, tokens.expires_in) * 1000).toISOString(),
    connectedAt: now,
    updatedAt: now,
  };
  mutate((store) => {
    const index = store.geminiConnections.findIndex((item) => item.accountId === accountId);
    if (index >= 0) {
      connection.connectedAt = store.geminiConnections[index].connectedAt;
      store.geminiConnections[index] = connection;
    } else {
      store.geminiConnections.push(connection);
    }
  });
  return connection;
}

async function refreshTokens(connection: GeminiConnection): Promise<GeminiConnection> {
  const setup = geminiOAuthSetup();
  const refreshToken = decryptGeminiToken(connection.refreshTokenCiphertext);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: connection.clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gemini token refresh failed (${response.status})`);
  const tokens = await response.json() as Partial<GeminiOAuthTokens>;
  if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in) || (tokens.expires_in as number) <= 0) {
    throw new Error("Gemini returned an incomplete refreshed token response");
  }
  const rotated: GeminiOAuthTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || "bearer",
    scope: tokens.scope || connection.scopes.join(","),
    expires_in: tokens.expires_in as number,
  };
  const saved = storeGeminiTokens(connection.accountId, rotated);
  return saved;
}

const refreshes = new Map<string, Promise<GeminiConnection>>();

export async function geminiAccessToken(accountId: string): Promise<{ token: string; scopes: string[] }> {
  let connection = getGeminiConnection(accountId);
  if (!connection) throw new Error("Gemini account is not connected");
  if (Date.parse(connection.expiresAt) <= Date.now() + 60_000) {
    let pending = refreshes.get(accountId);
    if (!pending) {
      pending = refreshTokens(connection).finally(() => refreshes.delete(accountId));
      refreshes.set(accountId, pending);
    }
    connection = await pending;
  }
  return { token: decryptGeminiToken(connection.accessTokenCiphertext), scopes: connection.scopes };
}

export async function revokeGeminiConnection(accountId: string): Promise<void> {
  const connection = getGeminiConnection(accountId);
  if (!connection) return;
  const refreshToken = decryptGeminiToken(connection.refreshTokenCiphertext);
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: connection.clientId, token: refreshToken }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gemini token revocation failed (${response.status})`);
  mutate((store) => {
    store.geminiConnections = store.geminiConnections.filter((item) => item.accountId !== accountId);
  });
}
