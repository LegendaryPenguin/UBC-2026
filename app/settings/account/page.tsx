"use client";

import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useState } from "react";

export default function AccountSettings() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Account</h1>
      <Card className="space-y-3">
        <Field label="Name"><input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Handle"><input className={inputCls()} value={handle} onChange={(e) => setHandle(e.target.value)} /></Field>
        <Button onClick={() => api("/api/account", { method: "PATCH", body: JSON.stringify({ name, handle }) })}>Save</Button>
        <Button href="/settings/privacy" kind="danger">Close account</Button>
      </Card>
    </div>
  );
}
