"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type PendingAction = {
  type: "navigate";
  label: string;
  href: string;
};

type RealtimeVoiceSessionProps = {
  available: boolean;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
  onError?: (message: string) => void;
  onPendingAction?: (action: PendingAction) => void;
  compact?: boolean;
};

function isSafeHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return false;
  try {
    const parsed = new URL(href, "https://thesis.local");
    return parsed.origin === "https://thesis.local" &&
      /^\/(|explore|theses|portfolio|theses\/[A-Za-z0-9_-]+(?:\/(?:build|compare|review|history))?|topics\/[a-z0-9-]+)$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function RealtimeVoiceControls({
  available,
  onTranscript,
  onError,
  onPendingAction,
  compact = false,
}: RealtimeVoiceSessionProps) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const clientTools = useMemo(() => ({
    propose_navigation: async (parameters: { label?: string; href?: string }) => {
      const label = typeof parameters.label === "string" ? parameters.label.trim().slice(0, 80) : "Open destination";
      const href = typeof parameters.href === "string" ? parameters.href.trim() : "";
      if (!isSafeHref(href)) return "That destination is not allowlisted. Ask the user to choose Explore, My Theses, Portfolio, or a thesis workspace path.";
      const action = { type: "navigate" as const, label, href };
      setPendingAction(action);
      onPendingAction?.(action);
      return "Showed a destination for the user to confirm. Do not claim the destination was opened.";
    },
  }), [onPendingAction]);

  const conversation = useConversation({
    clientTools,
    onConnect: () => {
      setBusy(false);
      setLocalError("");
    },
    onDisconnect: () => setBusy(false),
    onError: (message) => {
      const text = typeof message === "string" && message.trim()
        ? message
        : "Realtime voice disconnected. Push-to-talk and text remain available.";
      setLocalError(text);
      onError?.(text);
      setBusy(false);
    },
    onMessage: (message) => {
      const role = message.role === "user" || message.source === "user" ? "user" : "assistant";
      const text = typeof message.message === "string" ? message.message.trim() : "";
      if (text) onTranscript?.(text, role);
    },
  });

  const connected = conversation.status === "connected";
  const speaking = conversation.isSpeaking;

  useEffect(() => () => {
    if (conversation.status === "connected") conversation.endSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (!available || busy || connected) return;
    setBusy(true);
    setLocalError("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const response = await fetch("/api/voice/realtime-token", { method: "POST" });
      const body = await response.json() as { token?: string; error?: { message?: string } };
      if (!response.ok || !body.token) throw new Error(body.error?.message || "Realtime voice is unavailable. Use Record or text instead.");
      conversation.startSession({ conversationToken: body.token });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Realtime voice could not start. Use Record or text instead.";
      setLocalError(message);
      onError?.(message);
      setBusy(false);
    }
  }, [available, busy, connected, conversation, onError]);

  const end = useCallback(() => {
    setBusy(true);
    try {
      conversation.endSession();
    } finally {
      setBusy(false);
    }
  }, [conversation]);

  if (!available) {
    return <p className="text-xs text-muted">Realtime Talk is unavailable. Record and text remain ready.</p>;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-xl border border-line bg-[#F8F9FF] p-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {!connected ? (
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#E9EEFF] px-3 text-sm font-semibold text-action disabled:opacity-50"
            onClick={() => void start()}
            disabled={busy}
          >
            <span aria-hidden="true">🎙</span>{busy ? "Connecting…" : "Talk"}
          </button>
        ) : (
          <>
            <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => conversation.setVolume({ volume: speaking ? 0 : 1 })}>
              {speaking ? "Mute agent" : "Unmute agent"}
            </button>
            <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={end} disabled={busy}>
              End conversation
            </button>
          </>
        )}
        <p className="text-xs text-muted" role="status">
          {connected ? (speaking ? "Agent speaking · interrupt by talking" : "Listening") : "Realtime Talk uses a private ElevenLabs session"}
        </p>
      </div>
      {localError ? <p role="alert" className="text-sm text-bad">{localError}</p> : null}
      {pendingAction ? (
        <div className="rounded-lg border border-action/30 bg-white p-3">
          <p className="text-sm font-medium">Review destination before opening</p>
          <p className="mt-1 text-xs text-muted">Voice never navigates, edits a thesis, requests a quote, or executes on its own.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="inline-flex min-h-10 items-center rounded-lg bg-action px-3 text-sm font-semibold text-white" href={pendingAction.href} onClick={() => setPendingAction(null)}>
              Review destination · {pendingAction.label}
            </a>
            <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => setPendingAction(null)}>Dismiss</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RealtimeVoiceSession(props: RealtimeVoiceSessionProps) {
  if (!props.available) {
    return <p className="text-xs text-muted">Realtime Talk is unavailable. Record and text remain ready.</p>;
  }
  return (
    <ConversationProvider>
      <RealtimeVoiceControls {...props} />
    </ConversationProvider>
  );
}
