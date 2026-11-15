"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";

type VoiceStatus = "ready" | "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "ended" | "error";
type VoiceAvailability = "checking" | "available" | "unavailable";

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

export function VoicePanel({ slug, family, evidence }: { slug: string; family: MarketFamily; evidence: EvidenceItem[] }) {
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [error, setError] = useState("");
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailability>("checking");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [citations, setCitations] = useState<{ id: string; title: string }[]>([]);
  const [proposal, setProposal] = useState<Partial<ThesisRevision> | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderFailedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function releasePlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopTracks();
      releasePlayback();
    };
  }, []);

  useEffect(() => {
    let active = true;
    api<{ services: { id: string; state: string; note: string }[] }>("/api/status")
      .then(({ services }) => {
        if (!active) return;
        const voice = services.find((service) => service.id === "voice");
        setVoiceAvailability(voice?.state === "available" ? "available" : "unavailable");
        setVoiceMessage(voice?.state === "available" ? "" : voice?.note || "Voice service is unavailable here.");
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
      setError("The recording was empty. Try again or type your question.");
      setStatus("error");
      return;
    }

    const audioForm = new FormData();
    audioForm.append("audio", blob, `thesis-voice.${recordingExtension(blob.type)}`);
    setStatus("transcribing");
    setError("");
    try {
      const response = await fetch("/api/voice/transcribe", { method: "POST", body: audioForm });
      const result = (await response.json()) as { text?: string; languageCode?: string | null; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Transcription failed.");
      if (!mountedRef.current) return;
      const spokenText = result.text?.trim();
      if (!spokenText) throw new Error("No speech was recognized. Try again or type your question.");
      setTranscript((current) => current.trim() ? `${current.trim()}\n${spokenText}` : spokenText);
      setLanguageCode(result.languageCode || "");
      setAnswer("");
      setStatus("ended");
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Transcription failed. Type your question instead.");
      setStatus("error");
    }
  }

  async function startRecording() {
    setError("");
    setLanguageCode("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Type your question instead.");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorderFailedRef.current = false;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current) return;
        setError("The recording stopped unexpectedly. Type your question instead.");
        setStatus("error");
        recorderFailedRef.current = true;
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => {
        const recording = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stopTracks();
        if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        if (recorderFailedRef.current) {
          recorderFailedRef.current = false;
          return;
        }
        void transcribe(recording);
      };
      recorder.start();
      setStatus("listening");
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 60_000);
    } catch {
      stopTracks();
      setError("Microphone access was unavailable. Check browser permissions or type your question.");
      setStatus("error");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function ask() {
    if (!transcript.trim()) {
      setError("Type or record a question first.");
      return;
    }
    setStatus("thinking");
    setError("");
    try {
      const result = await api<{
        answer: string;
        citations?: { id: string; title: string }[];
        proposed?: Partial<ThesisRevision>;
      }>("/api/research", {
        method: "POST",
        body: JSON.stringify({ question: transcript.trim(), slug, mode: localStorage.getItem("thesis_mode") }),
      });
      setAnswer(result.answer);
      setCitations(result.citations || []);
      setProposal(result.proposed || null);
      setStatus("ended");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
      setStatus("error");
    }
  }

  async function createDraftFromProposal() {
    if (!proposal) return;
    setSavingProposal(true);
    setError("");
    try {
      const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: family.slug,
          familyId: family.id,
          familyVersion: family.version,
          template: proposal.template || "range",
          direction: proposal.direction ?? null,
          lowerThreshold: proposal.lowerThreshold ?? null,
          upperThreshold: proposal.upperThreshold ?? null,
          rationale: proposal.rationale || transcript.trim(),
          evidenceIds: evidence.map((item) => item.id),
        }),
      });
      window.location.href = `/theses/${result.thesis.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a thesis draft.");
      setSavingProposal(false);
    }
  }

  async function speak() {
    if (!answer) return;
    releasePlayback();
    setStatus("speaking");
    setError("");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: answer }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Spoken reply unavailable.");
      }
      const url = URL.createObjectURL(await response.blob());
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
          setError("The reply audio could not be played. The written reply is still available.");
          setStatus("error");
        }
      };
      await audio.play();
    } catch (err) {
      releasePlayback();
      setError(err instanceof Error ? err.message : "Spoken reply unavailable.");
      setStatus("error");
    }
  }

  function editTranscript(value: string) {
    setTranscript(value);
    setAnswer("");
    setCitations([]);
    setProposal(null);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Talk through your view</h2>
        <span className="text-xs text-muted" role="status" aria-live="polite">{STATUS_LABEL[status]}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Record a question or type it below. Audio is sent to ElevenLabs for transcription and discarded by this app afterward. Provider logging follows your ElevenLabs account settings.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "listening" ? (
          <Button onClick={stopRecording} kind="secondary">Stop recording</Button>
        ) : (
          <Button onClick={startRecording} disabled={voiceAvailability !== "available" || status === "connecting" || status === "transcribing" || status === "thinking" || status === "speaking"}>
            {status === "connecting" ? "Connecting…" : voiceAvailability === "checking" ? "Checking voice…" : voiceAvailability === "unavailable" ? "Voice unavailable" : "Record a question"}
          </Button>
        )}
        <Button onClick={ask} kind="secondary" disabled={status === "connecting" || status === "listening" || status === "transcribing" || status === "thinking"}>
          {status === "thinking" ? "Reviewing…" : "Ask about this topic"}
        </Button>
        <Button onClick={speak} kind="ghost" disabled={!answer || voiceAvailability !== "available" || status === "speaking" || status === "listening" || status === "transcribing"}>
          {status === "speaking" ? "Speaking…" : "Play spoken reply"}
        </Button>
      </div>
      {voiceMessage ? <p className="mt-2 text-xs text-muted">{voiceMessage}</p> : null}
      <label className="mt-3 block text-sm font-medium" htmlFor={`voice-question-${slug}`}>Your question or transcript</label>
      <textarea
        id={`voice-question-${slug}`}
        className="mt-1 min-h-24 w-full rounded-lg border border-line p-3"
        value={transcript}
        onChange={(event) => editTranscript(event.target.value)}
        placeholder="I expect bitcoin to finish between the listed thresholds…"
        maxLength={3_000}
        disabled={status === "connecting" || status === "listening" || status === "transcribing"}
      />
      <p className="mt-1 text-right text-xs text-muted">{transcript.length} / 3,000</p>
      {languageCode ? <p className="mt-2 text-xs text-muted">Detected language: {languageCode}</p> : null}
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
        <div className="mt-3 rounded-lg border border-line p-3">
          <h3 className="text-sm font-medium">Proposed view</h3>
          <p className="mt-1 text-sm text-muted">
            {proposal.template === "range" && proposal.lowerThreshold != null && proposal.upperThreshold != null
              ? `Range from ${proposal.lowerThreshold} to ${proposal.upperThreshold}. Review the contract labels before confirming.`
              : "Review the suggested view before continuing."}
          </p>
          <Button onClick={createDraftFromProposal} disabled={savingProposal}>
            {savingProposal ? "Creating draft…" : "Review as a thesis draft"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-bad" role="alert">{error}</p> : null}
    </Card>
  );
}
