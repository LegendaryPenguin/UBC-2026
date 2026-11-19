"use client";

import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import { AppDialog } from "@/components/AppDialog";
import { useState } from "react";

export function SettingsPrivacy({ embedded = false }: { embedded?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  async function closeAccount() {
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
        <Button kind="danger" onClick={() => setConfirmClose(true)} disabled={busy}>{busy ? "Closing account…" : "Close account"}</Button>
      </Card>
      <AppDialog open={confirmClose} titleId="close-account-title" onClose={() => { if (!busy) setConfirmClose(false); }} closeOnBackdrop={!busy}>
        <p className="source-pill">Privacy</p>
        <h2 id="close-account-title" className="mt-3 font-serif text-2xl font-bold">Close this account data?</h2>
        <p className="mt-3 text-sm text-muted">Your offchain account data will be closed and you will be signed out. Public blockchain records and any onchain claims remain accessible from the connected wallet.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button kind="secondary" onClick={() => setConfirmClose(false)} disabled={busy}>Cancel</Button>
          <Button kind="danger" onClick={() => void closeAccount()} disabled={busy}>{busy ? "Closing…" : "Close account"}</Button>
        </div>
      </AppDialog>
    </div>
  );
}
