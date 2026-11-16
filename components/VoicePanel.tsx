"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import { useModeChange } from "@/lib/use-mode-change";
import { Button, Card, Field, inputCls } from "@/components/ui";
import type { EvidenceItem, MarketFamily, ThesisRevision, ViewTemplate } from "@/lib/domain/types";

type VoiceStatus = "ready" | "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "ended" | "error";
type VoiceAvailability = "checking" | "available" | "unavailable";
type InputMode = "voice" | "text";
type ResearchContext = "research" | "view" | "payoff" | "compare";
type ViewProposal = {
  template: ViewTemplate;
  direction: "yes" | "no" | null;
  lowerThreshold: number | null;
  upperThreshold: number | null;
  rationale: string;
  invalidation: string;
};
type ResearchTurn = { role: "user" | "assistant"; content: string };

const STATUS_LABEL: Record<VoiceStatus, string> = {
  ready: "Ready",
  connecting: "Requesting microphone",
  listening: "Listening",
  transcribing: "Transcribing with ElevenLabs",
  thinking: "Reviewing the question",
  speaking: "Speaking",
  ended: "Ready for another question",
  error: "Needs attention",
};

function recordingExtension(type: string): string {
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function permissionMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied. Allow microphone access or switch to text.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found. Connect one or switch to text.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The microphone is busy in another app. Close that app or switch to text.";
  return "Microphone access failed. Check browser permissions or switch to text.";
}

export function VoicePanel({
  slug,
  family,
  evidence,
  thesis,
  onThesisChange,
  context = "research",
  maxPayout,
  title,
}: {
  slug: string;
  family: MarketFamily;
  evidence: EvidenceItem[];
  thesis?: ThesisRevision;
  onThesisChange?: (thesis: ThesisRevision) => void;
  context?: ResearchContext;
  maxPayout?: string;
  title?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversation, setConversation] = useState<ResearchTurn[]>([]);
  const [clarificationPrompt, setClarificationPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailability>("checking");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [citations, setCitations] = useState<{ id: string; title: string }[]>([]);
  const [proposal, setProposal] = useState<ViewProposal | null>(null);
  const [proposalSaved, setProposalSaved] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const lastRecordingRef = useRef<Blob | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const transcribeControllerRef = useRef<AbortController | null>(null);
  const researchControllerRef = useRef<AbortController | null>(null);
  const speechControllerRef = useRef<AbortController | null>(null);
  const connectionRequestRef = useRef(0);
  const mountedRef = useRef(true);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (mountedRef.current) setMuted(false);
  }

  function releasePlayback() {
    if (speechControllerRef.current) speechControllerRef.current.abort();
    speechControllerRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  function clearTimer() {
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function cancelConnecting() {
    connectionRequestRef.current += 1;
    stopTracks();
    setStatus("ended");
    setNotice("Microphone request canceled. You can try again or use text.");
  }

  function cancelRecording() {
    discardRecordingRef.current = true;
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else stopTracks();
    chunksRef.current = [];
    setStatus("ended");
    setNotice("Recording canceled and discarded. It was not sent to ElevenLabs.");
  }

  function stopPlayback() {
    releasePlayback();
    if (mountedRef.current) setStatus("ended");
    setNotice("Speech stopped. The written reply remains available.");
  }

  function cancelInFlight(kind: "transcription" | "research") {
    if (kind === "transcription") transcribeControllerRef.current?.abort();
    else researchControllerRef.current?.abort();
    setStatus(kind === "transcription" ? "error" : "ended");
    if (kind === "transcription") setError("Transcription canceled. Retry the in-memory recording or switch to text.");
    setNotice(kind === "transcription"
      ? "Transcription canceled. Retry it or switch to text."
      : "Research request canceled. Your text remains available; no thesis change was made.");
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      connectionRequestRef.current += 1;
      clearTimer();
      transcribeControllerRef.current?.abort();
      researchControllerRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopTracks();
      releasePlayback();
    };
  }, []);

  useModeChange(() => {
    researchControllerRef.current?.abort();
    if (status === "speaking") releasePlayback();
    setAnswer("");
    setCitations([]);
    setProposal(null);
    setProposalSaved(false);
    setNotice("Market data mode changed. Ask again to refresh the research reply and suggested view.");
    setStatus((current) => current === "listening" || current === "connecting" ? current : "ended");
  });

  useEffect(() => {
    let active = true;
    api<{ services: { id: string; state: string; note: string }[] }>("/api/status")
      .then(({ services }) => {
        if (!active) return;
        const voice = services.find((service) => service.id === "voice");
        setVoiceAvailability(voice?.state === "available" ? "available" : "unavailable");
        setVoiceMessage(voice?.state === "available" ? "" : voice?.note || "Voice service is unavailable here. Text research remains available.");
      })
      .catch(() => {
        if (!active) return;
        setVoiceAvailability("unavailable");
        setVoiceMessage("Voice status could not be loaded. You can still type your question.");
      });
    return () => { active = false; };
  }, []);

  async function transcribe(blob: Blob) {
    if (!mountedRef.current) return;
    if (!blob.size) {
      setError("The recording was empty. Record again or type your question.");
      setStatus("error");
      return;
    }
    lastRecordingRef.current = blob;
    const audioForm = new FormData();
    audioForm.append("audio", blob, `thesis-voice.${recordingExtension(blob.type)}`);
    const controller = new AbortController();
    transcribeControllerRef.current = controller;
    setStatus("transcribing");
    setError("");
    setNotice("Audio is being sent for transcription. It is held only in memory for retry if this request fails.");
    try {
      const response = await fetch("/api/voice/transcribe", { method: "POST", body: audioForm, signal: controller.signal });
      const result = (await response.json()) as { text?: string; languageCode?: string | null; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Transcription failed.");
      if (!mountedRef.current) return;
      const spokenText = result.text?.trim();
      if (!spokenText) throw new Error("No speech was recognized. Record again or type your question.");
      setTranscript((current) => current.trim() ? `${current.trim()}\n${spokenText}` : spokenText);
      setLanguageCode(result.languageCode || "");
      setAnswer("");
      setProposal(null);
      setProposalSaved(false);
      lastRecordingRef.current = null;
      setNotice("Transcript is editable. Review it, then ask the same research question used by text mode.");
      setStatus("ended");
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Transcription failed. Type your question instead.");
      setStatus("error");
    } finally {
      if (transcribeControllerRef.current === controller) transcribeControllerRef.current = null;
    }
  }

  async function startRecording() {
    if (status === "speaking") releasePlayback();
    if (status === "thinking") researchControllerRef.current?.abort();
    if (status === "transcribing") transcribeControllerRef.current?.abort();
    setInputMode("voice");
    setError("");
    setNotice("");
    setLanguageCode("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Switch to text to continue.");
      setStatus("error");
      return;
    }

    const request = ++connectionRequestRef.current;
    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || request !== connectionRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRecordingRef.current = false;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current) return;
        setError("Recording stopped unexpectedly. Try again or switch to text.");
        setStatus("error");
        discardRecordingRef.current = true;
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => {
        const recording = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stopTracks();
        clearTimer();
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          return;
        }
        void transcribe(recording);
      };
      recorder.start();
      setStatus("listening");
      setNotice("Recording is in progress. Stop to transcribe, mute, or cancel to discard it.");
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 60_000);
    } catch (err) {
      stopTracks();
      if (!mountedRef.current || request !== connectionRequestRef.current) return;
      setError(permissionMessage(err));
      setStatus("error");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    setNotice(next ? "Microphone muted. Recording is paused until you unmute." : "Microphone unmuted. Recording continues.");
  }

  function switchToText() {
    if (status === "connecting") cancelConnecting();
    if (status === "listening") cancelRecording();
    if (status === "transcribing") transcribeControllerRef.current?.abort();
    if (status === "thinking") researchControllerRef.current?.abort();
    if (status === "speaking") releasePlayback();
    setInputMode("text");
    setStatus("ended");
    setError("");
    setNotice("Text mode selected. Your transcript is preserved and uses the same research action.");
  }

  function switchToVoice() {
    setInputMode("voice");
    setError("");
    setNotice(voiceAvailability === "available" ? "Voice mode selected. Recording starts only after you press Record." : voiceMessage);
  }

  async function ask() {
    if (!transcript.trim()) {
      setError("Type or record a question first.");
      return;
    }
    releasePlayback();
    researchControllerRef.current?.abort();
    const controller = new AbortController();
    researchControllerRef.current = controller;
    setStatus("thinking");
    setError("");
    setNotice("No thesis or financial state changes until you apply an editable view preview.");
    const nextConversation = [...conversation, { role: "user" as const, content: transcript.trim() }];
    try {
      const result = await api<{
        answer: string;
        citations?: { id: string; title: string }[];
        proposed?: Partial<ThesisRevision>;
        clarificationPrompt?: string;
      }>("/api/research", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          question: transcript.trim(),
          conversation: nextConversation,
          slug,
          thesisId: thesis?.id,
          mode: modeFromStorage(),
          context,
          maxPayout,
        }),
      });
      if (!mountedRef.current) return;
      setAnswer(result.answer);
      setCitations(result.citations || []);
      if (result.clarificationPrompt) {
        setConversation([...nextConversation, { role: "assistant", content: result.clarificationPrompt }]);
        setClarificationPrompt(result.clarificationPrompt);
        setTranscript("");
      } else {
        setConversation([]);
        setClarificationPrompt("");
      }
      setProposal(result.proposed ? {
        template: result.proposed.template || thesis?.template || (family.predicates.length === 1 && family.contracts.length === 1 ? "binary" : family.predicates.length >= 2 ? "range" : "directional"),
        direction: result.proposed.direction ?? thesis?.direction ?? "yes",
        lowerThreshold: result.proposed.template === "binary" ? null : result.proposed.lowerThreshold ?? thesis?.lowerThreshold ?? family.predicates[0]?.threshold ?? null,
        upperThreshold: result.proposed.template === "binary" ? null : result.proposed.upperThreshold ?? thesis?.upperThreshold ?? family.predicates[1]?.threshold ?? null,
        rationale: result.proposed.rationale ?? thesis?.rationale ?? transcript.trim(),
        invalidation: result.proposed.invalidation ?? thesis?.invalidation ?? "",
      } : null);
      setProposalSaved(false);
      setStatus("ended");
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Research failed. Your text remains available to retry.");
      setStatus("error");
    } finally {
      if (researchControllerRef.current === controller) researchControllerRef.current = null;
    }
  }

  function editProposal(change: Partial<ViewProposal>) {
    setProposal((current) => current ? { ...current, ...change } : current);
    setProposalSaved(false);
  }

  function validProposal() {
    if (!proposal) return false;
    if (proposal.template === "binary") return family.predicates.length === 1 && family.contracts.length === 1 && Boolean(proposal.direction);
    if (proposal.template === "directional") return proposal.lowerThreshold != null && Boolean(proposal.direction);
    return proposal.lowerThreshold != null && proposal.upperThreshold != null && proposal.lowerThreshold < proposal.upperThreshold;
  }

  async function applyProposal() {
    if (!proposal || !validProposal()) {
      setError(proposal?.template === "binary" ? "Choose YES or NO for the selected Gemini contract." : "Choose listed thresholds with a lower value below the upper value before saving.");
      return;
    }
    setSavingProposal(true);
    setError("");
    setNotice("");
    try {
      if (thesis) {
        const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${thesis.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            mode: modeFromStorage(),
            template: proposal.template,
            direction: proposal.template === "directional" || proposal.template === "binary" ? proposal.direction : null,
            lowerThreshold: proposal.template === "binary" ? null : proposal.lowerThreshold,
            upperThreshold: proposal.template === "directional" || proposal.template === "binary" ? null : proposal.upperThreshold,
            rationale: proposal.rationale,
            invalidation: proposal.invalidation,
            evidenceIds: thesis.evidenceIds,
          }),
        });
        onThesisChange?.(result.thesis);
        setProposalSaved(true);
        setNotice("Suggested edit saved as a draft revision. Review the updated view before confirming it.");
      } else {
        const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
          method: "POST",
          body: JSON.stringify({
            mode: modeFromStorage(),
            topicSlug: family.slug,
            familyId: family.id,
            familyVersion: family.version,
            template: proposal.template,
            direction: proposal.template === "directional" || proposal.template === "binary" ? proposal.direction : null,
            lowerThreshold: proposal.template === "binary" ? null : proposal.lowerThreshold,
            upperThreshold: proposal.template === "directional" || proposal.template === "binary" ? null : proposal.upperThreshold,
            rationale: proposal.rationale || transcript.trim(),
            invalidation: proposal.invalidation,
            evidenceIds: evidence.map((item) => item.id),
          }),
        });
        router.push(`/theses/${result.thesis.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The suggested view was not saved. Review it and retry.");
    } finally {
      setSavingProposal(false);
    }
  }

  async function speak() {
    if (!answer) return;
    releasePlayback();
    const spokenAnswer = [answer, clarificationPrompt].filter(Boolean).join(" ")
      .replace(/\[(ev-[a-z0-9-]+)\]/gi, " ")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const spokenSources = citations.length
      ? ` Sources: ${citations.map((citation) => citation.title).join("; ")}.`
      : "";
    const speechText = `${spokenAnswer}${spokenSources}`.slice(0, 3_000);
    const controller = new AbortController();
    speechControllerRef.current = controller;
    setStatus("speaking");
    setError("");
    setNotice("Speech can be interrupted at any time. The written reply stays available.");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: speechText }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Spoken reply unavailable.");
      }
      const url = URL.createObjectURL(await response.blob());
      if (!mountedRef.current || controller.signal.aborted) {
        URL.revokeObjectURL(url);
        return;
      }
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        releasePlayback();
        if (mountedRef.current) setStatus("ended");
      };
      audio.onerror = () => {
        releasePlayback();
        if (mountedRef.current) {
          setError("Reply audio could not be played. The written reply is still available.");
          setStatus("error");
        }
      };
      await audio.play();
    } catch (err) {
      if (controller.signal.aborted) return;
      releasePlayback();
      setError(err instanceof Error ? err.message : "Spoken reply unavailable. The written reply remains available.");
      setStatus("error");
    }
  }

  function retryTranscription() {
    if (lastRecordingRef.current) void transcribe(lastRecordingRef.current);
  }

  function clearQuestion() {
    if (status === "listening") cancelRecording();
    if (status === "transcribing") transcribeControllerRef.current?.abort();
    if (status === "thinking") researchControllerRef.current?.abort();
    if (status === "speaking") releasePlayback();
    setTranscript("");
    setConversation([]);
    setClarificationPrompt("");
    lastRecordingRef.current = null;
    setAnswer("");
    setCitations([]);
    setProposal(null);
    setProposalSaved(false);
    setLanguageCode("");
    setError("");
    setStatus("ended");
    setNotice("Question cleared. No saved thesis or financial state changed.");
  }

  const isBusy = status === "connecting" || status === "listening" || status === "transcribing" || status === "thinking";
  const canEdit = status !== "connecting" && status !== "listening" && status !== "transcribing";
  const thresholds = family.predicates.map((predicate) => predicate.threshold);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">{title || (context === "view" ? "Clarify your view" : context === "compare" ? "Explain this comparison" : context === "payoff" ? "Talk through the payoff" : "Talk through your research")}</h2>
        <span className="text-xs text-muted" role="status" aria-live="polite">{STATUS_LABEL[status]}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Voice and text use the same research request. Audio is sent only after you stop recording; this app does not save recordings. Provider logging follows your ElevenLabs account settings. Research can suggest a view but never confirms it, accepts a quote, or moves funds.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {inputMode === "voice" ? (
          status === "listening" ? <>
            <Button onClick={stopRecording}>Stop and transcribe</Button>
            <Button onClick={toggleMute} kind="secondary">{muted ? "Unmute microphone" : "Mute microphone"}</Button>
            <Button onClick={cancelRecording} kind="ghost">Cancel and discard</Button>
          </> : status === "connecting" ? <Button onClick={cancelConnecting} kind="secondary">Cancel microphone request</Button> : (
            <Button onClick={() => void startRecording()} disabled={voiceAvailability !== "available" || status === "transcribing" || status === "thinking"}>
              {status === "speaking" ? "Interrupt reply and record" : voiceAvailability === "checking" ? "Checking voice…" : voiceAvailability === "unavailable" ? "Voice unavailable" : "Record a question"}
            </Button>
          )
        ) : null}
        {inputMode === "voice" ? (
          <Button onClick={switchToText} kind="ghost">Switch to text</Button>
        ) : (
          <Button onClick={switchToVoice} kind="ghost" disabled={voiceAvailability !== "available"}>{voiceAvailability === "available" ? "Switch to voice" : "Voice unavailable"}</Button>
        )}
        {status === "transcribing" ? <Button onClick={() => cancelInFlight("transcription")} kind="secondary">Cancel transcription</Button> : null}
        {status === "thinking" ? <Button onClick={() => cancelInFlight("research")} kind="secondary">Cancel research</Button> : null}
        <Button onClick={() => void ask()} kind="secondary" disabled={isBusy || !transcript.trim()}>
        {status === "thinking" ? "Reviewing…" : clarificationPrompt ? "Send clarification" : context === "view" ? "Ask about this view" : context === "compare" ? "Explain scenarios" : context === "payoff" ? "Explain this basket" : "Ask question"}
        </Button>
        {status === "speaking" ? <Button onClick={stopPlayback} kind="secondary">Stop speaking</Button> : (
          <Button onClick={() => void speak()} kind="ghost" disabled={!answer || voiceAvailability !== "available" || isBusy}>Play spoken reply</Button>
        )}
        {status !== "transcribing" && lastRecordingRef.current ? <Button onClick={retryTranscription} kind="ghost">Retry transcription</Button> : null}
        <Button onClick={clearQuestion} kind="ghost" disabled={isBusy && status !== "listening"}>Clear</Button>
      </div>
      {voiceMessage && inputMode === "voice" ? <p className="mt-2 text-xs text-muted">{voiceMessage}</p> : null}
      {inputMode === "voice" && status === "listening" ? <p className="mt-2 text-xs text-muted">Recording stops automatically after 60 seconds. Mute pauses microphone input without ending the recording.</p> : null}
      {clarificationPrompt ? <div className="mt-3 rounded-lg border border-action/30 bg-[#F4F6FF] p-3" role="note">
        <p className="text-sm font-medium">Clarification needed</p>
        <p className="mt-1 text-sm">{clarificationPrompt}</p>
        <p className="mt-2 text-xs text-muted">Your earlier wording is retained for this follow-up. Answer by voice or text, or use Clear to start over.</p>
      </div> : null}
      <Field label={clarificationPrompt ? (inputMode === "voice" ? "Spoken clarification or answer" : "Your clarification") : inputMode === "voice" ? "Editable transcript or question" : "Your question"}>
        <textarea
          id={`voice-question-${slug}`}
          className={`${inputCls()} mt-1 min-h-24 py-3`}
          value={transcript}
          onChange={(event) => {
            setTranscript(event.target.value);
            setAnswer("");
            setCitations([]);
            setProposal(null);
            setProposalSaved(false);
            setNotice("Question edited. Ask again to refresh the research reply.");
          }}
          placeholder={clarificationPrompt ? "Answer the clarification…" : context === "compare" ? "Explain how the custom payout differs by scenario from the ticket basket…" : context === "payoff" ? "Ask how each scenario pays, where this basket differs from your view, or what happens if you are wrong…" : "Ask about evidence, rules, or the view you want to express…"}
          maxLength={3_000}
          disabled={!canEdit}
        />
      </Field>
      <p className="mt-1 text-right text-xs text-muted">{transcript.length} / 3,000</p>
      {languageCode ? <p className="mt-2 text-xs text-muted">Detected language: {languageCode}</p> : null}
      {notice ? <p className="mt-2 text-xs text-muted" role="status">{notice}</p> : null}
      {answer ? (
        <div className="mt-3 rounded-lg bg-surface p-3" aria-live="polite">
          <h3 className="text-sm font-medium">Research reply</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{answer}</p>
          {citations.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {citations.map((citation) => (
                <a key={citation.id} className="rounded-full border border-line px-3 py-1 text-xs text-action" href={`/topics/${slug}/evidence/${citation.id}`}>
                  Source: {citation.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {proposal ? (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <h3 className="text-sm font-medium">Suggested view preview</h3>
          {thesis ? (
            <p className="text-xs text-muted">Current revision {thesis.revision}: {thesis.template}, {thesis.lowerThreshold ?? "no lower threshold"}–{thesis.upperThreshold ?? "no upper threshold"}. Saving this preview creates a new draft revision and invalidates any available quote.</p>
          ) : <p className="text-xs text-muted">Review and edit every field. Confirming the button creates a draft only; it does not confirm a position or request a quote.</p>}
          <Field label="Payoff template">
            <select className={inputCls()} value={proposal.template} onChange={(event) => editProposal({ template: event.target.value as ViewTemplate })}>
              {family.predicates.length === 1 && family.contracts.length === 1 ? <option value="binary">Single contract</option> : <option value="directional">Directional</option>}
              {family.predicates.length >= 2 ? <><option value="range">Range</option><option value="outside">Outside range</option></> : null}
            </select>
          </Field>
          {proposal.template === "directional" || proposal.template === "binary" ? (
            <Field label="Direction">
              <select className={inputCls()} value={proposal.direction || "yes"} onChange={(event) => editProposal({ direction: event.target.value as "yes" | "no" })}>
                {proposal.template === "binary" ? <><option value="yes">YES · contract proposition resolves YES</option><option value="no">NO · contract proposition resolves NO</option></> : <><option value="yes">YES · pays at or above the threshold</option><option value="no">NO · pays below the threshold</option></>}
              </select>
            </Field>
          ) : null}
          {proposal.template !== "binary" ? <Field label={proposal.template === "directional" ? "Threshold" : "Lower threshold"}>
            <select className={inputCls()} value={proposal.lowerThreshold ?? ""} onChange={(event) => editProposal({ lowerThreshold: event.target.value === "" ? null : Number(event.target.value) })}>
              <option value="">Choose a listed threshold</option>
              {thresholds.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </Field> : null}
          {proposal.template === "range" || proposal.template === "outside" ? (
            <Field label="Upper threshold">
              <select className={inputCls()} value={proposal.upperThreshold ?? ""} onChange={(event) => editProposal({ upperThreshold: event.target.value === "" ? null : Number(event.target.value) })}>
                <option value="">Choose a listed threshold above the lower bound</option>
                {thresholds.filter((value) => proposal.lowerThreshold == null || value > proposal.lowerThreshold).map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Rationale">
            <textarea className={`${inputCls()} min-h-20 py-2`} maxLength={4_000} value={proposal.rationale} onChange={(event) => editProposal({ rationale: event.target.value })} />
          </Field>
          <Field label="I would reconsider if">
            <textarea className={`${inputCls()} min-h-16 py-2`} maxLength={2_000} value={proposal.invalidation} onChange={(event) => editProposal({ invalidation: event.target.value })} />
          </Field>
          {(proposal.template === "range" || proposal.template === "outside") && proposal.lowerThreshold != null && proposal.upperThreshold != null && proposal.lowerThreshold >= proposal.upperThreshold ? (
            <p className="text-sm text-bad">Choose an upper threshold above the lower threshold.</p>
          ) : null}
          {proposalSaved ? <p className="text-sm text-muted">Saved as a draft revision. Review the view before confirming it.</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void applyProposal()} disabled={savingProposal || !validProposal()}>
              {savingProposal ? "Saving preview…" : thesis ? "Save edit as draft" : "Create draft from preview"}
            </Button>
            {proposalSaved && thesis ? <Button href={`/theses/${thesis.id}`} kind="secondary">Review updated view</Button> : null}
            <Button onClick={() => { setProposal(null); setProposalSaved(false); }} kind="ghost" disabled={savingProposal}>Discard preview</Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-bad" role="alert">{error}</p> : null}
    </Card>
  );
}
