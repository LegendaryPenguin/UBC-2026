import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { mutate, readStore, uid, type Account, type Session } from "@/lib/server/store";

const COOKIE = "thesis_session";
const GUEST_COOKIE = "thesis_guest";

export function thesisOwner(createGuest = false): string | undefined {
  const account = currentSession()?.account;
  if (account) return account.id;
  const guest = cookies().get(GUEST_COOKIE)?.value;
  if (guest && /^guest_[a-f0-9-]{36}$/.test(guest)) return guest;
  if (!createGuest) return undefined;
  const id = `guest_${randomUUID()}`;
  cookies().set(GUEST_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return id;
}

export function currentSession(): { session: Session; account: Account } | null {
  const id = cookies().get(COOKIE)?.value;
  if (!id) return null;
  const store = readStore();
  const session = store.sessions.find((s) => s.id === id && Date.parse(s.expiresAt) > Date.now());
  if (!session) return null;
  const account = store.accounts.find((a) => a.id === session.accountId && !a.closed);
  if (!account) return null;
  return { session, account };
}

export function requireAccount(): Account {
  const ctx = currentSession();
  if (!ctx) {
    const err = new Error("Sign in required");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return ctx.account;
}

export function createSession(accountId: string): Session {
  const session: Session = {
    id: uid("sess"),
    accountId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
  };
  mutate((s) => {
    s.sessions.push(session);
  });
  cookies().set(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 86400,
  });
  return session;
}

export function clearSession() {
  const id = cookies().get(COOKIE)?.value;
  if (id) {
    mutate((s) => {
      s.sessions = s.sessions.filter((x) => x.id !== id);
    });
  }
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}
