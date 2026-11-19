"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, modeFromStorage, OPEN_ASSISTANT_EVENT } from "@/lib/client";

type StructuredAction = { type: "navigate"; label: string; href: string };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; action?: StructuredAction };
type Conversation = { id: string; kind: "general" | "thesis"; thesisId: string | null; title: string; messages: Message[]; updatedAt: string };
type VoiceStatus = "ready" | "listening" | "transcribing" | "sending" | "speaking";

function safeAction(question: string, pathname: string): { action?: StructuredAction; reply: string } {
  const q = question.trim();
  const normalized = q.toLowerCase();
  const pathThesisId = pathname.match(/^\/theses\/([a-z0-9_-]+)/i)?.[1];
  const rememberedId = typeof window === "undefined" ? null : localStorage.getItem("thesis:last-active");
  const thesisId = pathThesisId || (rememberedId && /^th_[a-z0-9]+$/i.test(rememberedId) ? rememberedId : null);
  const destinations: [RegExp, string, string][] = [
    [/\b(my theses|thesis library|library|saved theses)\b/, "/theses", "Open My Theses"],
    [/\b(portfolio|my positions|holdings)\b/, "/portfolio", "Open Portfolio"],
    [/\b(dashboard|home)\b/, "/", "Open Dashboard"],
    [/\b(alerts|inbox|notifications)\b/, "/portfolio?view=alerts", "Open Portfolio alerts"],
    [/\b(activity|ledger|receipts)\b/, "/portfolio?view=activity", "Open Portfolio activity"],
    [/\b(orders|order history)\b/, "/portfolio?view=orders", "Open Portfolio orders"],
  ];
  for (const [pattern, href, label] of destinations) {
    if (pattern.test(normalized)) return { action: { type: "navigate", href, label }, reply: `I can take you to ${label}. Review the destination below before opening it.` };
  }
  if (thesisId) {
    const tabs: [RegExp, string, string][] = [
      [/\b(compare|alternatives)\b/, "compare", "Open Compare"],
      [/\b(build|basket|construction)\b/, "build", "Open Build"],
      [/\b(history|revisions|thesis history)\b/, "history", "Open thesis History"],
      [/\b(review|review trade|quote)\b/, "review", "Open trade Review"],
    ];
    for (const [pattern, segment, label] of tabs) {
      if (pattern.test(normalized)) return { action: { type: "navigate", href: `/theses/${thesisId}/${segment}`, label }, reply: `I can open ${label} for your most recent thesis. Review the destination below; your position or saved view will not change.` };
    }
  }
  if (/\b(search|find|explore|market|gemini|bitcoin|btc|ethereum|eth|price|prediction)\b/.test(normalized)) {
    const href = `/explore?view=gemini&q=${encodeURIComponent(q)}`;
    return { action: { type: "navigate", href, label: "Search Gemini markets" }, reply: "I can open Gemini market search with your wording prefilled. You can inspect the actual listed contracts and choose one before continuing." };
  }
  return { reply: "I can help you find a market, resume a thesis, or open a Portfolio view. Tell me what you want to inspect, or use the shortcuts below. Research and navigation never approve a financial action." };
}

function errorText(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied. Allow microphone access or continue with text.";
  if (name === "NotFoundError") return "No microphone was found. Connect one or continue with text.";
  if (name === "NotReadableError") return "The microphone is busy in another app. Close it or continue with text.";
  return error instanceof Error ? error.message : "The assistant request failed. Your text is still here to retry.";
}

export function ContextualAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [threadId, setThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("ready");
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [muted, setMuted] = useState(false);
  const [manageAction, setManageAction] = useState<"rename" | "delete" | null>(null);
  const [threadTitle, setThreadTitle] = useState("");
  const [managePending, setManagePending] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const recordingTimer = useRef<number | null>(null);
  const selectionMade = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);

  const builtInAssistant = /^\/topics\/[^/]+$/.test(pathname) || /^\/theses\/[^/]+(?:\/(?:build|compare|review))?$/.test(pathname);
  const current = threads.find((thread) => thread.id === threadId) || null;

  useEffect(() => {
    let active = true;
    api<{ conversations: Conversation[] }>("/api/conversations").then((result) => {
      if (!active) return;
      const next = result.conversations || [];
      setThreads(next);
      if (!selectionMade.current) setThreadId(next[0]?.id || "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Saved conversations could not be loaded."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    api<{ services: { id: string; state: string }[] }>("/api/status").then(({ services }) => {
      if (active) setVoiceAvailable(services.some((service) => service.id === "voice" && service.state === "available"));
    }).catch(() => { if (active) setVoiceAvailable(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const question = (event as CustomEvent<{ question?: string }>).detail?.question;
      setOpen(true);
      if (question) setDraft(question);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const stopTracks = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setMuted(false);
  }, []);
  const stopSpeech = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    if (voiceStatus === "speaking") setVoiceStatus("ready");
  }, [voiceStatus]);

  useEffect(() => () => {
    if (recordingTimer.current !== null) window.clearTimeout(recordingTimer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  async function newThread() {
    setError("");
    try {
      const result = await api<{ conversation: Conversation }>("/api/conversations", { method: "POST", body: JSON.stringify({ action: "create", kind: "general" }) });
      setThreads((items) => [result.conversation, ...items]);
      setThreadId(result.conversation.id);
      selectionMade.current = true;
      setNotice("New conversation created. It is saved to this guest or signed-in workspace.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a conversation."); }
  }

  function beginManageThread(action: "rename" | "delete") {
    if (!current) return;
    setError("");
    setThreadTitle(current.title);
    setManageAction(action);
  }

  async function submitManageThread() {
    if (!current || !manageAction) return;
    const action = manageAction;
    const title = threadTitle.trim();
    if (action === "rename" && !title) return;
    setManagePending(true);
    setError("");
    try {
      if (action === "rename") {
        const result = await api<{ conversation: Conversation }>("/api/conversations", { method: "POST", body: JSON.stringify({ action, id: current.id, title }) });
        setThreads((items) => items.map((thread) => thread.id === current.id ? result.conversation : thread));
        setNotice("Conversation renamed. Its messages and linked thesis are unchanged.");
      } else {
        await api("/api/conversations", { method: "POST", body: JSON.stringify({ action, id: current.id }) });
        setThreads((items) => items.filter((thread) => thread.id !== current.id));
        setThreadId(threads.find((thread) => thread.id !== current.id)?.id || "");
        selectionMade.current = true;
        setNotice("Conversation deleted. Thesis notes and positions are unchanged.");
      }
      setManageAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Conversation could not be updated."); }
    finally { setManagePending(false); }
  }

  async function send() {
    const question = draft.trim();
    if (!question || voiceStatus === "sending" || voiceStatus === "transcribing") return;
    setError("");
    setNotice("");
    setVoiceStatus("sending");
    try {
      let activeThread = current;
      if (!activeThread) {
        const created = await api<{ conversation: Conversation }>("/api/conversations", { method: "POST", body: JSON.stringify({ action: "create", kind: "general" }) });
        activeThread = created.conversation;
        setThreadId(activeThread.id);
        selectionMade.current = true;
      }
      const turns = [...activeThread.messages.map(({ role, content }) => ({ role, content })), { role: "user" as const, content: question }].slice(-8);
      const activePath = activeThread.kind === "thesis" && activeThread.thesisId ? `/theses/${activeThread.thesisId}` : pathname;
      const nav = safeAction(question, activePath);
      let answer = nav.reply;
      let action = nav.action;
      if (!action && activeThread.kind === "thesis" && activeThread.thesisId) {
        action = { type: "navigate", label: "Return to thesis Research", href: `/theses/${activeThread.thesisId}` };
        answer = "This conversation is linked to a thesis. I can reopen its Research workspace so we can continue with the saved market, view, and evidence.";
      }
      const topicSlug = pathname.match(/^\/topics\/([a-z0-9-]+)$/i)?.[1];
      const thesisId = pathname.match(/^\/theses\/([a-z0-9_-]+)/i)?.[1];
      if (!action && topicSlug) {
        const result = await api<{ answer?: string; clarificationPrompt?: string }>("/api/research", {
          method: "POST",
          body: JSON.stringify({ question, conversation: turns, slug: topicSlug, thesisId, mode: modeFromStorage(), context: "research" }),
        });
        answer = [result.answer, result.clarificationPrompt].filter(Boolean).join("\n\n") || "I could not form a research reply. Try again or switch to text.";
      }
      const result = await api<{ conversation: Conversation }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ action: "save-turn", id: activeThread.id, user: question, assistant: answer, ...(action ? { structuredAction: action } : {}) }),
      });
      setThreads((items) => [result.conversation, ...items.filter((thread) => thread.id !== result.conversation.id)].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      setThreadId(result.conversation.id);
      setDraft("");
      setNotice(action ? "Review the suggested destination before opening it. No view or position changes from this suggestion." : "Reply saved. No financial action was taken.");
    } catch (cause) {
      setError(errorText(cause));
    } finally { setVoiceStatus("ready"); }
  }

  async function startRecording() {
    setError("");
    setNotice("");
    try {
      const streamValue = await navigator.mediaDevices.getUserMedia({ audio: true });
      const selected = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const instance = new MediaRecorder(streamValue, selected ? { mimeType: selected } : undefined);
      stream.current = streamValue;
      recorder.current = instance;
      chunks.current = [];
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      instance.onerror = () => { stopTracks(); setVoiceStatus("ready"); setError("Recording failed. Switch to text or try again."); };
      instance.onstop = async () => {
        const blob = new Blob(chunks.current, { type: instance.mimeType || "audio/webm" });
        chunks.current = [];
        stopTracks();
        if (!blob.size) { setVoiceStatus("ready"); setError("No speech was recorded. Try again or type your question."); return; }
        const form = new FormData();
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
        form.append("audio", blob, `thesis-question.${ext}`);
        setVoiceStatus("transcribing");
        try {
          const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const result = await response.json() as { text?: string; error?: { message?: string } };
          if (!response.ok) throw new Error(result.error?.message || "Transcription failed.");
          setDraft(result.text || "");
          setNotice("Transcript is editable. Review it, then send it as a normal assistant request.");
        } catch (cause) { setError(errorText(cause)); }
        finally { setVoiceStatus("ready"); }
      };
      instance.start();
      recordingTimer.current = window.setTimeout(() => stopRecording(), 60_000);
      setVoiceStatus("listening");
    } catch (cause) { setError(errorText(cause)); setVoiceStatus("ready"); }
  }

  function stopRecording(discard = false) {
    if (recordingTimer.current !== null) window.clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    const instance = recorder.current;
    if (!instance || instance.state === "inactive") return;
    if (discard) {
      instance.ondataavailable = null;
      instance.onstop = () => { chunks.current = []; stopTracks(); setVoiceStatus("ready"); setNotice("Recording discarded. It was not sent for transcription."); };
    }
    instance.stop();
  }

  async function speak(text: string) {
    stopSpeech();
    setError("");
    setVoiceStatus("speaking");
    try {
      const response = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3_000) }) });
      if (!response.ok) {
        const result = await response.json() as { error?: { message?: string } };
        throw new Error(result.error?.message || "Spoken reply unavailable. The text remains available.");
      }
      const url = URL.createObjectURL(await response.blob());
      audioUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => { stopSpeech(); setVoiceStatus("ready"); };
      player.onerror = () => { stopSpeech(); setVoiceStatus("ready"); setError("Reply audio could not be played. The written response remains available."); };
      await player.play();
    } catch (cause) { stopSpeech(); setVoiceStatus("ready"); setError(errorText(cause)); }
  }

  if (builtInAssistant) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="contextual-assistant" className="assistant-launcher fixed bottom-16 right-4 z-40 rounded-full px-4 py-3 text-sm font-semibold md:bottom-5">
        {open ? "Close Thesis" : "Ask Thesis"}
      </button>
      {open ? <aside id="contextual-assistant" aria-label="Ask Thesis assistant" className="assistant-panel fixed inset-x-0 bottom-12 top-auto z-50 flex h-[min(78vh,720px)] flex-col md:inset-y-4 md:left-auto md:right-4 md:w-[430px] md:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <div><h2 className="font-serif text-xl">Ask Thesis</h2><p className="text-xs text-muted">Contextual research and navigation · no financial approvals</p></div>
          <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => setOpen(false)}>Close</button>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <label className="sr-only" htmlFor="assistant-thread">Conversation</label>
          <select id="assistant-thread" className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm" value={threadId} onChange={(event) => { selectionMade.current = true; setThreadId(event.target.value); }}>
            {!threads.length ? <option value="">New conversation</option> : null}
            {threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.kind === "thesis" ? `Thesis · ${thread.title}` : thread.title}</option>)}
          </select>
          <button type="button" className="min-h-10 rounded-lg border border-line px-2 text-sm" onClick={() => void newThread()}>New</button>
          {current ? <>
            <button type="button" className="min-h-10 rounded-lg border border-line px-2 text-sm" onClick={() => beginManageThread("rename")}>Rename</button>
            <button type="button" className="min-h-10 rounded-lg border border-line px-2 text-sm text-bad" onClick={() => beginManageThread("delete")}>Delete</button>
          </> : null}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {!current?.messages.length ? <div className="rounded-xl border border-line bg-white p-4"><p className="font-medium">What would you like to do?</p><p className="mt-1 text-sm text-muted">Ask about a supported market, resume a thesis, or move to a Portfolio view. I’ll show a destination for you to confirm.</p><div className="mt-3 flex flex-wrap gap-2">{[["Explore Gemini", "/explore?view=gemini"], ["My Theses", "/theses"], ["Portfolio", "/portfolio"]].map(([label, href]) => <button key={href} type="button" className="rounded-full border border-line px-3 py-2 text-xs hover:border-action" onClick={() => router.push(href)}>{label}</button>)}</div></div> : null}
          {current?.messages.map((message) => <article key={message.id} className={`rounded-xl border border-line p-3 ${message.role === "user" ? "ml-5 bg-[#E9EEFF]" : "mr-3 bg-white"}`}>
            <p className="text-xs font-semibold text-muted">{message.role === "user" ? "You" : "Thesis"}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{message.content}</p>
            {message.action ? <button type="button" className="mt-3 min-h-10 rounded-lg bg-action px-3 py-2 text-sm font-medium text-white" onClick={() => router.push(message.action!.href)}>Review destination · {message.action.label}</button> : null}
            {message.role === "assistant" && voiceAvailable ? <button type="button" className="mt-2 block text-xs text-action underline" onClick={() => voiceStatus === "speaking" ? stopSpeech() : void speak(message.content)}>{voiceStatus === "speaking" ? "Stop speaking" : "Speak reply"}</button> : null}
          </article>)}
        </div>
        <footer className="space-y-2 border-t border-line bg-white p-3">
          {error ? <p role="alert" className="rounded-lg bg-[#FFF3F1] p-2 text-sm text-bad">{error}</p> : null}
          {notice ? <p role="status" className="text-xs text-muted">{notice}</p> : null}
          {voiceStatus === "listening" ? <p className="text-xs text-muted">Listening. Mute pauses microphone input; stop transcribes, cancel discards.</p> : null}
          <label htmlFor="assistant-question" className="sr-only">Your question</label>
          <textarea id="assistant-question" className="min-h-20 w-full resize-y rounded-lg border border-line bg-[#FBFAF8] p-3 text-sm" maxLength={3000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about a market, thesis, or next step…" disabled={voiceStatus === "sending" || voiceStatus === "transcribing"} />
          <div className="flex flex-wrap justify-end gap-2">
            {voiceAvailable && voiceStatus !== "listening" ? <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => void startRecording()} disabled={voiceStatus !== "ready"}>Record</button> : null}
            {voiceStatus === "listening" ? <>
              <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => { const track = stream.current?.getAudioTracks()[0]; if (track) { track.enabled = muted; setMuted(!muted); } }}>{muted ? "Unmute" : "Mute"}</button>
              <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => stopRecording(true)}>Cancel recording</button>
              <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => stopRecording()}>Stop and transcribe</button>
              <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => stopRecording(true)}>Switch to text</button>
            </> : null}
            {voiceStatus === "speaking" ? <button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={stopSpeech}>Interrupt speech</button> : null}
            <button type="button" className="min-h-10 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void send()} disabled={!draft.trim() || voiceStatus === "sending" || voiceStatus === "transcribing" || voiceStatus === "listening"}>{voiceStatus === "sending" ? "Thinking…" : voiceStatus === "transcribing" ? "Transcribing…" : "Send"}</button>
          </div>
          {!voiceAvailable ? <p className="text-right text-xs text-muted">Voice is unavailable; text remains ready.</p> : null}
        </footer>
      </aside> : null}
      {manageAction ? <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !managePending) setManageAction(null); }}>
        <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-manage-title">
          <p className="source-pill">Conversation</p>
          <h2 id="assistant-manage-title" className="mt-3 font-serif text-2xl font-bold">{manageAction === "rename" ? "Rename conversation" : "Delete conversation?"}</h2>
          {manageAction === "rename" ? <label className="app-field mt-4 block"><span className="mb-1 block text-sm font-semibold">Conversation name</span><input className="app-input min-h-11 w-full px-3" autoFocus maxLength={100} value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} /></label> : <p className="mt-3 text-sm text-muted">“{current?.title}” and its assistant messages will be removed. Thesis drafts, saved views, evidence, and positions are unchanged.</p>}
          {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="app-button min-h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => setManageAction(null)} disabled={managePending}>Cancel</button><button type="button" className={`app-button min-h-11 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 ${manageAction === "delete" ? "bg-bad" : "bg-action"}`} onClick={() => void submitManageThread()} disabled={managePending || manageAction === "rename" && !threadTitle.trim()}>{managePending ? "Saving…" : manageAction === "rename" ? "Save name" : "Delete conversation"}</button></div>
        </section>
      </div> : null}
    </>
  );
}
