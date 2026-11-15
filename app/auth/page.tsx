"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <Card className="space-y-3">
        <Field label="Email" hint="Codes are issued locally for this demo. Responses do not reveal whether the email already exists.">
          <input className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            const res = await api<{ demoCode: string }>("/api/auth", { method: "POST", body: JSON.stringify({ action: "request", email }) });
            setDemo(res.demoCode);
            setMsg("Code sent.");
          }}
        >
          Send code
        </Button>
        {demo ? <p className="text-sm">Demo code: {demo}</p> : null}
        <Field label="One-time code">
          <input className={inputCls()} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Button
          kind="secondary"
          onClick={async () => {
            await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "verify", email, code }) });
            window.location.href = "/onboarding";
          }}
        >
          Verify
        </Button>
        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      </Card>
    </div>
  );
}
