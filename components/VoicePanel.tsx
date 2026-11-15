"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export function VoicePanel({ slug, onProposal }: { slug: string; onProposal?: (text: string) => void }) {
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  async function typeAsk() {
    setStatus("thinking");
    setError("");
    try {
      const res = await api<{ answer: string }>(`/api/research`, {
        method: "POST",
        body: JSON.stringify({ question: transcript || "Help me form a range view", slug, mode: localStorage.getItem("thesis_mode") }),
      });
      setAnswer(res.answer);
      setStatus("ended");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
      setStatus("error");
    }
  }

  async function speak() {
    setStatus("speaking");
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: answer || transcript }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || "Voice unavailable");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      setStatus("ended");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice unavailable");
      setStatus("error");
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl">Talk through my view</h2>
        <span className="text-xs text-muted">{status}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Voice is optional. Text does the same work. The agent cannot accept a quote, approve tokens, or withdraw.
      </p>
      <textarea
        className="mt-3 min-h-24 w-full rounded-lg border border-line p-3"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="I expect bitcoin to finish between the listed thresholds…"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={typeAsk}>Type instead</Button>
        <Button kind="secondary" onClick={speak} disabled={!answer && !transcript}>
          Speak reply
        </Button>
        <Button kind="ghost" onClick={() => onProposal?.(transcript)} disabled={!transcript}>
          Accept proposed view
        </Button>
      </div>
      {answer ? <p className="mt-3 text-sm">{answer}</p> : null}
      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
    </Card>
  );
}
