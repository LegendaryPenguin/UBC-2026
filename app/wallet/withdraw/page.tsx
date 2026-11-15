"use client";

import { useState } from "react";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function Withdraw() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Withdraw</h1>
      <Card className="space-y-3">
        <p className="text-sm">Reserved escrow collateral cannot be withdrawn. Closing this page does not undo a submitted transfer.</p>
        <Field label="Recipient">
          <input className={inputCls("font-mono")} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Amount (USDC)">
          <input className={inputCls()} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button
          onClick={() => {
            if (!to.startsWith("0x") || to.length !== 42) {
              alert("Review the recipient address.");
              return;
            }
            alert("Use your wallet to send. Thesis does not custody keys.");
          }}
        >
          Send
        </Button>
      </Card>
    </div>
  );
}
