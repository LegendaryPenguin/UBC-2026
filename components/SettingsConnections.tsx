"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Banner, Button, Card, Empty } from "@/components/ui";

type GeminiConnectionStatus = {
  configured: boolean;
  missing: string[];
  connection: null | {
    connectedAt: string;
    updatedAt: string;
    expiresAt: string;
    scopes: string[];
    canReadOrders: boolean;
    canTrade: boolean;
    canReadBalances: boolean;
  };
};

export function SettingsConnections({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<GeminiConnectionStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api<GeminiConnectionStatus>("/api/gemini/oauth"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection status could not be loaded");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect(access: "read" | "trade") {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>("/api/gemini/oauth", {
        method: "POST",
        body: JSON.stringify({ action: "start", access }),
      });
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini connection could not start");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await api("/api/gemini/oauth", { method: "DELETE" });
      setConfirmDisconnect(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini could not be disconnected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Account settings</p>
        {embedded ? <h2 className="font-serif text-2xl">Connections</h2> : <h1 className="font-serif text-3xl">Connections</h1>}
      </div>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-muted">Loading connection status…</p> : null}

      {data && !data.configured ? (
        <Banner title="Gemini authorization is not configured">
          Register a Gemini OAuth application and set {data.missing.join(", ")}. The redirect URI must exactly match the URI registered with Gemini. Tokens are encrypted before storage and are never returned to the browser.
        </Banner>
      ) : null}

      {data?.connection ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Gemini connected</p>
              <p className="text-sm text-muted">Connected {new Date(data.connection.connectedAt).toLocaleString()}</p>
            </div>
            <Button kind="ghost" onClick={load} disabled={busy}>Refresh status</Button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Authorized permissions</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {data.connection.scopes.map((scope) => <li key={scope}>{scope}</li>)}
            </ul>
          </div>
          <p className="text-sm text-muted">
            Order history: {data.connection.canReadOrders ? "available" : "not authorized"} · Trading: {data.connection.canTrade ? "authorized" : "not authorized"} · Balances: {data.connection.canReadBalances ? "available" : "not authorized"}
          </p>
          <p className="text-xs text-muted">Gemini refresh tokens stay encrypted on this server. Disconnect revokes the app token where Gemini is reachable; it does not cancel venue orders.</p>
          <div className="flex flex-wrap gap-2">
            {!data.connection.canTrade ? <Button kind="secondary" onClick={() => connect("trade")} disabled={busy}>Enable trading permission</Button> : null}
            <Button kind="danger" onClick={() => setConfirmDisconnect(true)} disabled={busy}>{busy ? "Working…" : "Disconnect Gemini"}</Button>
            <Button href="/orders" kind="ghost">View orders</Button>
          </div>
        </Card>
      ) : null}

      {data?.configured && !data.connection ? (
        <Card className="space-y-3">
          <div>
            <h2 className="font-serif text-xl">Gemini prediction markets</h2>
            <p className="mt-1 text-sm text-muted">Link your own Gemini account. Approval, market eligibility, and Gemini's terms remain controlled by Gemini.</p>
          </div>
          <p className="text-sm">Start with read-only order and balance access. Trading permission is a separate Gemini consent flow.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => connect("read")} disabled={busy}>Connect read only</Button>
            <Button kind="secondary" onClick={() => connect("trade")} disabled={busy}>Connect with trading</Button>
          </div>
        </Card>
      ) : null}

      {error.includes("Sign in required") ? <Empty title="Sign in to manage connections"><Button href="/auth">Sign in</Button></Empty> : null}
      <Card>
        <h2 className="font-serif text-xl">Wallet connection</h2>
        <p className="mt-2 text-sm text-muted">Wallet unlink cannot erase chain history or revoke allowances. Review wallet approvals separately from Gemini access.</p>
        <Button href="/wallet" kind="ghost">Open wallet settings</Button>
      </Card>
      {confirmDisconnect ? <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmDisconnect(false); }}>
        <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="disconnect-gemini-title">
          <p className="source-pill">Gemini account</p>
          <h2 id="disconnect-gemini-title" className="mt-3 font-serif text-2xl font-bold">Disconnect Gemini?</h2>
          <p className="mt-3 text-sm">This revokes the app’s stored authorization where Gemini is reachable. It does not cancel open orders or close positions. You can connect again from Settings.</p>
          {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="app-button min-h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => setConfirmDisconnect(false)} disabled={busy}>Keep connected</button><button type="button" className="app-button min-h-11 rounded-lg bg-bad px-5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void disconnect()} disabled={busy}>{busy ? "Disconnecting…" : "Disconnect Gemini"}</button></div>
        </section>
      </div> : null}
    </div>
  );
}
