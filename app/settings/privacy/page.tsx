"use client";

import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export default function Privacy() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Privacy and closure</h1>
      <Card className="space-y-3">
        <p className="text-sm">App deletion cannot erase blockchain records. Open onchain claims remain claimable from the wallet and contract even after account closure.</p>
        <Button
          kind="danger"
          onClick={async () => {
            if (!confirm("Close this account data? Onchain claims remain accessible from the wallet.")) return;
            await api("/api/account", { method: "PATCH", body: JSON.stringify({ closed: true }) });
            await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signout" }) });
            window.location.href = "/";
          }}
        >
          Close account
        </Button>
      </Card>
    </div>
  );
}
