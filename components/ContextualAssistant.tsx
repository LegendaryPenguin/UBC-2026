"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, dataContextFromStorage, OPEN_ASSISTANT_EVENT } from "@/lib/client";
import { AppDialog } from "@/components/AppDialog";
import { ConversationalMic } from "@/components/ConversationalMic";
import { Icon } from "@/components/thesis";
import { researchConversation } from "@/lib/research";
import { useResearchNotebook } from "@/lib/use-research-notebook";

type StructuredAction = { type: "navigate"; label: string; href: string };
type MarketOption = { slug: string; title: string; contract?: string; eventTicker?: string };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; action?: StructuredAction; marketOptions?: MarketOption[] };
type Conversation = { id: string; kind: "general" | "thesis"; thesisId: string | null; title: string; messages: Message[]; updatedAt: string };
type VoiceStatus = "ready" | "listening" | "transcribing" | "sending" | "speaking";

function safeAction(question: string, pathname: string): { action?: StructuredAction; reply: string; research?: boolean } {
  const q = question.trim();
  const normalized = q.toLowerCase();
  const pathThesisId = pathname.match(/^\/theses\/([a-z0-9_-]+)/i)?.[1];
  const rememberedId = typeof window === "undefined" ? null : localStorage.getItem("thesis:last-active");
  const thesisId = pathThesisId || (rememberedId && /^th_[a-z0-9]+$/i.test(rememberedId) ? rememberedId : null);
  const wantsCreate = /\b(create|start|new|draft|make)\b/.test(normalized) && /\b(thesis|thesi)\b/.test(normalized);
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
  const marketDiscoveryRequest = /\b(find|search|look\s+for|show me|want|about)\b/.test(normalized) &&
    /\b(basket|market|contract|football|basketball|game|team)\b/.test(normalized);
  if (thesisId && !wantsCreate && !marketDiscoveryRequest) {
    const resumeResearch =
      /\b(open|continue|resume|return to|back to)\s+research\b/.test(normalized) ||
      /\bresearch\s+again\b/.test(normalized) ||
      /\b(change|take|put|send|move)\b[\w\s-]{0,40}\bthesis\b[\w\s-]{0,40}\bresearch\b/.test(normalized);
    if (resumeResearch && !/\b(compare|build|history|review trade)\b/.test(normalized)) {
      return {
        action: { type: "navigate", href: `/theses/${thesisId}`, label: "Open thesis Research" },
        reply: "I can reopen Research for your most recent thesis. Confirm the destination below; nothing is saved or traded from this suggestion.",
      };
    }
    const tabs: [RegExp, string, string][] = [
      [/\b(compare this|compare my|open compare|show (?:me )?alternatives)\b/, "compare", "Open Compare"],
      [/\b(open|go to|resume|return to)\s+(?:my\s+|the\s+)?(?:build|basket|construction)\b/, "build", "Open Build"],
      [/\b(history|revisions|thesis history)\b/, "history", "Open thesis History"],
      [/\b(review trade|open review|trade review)\b/, "review", "Open trade Review"],
    ];
    for (const [pattern, segment, label] of tabs) {
      if (pattern.test(normalized)) return { action: { type: "navigate", href: `/theses/${thesisId}/${segment}`, label }, reply: `I can open ${label} for your most recent thesis. Review the destination below; your position or saved view will not change.` };
    }
  }
  return {
    research: true,
    reply: "I can search live Gemini markets, explain a selected contract, or open a destination you confirm. Research never approves a financial action.",
  };
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
  const [talking, setTalking] = useState(false);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [localThread, setLocalThread] = useState<Conversation | null>(null);
  const [showResearchText, setShowResearchText] = useState(false);
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
  const sending = useRef(false);

  const builtInAssistant = /^\/topics\/[^/]+$/.test(pathname) || /^\/theses\/[^/]+(?:\/(?:build|compare|review))?$/.test(pathname);
  const researchOnly = Boolean(draftScope && pathname === `/theses/${draftScope}`);
  const notebook = useResearchNotebook(researchOnly ? `thesis:${draftScope}` : "general");
  const current = researchOnly ? (localThread?.thesisId === draftScope ? localThread : null) : threads.find((thread) => thread.id === threadId) || null;

  useEffect(() => {
    if (builtInAssistant) setOpen(false);
  }, [pathname, builtInAssistant]);

  useEffect(() => {
    let active = true;
    api<{ conversations: Conversation[] }>("/api/conversations").then((result) => {
      if (!active) return;
      const next = result.conversations || [];
      setThreads(next);
      if (!selectionMade.current) setThreadId(next.find((thread) => thread.kind === "general")?.id || "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Saved conversations could not be loaded."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    api<{ services: { id: string; state: string }[] }>("/api/status").then(({ services }) => {
      if (!active) return;
      setVoiceAvailable(services.some((service) => service.id === "voice" && service.state === "available"));
    }).catch(() => {
      if (!active) return;
      setVoiceAvailable(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const { question, thesisId } = (event as CustomEvent<{ question?: string; thesisId?: string }>).detail || {};
      setOpen(true);
      if (question) setDraft(question);
      if (thesisId) {
        setShowResearchText(false);
        selectionMade.current = true;
        setDraftScope(thesisId);
        setThreadId(threads.find((thread) => thread.thesisId === thesisId)?.id || "");
      }
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [threads]);
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

  async function send(spoken?: string, signal?: AbortSignal) {
    const question = (spoken ?? draft).trim().slice(0, 3_000);
    if (!question || sending.current || (!spoken && (talking || voiceStatus === "transcribing" || voiceStatus === "listening"))) return;
    sending.current = true;
    setError("");
    setNotice("");
    setVoiceStatus("sending");
    try {
      let activeThread = current;
      if (!activeThread && researchOnly) activeThread = { id: "local-research", kind: "thesis", thesisId: draftScope, title: "Research", messages: [], updatedAt: new Date().toISOString() };
      if (!activeThread) {
        const created = await api<{ conversation: Conversation }>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ action: "create", kind: draftScope ? "thesis" : "general", ...(draftScope ? { thesisId: draftScope } : {}) }),
          signal,
        });
        activeThread = created.conversation;
        setThreads((items) => [created.conversation, ...items]);
        setThreadId(activeThread.id);
        selectionMade.current = true;
      }
      const turns = researchConversation(activeThread.messages, question);
      const activePath = activeThread.kind === "thesis" && activeThread.thesisId ? `/theses/${activeThread.thesisId}` : pathname;
      const nav = safeAction(question, activePath);
      let answer = nav.reply;
      let action = nav.action;
      let marketOptions: MarketOption[] = [];
      const topicSlug = pathname.match(/^\/topics\/([a-z0-9-]+)$/i)?.[1];
      const thesisId = (activeThread.kind === "thesis" && activeThread.thesisId)
        || pathname.match(/^\/theses\/([a-z0-9_-]+)/i)?.[1]
        || undefined;
      if (nav.research || !action) {
        const result = await api<{
          answer?: string;
          clarificationPrompt?: string;
          marketMatches?: (MarketOption & { id?: string; version?: string; predicates?: number; contracts?: number })[];
        }>("/api/research", {
          method: "POST",
          signal,
          body: JSON.stringify({
            question,
            conversation: turns,
            ...(topicSlug ? { slug: topicSlug } : {}),
            ...(thesisId ? { thesisId } : {}),
            mode: dataContextFromStorage(),
            context: "research",
          }),
        });
        answer = [result.answer, result.clarificationPrompt].filter(Boolean).join("\n\n")
          || "I could not form a research reply. Try again with a team, event, or ticker name.";
        const matches = result.marketMatches || [];
        marketOptions = matches.slice(0, 5).map(({ slug, title, contract, eventTicker }) => ({
          slug, title: title.slice(0, 200), contract: contract?.slice(0, 200),
          eventTicker: eventTicker && /^[a-z0-9._:-]{1,180}$/i.test(eventTicker) ? eventTicker : undefined,
        }));
        const match = matches.length === 1 ? matches[0] : undefined;
        const wantsThesis = /\b(create|start|draft|make)\s+(?:(?:a|new|my|a new)\s+)?thes(?:is|i)\b/i.test(question);
        if (!spoken && !thesisId && wantsThesis && match?.slug && match.id) {
          try {
            const single = (match.predicates ?? 0) <= 1 && (match.contracts ?? 1) <= 1;
            const created = await api<{ thesis: { id: string } }>("/api/theses", {
              method: "POST",
              body: JSON.stringify({
                topicSlug: match.slug,
                familyId: match.id,
                familyVersion: match.version || "1",
                mode: dataContextFromStorage(),
                title: match.title.slice(0, 100),
                template: single ? "binary" : (match.predicates ?? 0) >= 2 ? "range" : "directional",
                direction: "yes",
                rationale: question.trim(),
                evidenceIds: [],
              }),
            });
            action = {
              type: "navigate",
              label: `Open Research draft · ${match.title}`.slice(0, 80),
              href: `/theses/${created.thesis.id}`,
            };
            answer = `${answer}\n\nI prepared a Research draft linked to “${match.title}”. Confirm the destination below to open it. No view is confirmed and no trade is placed.`;
          } catch { /* The matching market is still available below. */ }
        }
      }
      if (signal?.aborted) return;
      if (researchOnly) {
        const createdAt = new Date().toISOString();
        const next = activeThread.messages.length;
        setLocalThread({ ...activeThread, updatedAt: createdAt, messages: [
          ...activeThread.messages,
          { id: `question-${next}`, role: "user", content: question, createdAt },
          { id: `reply-${next}`, role: "assistant", content: answer.slice(0, 6_000), createdAt, action, marketOptions },
        ] });
        setDraft("");
        return answer;
      }
      const result = await api<{ conversation: Conversation }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ action: "save-turn", id: activeThread.id, user: question, assistant: answer.slice(0, 6_000), ...(action ? { structuredAction: action } : {}), ...(marketOptions.length ? { marketOptions } : {}) }),
        signal,
      });
      setThreads((items) => [result.conversation, ...items.filter((thread) => thread.id !== result.conversation.id)].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      setThreadId(result.conversation.id);
      setDraft("");
      setNotice(action ? "Review the suggested destination before opening it. No view or position changes from this suggestion." : "Reply saved. No financial action was taken.");
      return answer;
    } catch (cause) {
      if (!signal?.aborted) setError(errorText(cause));
    } finally { sending.current = false; setVoiceStatus("ready"); }
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

  if (builtInAssistant && !open) return null;
  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            if (draftScope) {
              setDraftScope(null);
              setThreadId(threads.find((thread) => thread.kind === "general")?.id || "");
              setDraft("");
            }
            setOpen(true);
          }}
          aria-expanded={false}
          aria-controls="contextual-assistant"
          className="th-assistant-launcher th-button assistant-launcher"
        >
          <Icon name="assistant" size={18} />
          Ask Thesis
        </button>
      ) : null}

      {open ? (
        <aside id="contextual-assistant" aria-label="Ask Thesis assistant" className="assistant-panel">
          <header className="assistant-panel__head">
            <div className="assistant-panel__title">
              <Icon name="assistant" size={20} />
              <div>
                <h2>Ask Thesis</h2>
                {!researchOnly ? <p>Research and navigation · no financial approvals</p> : null}
              </div>
            </div>
            <button type="button" aria-label="Close Ask Thesis" className="th-button th-button--ghost th-button--icon" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </header>

          {!researchOnly ? <div className="assistant-panel__toolbar">
            <label className="sr-only" htmlFor="assistant-thread">Conversation</label>
            <select
              id="assistant-thread"
              className="assistant-panel__select"
              value={threadId}
              disabled={talking || voiceStatus === "sending"}
              onChange={(event) => { selectionMade.current = true; setDraftScope(null); setThreadId(event.target.value); }}
            >
              {!threadId || !threads.length ? <option value="">{draftScope ? "New thesis conversation" : "New conversation"}</option> : null}
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.kind === "thesis" ? `Thesis · ${thread.title}` : thread.title}
                </option>
              ))}
            </select>
            <button type="button" className="th-button th-button--ghost th-button--icon" aria-label="New conversation" title="New" disabled={talking || voiceStatus === "sending"} onClick={() => { setDraftScope(null); void newThread(); }}>
              <Icon name="plus" size={16} />
            </button>
            {current && !talking && voiceStatus !== "sending" ? (
              <>
                <button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Rename conversation" title="Rename" onClick={() => beginManageThread("rename")}>
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" className="th-button th-button--ghost th-button--icon text-bad" aria-label="Delete conversation" title="Delete" onClick={() => beginManageThread("delete")}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            ) : null}
          </div> : null}

          <div className="assistant-panel__messages" aria-live="polite">
            {!researchOnly && !current?.messages.length ? (
              <div className="assistant-panel__empty">
                <p className="font-medium">What would you like to do?</p>
                <p className="th-muted">Ask about a market, resume a thesis, or jump to Portfolio. Destinations always need your confirmation.</p>
                <div className="assistant-panel__chips">
                  {([["Explore markets", "/explore?view=gemini"], ["My Theses", "/theses"], ["Portfolio", "/portfolio"]] as const).map(([label, href]) => (
                    <button key={href} type="button" className="assistant-panel__chip" onClick={() => router.push(href)}>{label}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {current?.messages.map((message, index) => (
              <article key={message.id} className={`th-chat-message ${message.role === "user" ? "th-chat-message--user" : ""}`}>
                <p className="assistant-panel__role">{message.role === "user" ? "You" : "Thesis"}</p>
                <p className="assistant-panel__copy">{message.content}</p>
                {message.action ? (
                  <button type="button" className="th-button th-button--primary mt-3" onClick={() => { setOpen(false); router.push(message.action!.href); }}>
                    <Icon name="arrow-right" size={16} />
                    {message.action.label}
                  </button>
                ) : null}
                {message.marketOptions?.length ? <ul className="mt-2 space-y-1">
                  {message.marketOptions.map(({ slug, title, contract, eventTicker }) => <li key={slug}>
                    <a className="th-button th-button--secondary !h-auto whitespace-normal text-left" href={current.thesisId
                      ? `/theses/${current.thesisId}?market=${encodeURIComponent(slug)}${eventTicker ? `&event=${encodeURIComponent(eventTicker)}` : ""}`
                      : `/topics/${slug}${eventTicker ? `?event=${encodeURIComponent(eventTicker)}` : ""}`} onClick={() => setOpen(false)}>
                      <Icon name="arrow-right" size={16} />
                      <span>{title}{contract ? <small className="block th-muted">{contract}</small> : null}</span>
                    </a>
                  </li>)}
                </ul> : null}
                {researchOnly && message.role === "assistant" && current.messages[index - 1]?.role === "user" ? (() => {
                  const question = current.messages[index - 1].content;
                  const saved = notebook.replies.some((reply) => reply.question === question && reply.answer === message.content);
                  return <button type="button" className="assistant-panel__speak" disabled={saved} onClick={() => {
                    try { notebook.saveReply({ question, answer: message.content }); setError(""); }
                    catch (cause) { setError(errorText(cause)); }
                  }}><Icon name="bookmark" size={14} />{saved ? "Reply saved" : "Save reply"}</button>;
                })() : null}
                {!researchOnly && message.role === "assistant" && voiceAvailable ? (
                  <button type="button" className="assistant-panel__speak" disabled={talking || voiceStatus === "sending" || voiceStatus === "listening" || voiceStatus === "transcribing"} onClick={() => voiceStatus === "speaking" ? stopSpeech() : void speak(message.content)}>
                    <Icon name={voiceStatus === "speaking" ? "stop" : "volume"} size={14} />
                    {voiceStatus === "speaking" ? "Stop" : "Speak"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <footer className="assistant-panel__composer">
            {error ? <p role="alert" className="th-alert th-alert--error text-sm">{error}</p> : null}
            {notice ? <p role="status" className="text-xs th-muted">{notice}</p> : null}
            {voiceStatus === "listening" ? <p className="text-xs th-muted">Listening… Mute pauses input; stop transcribes; cancel discards.</p> : null}
            {!researchOnly || !voiceAvailable || showResearchText ? <><label htmlFor="assistant-question" className="sr-only">Your question</label>
            <textarea
              id="assistant-question"
              className="assistant-panel__input"
              rows={2}
              maxLength={3000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask a question or describe a view…"
              disabled={talking || voiceStatus === "sending" || voiceStatus === "transcribing"}
            /></> : null}
            <div className="assistant-panel__actions">
              <div className="assistant-panel__voice">
                {voiceAvailable ? <ConversationalMic primary={researchOnly} disabled={voiceStatus !== "ready"} onActive={setTalking} onTurn={(text, signal) => {
                  setDraft(text);
                  return send(text, signal);
                }} /> : null}
                {researchOnly && voiceAvailable && !talking && !showResearchText ? <button type="button" className="th-button th-button--ghost" onClick={() => setShowResearchText(true)}>Type instead</button> : null}
                {!researchOnly && voiceAvailable && !talking && voiceStatus !== "listening" ? (
                  <button type="button" className="th-button th-button--ghost" onClick={() => void startRecording()} disabled={voiceStatus !== "ready"}>
                    Record & edit
                  </button>
                ) : null}
                {voiceStatus === "listening" ? (
                  <>
                    <button type="button" className="th-button th-button--ghost" onClick={() => { const track = stream.current?.getAudioTracks()[0]; if (track) { track.enabled = muted; setMuted(!muted); } }}>
                      <Icon name={muted ? "mic" : "mic-off"} size={16} />
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    <button type="button" className="th-button th-button--ghost" onClick={() => stopRecording(true)}>Cancel</button>
                    <button type="button" className="th-button th-button--secondary" onClick={() => stopRecording()}>Stop</button>
                  </>
                ) : null}
                {voiceStatus === "speaking" ? (
                  <button type="button" className="th-button th-button--ghost" onClick={stopSpeech}>
                    <Icon name="stop" size={16} /> Interrupt
                  </button>
                ) : null}
              </div>
              {!researchOnly || !voiceAvailable || showResearchText ? <button
                type="button"
                className="th-button th-button--primary"
                onClick={() => void send()}
                disabled={!draft.trim() || talking || voiceStatus === "sending" || voiceStatus === "transcribing" || voiceStatus === "listening"}
              >
                <Icon name="send" size={16} />
                {voiceStatus === "sending" ? "Thinking…" : voiceStatus === "transcribing" ? "Transcribing…" : "Send"}
              </button> : null}
            </div>
          </footer>
        </aside>
      ) : null}

      <AppDialog open={Boolean(manageAction)} titleId="assistant-manage-title" onClose={() => { if (!managePending) setManageAction(null); }} closeOnBackdrop={!managePending}>
        <p className="source-pill">Conversation</p>
        <h2 id="assistant-manage-title" className="mt-3 font-serif text-2xl font-bold">{manageAction === "rename" ? "Rename conversation" : "Delete conversation?"}</h2>
        {manageAction === "rename" ? (
          <label className="th-field mt-4">
            <span>Conversation name</span>
            <input className="th-input" autoFocus maxLength={100} value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} />
          </label>
        ) : (
          <p className="mt-3 text-sm th-muted">“{current?.title}” and its assistant messages will be removed. Thesis drafts, saved views, evidence, and positions are unchanged.</p>
        )}
        {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="th-button th-button--secondary" onClick={() => setManageAction(null)} disabled={managePending}>Cancel</button>
          <button
            type="button"
            className={`th-button ${manageAction === "delete" ? "th-button--danger" : "th-button--primary"}`}
            onClick={() => void submitManageThread()}
            disabled={managePending || manageAction === "rename" && !threadTitle.trim()}
          >
            {managePending ? "Saving…" : manageAction === "rename" ? "Save name" : "Delete conversation"}
          </button>
        </div>
      </AppDialog>
    </>
  );
}
