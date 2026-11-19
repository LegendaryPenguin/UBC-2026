"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const returnTo = typeof window === "undefined" ? "/" : (() => {
    const value = new URLSearchParams(window.location.search).get("returnTo") || "/";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  })();

  async function submit(action: "request" | "verify") {
    setPending(true);
    setError("");
    setMsg("");
    if (action === "request") setDemo("");
    try {
      const res = await api<{ demoCode?: string }>("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action, email, code }),
      });
      if (action === "verify") {
        window.location.href = returnTo;
      } else {
        setDemo(res.demoCode ?? "");
        setMsg("Your local demo code is ready.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div><p className="source-pill">Thesis</p><h1 className="mt-3 font-serif text-3xl">Save your thinking</h1><p className="mt-2 text-sm text-muted">Sign in to keep theses, drafts, and research aligned across devices.</p></div>
      <Card className="space-y-3">
        <Button className="w-full" kind="secondary" disabled>Continue with Google · provider setup required</Button>
        <Button className="w-full" kind="secondary" disabled>Sign in with wallet · verification setup required</Button>
        <Button className="w-full" kind="ghost" onClick={() => { window.location.href = returnTo; }}>Continue as guest</Button>
        <div className="flex items-center gap-3 py-1 text-xs text-muted"><span className="h-px flex-1 bg-line"/><span>development sign-in</span><span className="h-px flex-1 bg-line"/></div>
        <p className="text-sm text-muted">This email-code flow is a local development demo, not production Google or wallet authentication. After verification, your guest drafts, watchlists, and assistant conversations move to this account; financial record IDs remain unchanged.</p>
        <Field label="Email" hint="Codes are issued locally for this demo. Responses do not reveal whether the email already exists.">
          <input className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button
          onClick={() => submit("request")}
          disabled={pending}
        >
          Send code
        </Button>
        {demo ? <p className="text-sm">Demo code: {demo}</p> : null}
        <Field label="One-time code">
          <input className={inputCls()} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Button
          kind="secondary"
          onClick={() => submit("verify")}
          disabled={pending}
        >
          Verify
        </Button>
        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      </Card>
    </div>
  );
}
