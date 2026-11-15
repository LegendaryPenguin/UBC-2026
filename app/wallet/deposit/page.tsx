"use client";

import { useAccount } from "wagmi";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { arcTestnet } from "@/lib/chain";

export default function Deposit() {
  const { address } = useAccount();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Deposit</h1>
      <Card className="space-y-3">
        <p className="text-sm">Supported route: direct Arc testnet transfer. Circle CCTP and fiat ramps are unavailable until those providers are wired. No fake card form is shown.</p>
        <Field label="Destination">
          <input className={inputCls("font-mono")} readOnly value={address || "Connect a wallet"} />
        </Field>
        <p className="text-xs text-muted">Network: {arcTestnet.name} ({arcTestnet.id}). Copying the address copies this network only.</p>
        <Button
          onClick={() => {
            if (address) navigator.clipboard.writeText(address);
          }}
        >
          Copy address
        </Button>
        <Button kind="ghost" onClick={() => alert("Tracking started. This does not credit a balance.")}>I sent funds</Button>
      </Card>
    </div>
  );
}
