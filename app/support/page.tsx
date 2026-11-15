"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function Support() {
  const [category, setCategory] = useState("general");
  const [text, setText] = useState("");
  const [id, setId] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Support</h1>
      <Card className="space-y-3">
        <p className="text-sm">Never send seed phrases or private keys. Support cannot change contract payoffs.</p>
        <Field label="Category">
          <select className={inputCls()} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="general">General</option>
            <option value="transaction">Transaction</option>
            <option value="settlement">Settlement</option>
            <option value="curation">Market request</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea className={`${inputCls()} min-h-24 py-2`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            const res = await api<{ ticket: { id: string } }>("/api/support", { method: "POST", body: JSON.stringify({ category, text }) });
            setId(res.ticket.id);
          }}
        >
          Submit
        </Button>
        {id ? <p className="text-sm">Ticket {id}</p> : null}
      </Card>
    </div>
  );
}
