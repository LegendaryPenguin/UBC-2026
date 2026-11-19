"use client";

import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import { useState } from "react";

export function SettingsPrivacy({ embedded = false }: { embedded?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function closeAccount() {
    if (!confirm("Close this account data? Onchain claims remain accessible from the wallet.")) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ closed: true }) });
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signout" }) });
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account closure could not be confirmed. Retry or contact support.");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {!embedded ? <h1 className="font-serif text-3xl">Privacy and closure</h1> : null}
      <Card className="space-y-3">
        <p className="text-sm">App deletion cannot erase blockchain records. Open onchain claims remain claimable from the wallet and contract even after account closure.</p>
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
        <Button kind="danger" onClick={() => void closeAccount()} disabled={busy}>{busy ? "Closing account…" : "Close account"}</Button>
      </Card>
    </div>
  );
}
