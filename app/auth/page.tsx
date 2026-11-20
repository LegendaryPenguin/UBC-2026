"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

type AuthMeta = {
  googleConfigured?: boolean;
  googleMissing?: string[];
  googleRedirectUri?: string;
  emailDemoEnabled?: boolean;
};

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [auth, setAuth] = useState<AuthMeta>({});
  const returnTo = typeof window === "undefined" ? "/" : (() => {
    const value = new URLSearchParams(window.location.search).get("returnTo") || "/";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  })();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) setError(oauthError);
    api<{ auth?: AuthMeta }>("/api/auth")
      .then((result) => setAuth(result.auth || {}))
      .catch(() => setAuth({}));
  }, []);

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

  function startGoogle() {
    window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <p className="source-pill">Thesis</p>
        <h1 className="mt-3 font-serif text-3xl">Save your thinking</h1>
        <p className="mt-2 text-sm text-muted">Sign in to keep theses, drafts, and research aligned across devices.</p>
      </div>
      <Card className="space-y-3">
        {auth.googleConfigured ? (
          <Button className="w-full" icon="user" onClick={startGoogle}>Continue with Google</Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-[var(--th-warning)]/30 bg-[var(--th-warning-bg)] p-3">
            <Button className="w-full" kind="secondary" disabled>Continue with Google · credentials missing</Button>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-[var(--th-warning)]">
              <li>Create an OAuth Web client in Google Cloud Console.</li>
              <li>Add redirect URI <code className="break-all">{auth.googleRedirectUri || "http://localhost:3002/api/auth/google/callback"}</code>.</li>
              <li>Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.</li>
              <li>Restart <code>npm run dev</code> — this button enables only after those values load.</li>
            </ol>
          </div>
        )}
        <Button className="w-full" kind="secondary" disabled>Sign in with wallet · verification setup required</Button>
        <Button className="w-full" kind="ghost" onClick={() => { window.location.href = returnTo; }}>Continue as guest</Button>

        {auth.emailDemoEnabled ? (
          <>
            <div className="flex items-center gap-3 py-1 text-xs text-muted"><span className="h-px flex-1 bg-line" /><span>development fallback</span><span className="h-px flex-1 bg-line" /></div>
            <p className="text-sm text-muted">Email codes are a local development fallback. Google is the primary sign-in once credentials are set. Guest drafts move onto the signed-in account.</p>
            <Field label="Email" hint="Codes are issued locally for this demo.">
              <input className={inputCls()} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button onClick={() => submit("request")} disabled={pending}>Send code</Button>
            {demo ? <p className="text-sm">Demo code: {demo}</p> : null}
            <Field label="One-time code">
              <input className={inputCls()} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button kind="secondary" onClick={() => submit("verify")} disabled={pending}>Verify</Button>
          </>
        ) : null}

        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      </Card>
    </div>
  );
}
