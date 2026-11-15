"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export default function GeminiOAuthCallback() {
  const started = useRef(false);
  const [state, setState] = useState<"working" | "connected" | "failed">("working");
  const [message, setMessage] = useState("Finishing the secure Gemini connection…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      setState("failed");
      setMessage("Gemini authorization was cancelled or denied.");
      return;
    }
    const code = params.get("code");
    const oauthState = params.get("state");
    if (!code || !oauthState) {
      setState("failed");
      setMessage("Gemini did not return the authorization details. Start the connection again.");
      return;
    }
    window.history.replaceState({}, "", "/settings/connections/gemini/callback");
    api("/api/gemini/oauth", {
      method: "POST",
      body: JSON.stringify({ action: "callback", code, state: oauthState }),
    }).then(() => {
      setState("connected");
      setMessage("Gemini is connected. Review the permissions before opening your orders.");
    }).catch((error) => {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "Gemini could not be connected.");
    });
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-xs uppercase tracking-wide text-muted">Gemini connection</p>
      <h1 className="font-serif text-3xl">{state === "connected" ? "Connected" : state === "failed" ? "Connection not completed" : "Connecting"}</h1>
      <Card>
        <p role="status" className="text-sm">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== "working" ? <Button href="/settings/connections">Connection settings</Button> : null}
          {state === "connected" ? <Button href="/orders" kind="ghost">View Gemini orders</Button> : null}
        </div>
      </Card>
    </div>
  );
}
