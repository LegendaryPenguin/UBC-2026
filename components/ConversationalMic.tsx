"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/thesis";

type Phase = "connecting" | "listening" | "transcribing" | "thinking" | "speaking";
type Session = {
  controller: AbortController;
  stream?: MediaStream;
  context?: AudioContext;
  analyser?: AnalyserNode;
  frame?: number;
  recorder?: MediaRecorder;
  player?: HTMLAudioElement;
  url?: string;
  skipReply?: () => void;
};

const labels: Record<Phase, string> = {
  connecting: "Opening microphone…",
  listening: "Listening… pause to send",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Thesis is speaking…",
};

function release(session: Session) {
  session.controller.abort();
  if (session.frame !== undefined) cancelAnimationFrame(session.frame);
  if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
  session.stream?.getTracks().forEach((track) => track.stop());
  if (session.context && session.context.state !== "closed") void session.context.close().catch(() => {});
  session.player?.pause();
  if (session.url) URL.revokeObjectURL(session.url);
}

function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied. Allow microphone access or continue with text.";
  if (name === "NotFoundError") return "No microphone was found. Connect one or continue with text.";
  if (name === "NotReadableError") return "The microphone is busy. Close the other app or continue with text.";
  return error instanceof Error ? error.message : "Voice disconnected. Try again or continue with text.";
}

async function voiceRequest(url: string, body: BodyInit, signal: AbortSignal, headers?: HeadersInit) {
  const response = await fetch(url, { method: "POST", body, signal, headers });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (result?.error?.code === "NO_SPEECH") return null;
    throw new Error(result?.error?.message || "Voice is temporarily unavailable. Continue with text or try again.");
  }
  return response;
}

export function ConversationalMic({ disabled, primary = false, onTurn, onActive }: {
  disabled?: boolean;
  primary?: boolean;
  onTurn: (transcript: string, signal: AbortSignal) => Promise<string | undefined>;
  onActive: (active: boolean) => void;
}) {
  const sessionRef = useRef<Session | null>(null);
  const callbacks = useRef({ onTurn, onActive });
  callbacks.current = { onTurn, onActive };
  const [phase, setPhase] = useState<Phase | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (sessionRef.current) release(sessionRef.current);
    sessionRef.current = null;
    callbacks.current.onActive(false);
  }, []);

  function end() {
    if (sessionRef.current) release(sessionRef.current);
    sessionRef.current = null;
    setMuted(false);
    setPhase(null);
    callbacks.current.onActive(false);
  }

  function fail(session: Session, cause: unknown) {
    if (session.controller.signal.aborted) return;
    end();
    setError(microphoneError(cause));
  }

  async function reply(session: Session, recording: Blob) {
    const signal = session.controller.signal;
    setPhase("transcribing");
    const form = new FormData();
    const extension = recording.type.includes("mp4") ? "mp4" : recording.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", recording, `thesis-turn.${extension}`);
    const transcript = await voiceRequest("/api/voice/transcribe", form, signal);
    if (!transcript) { listen(session); return; }
    const { text } = await transcript.json() as { text: string };
    if (signal.aborted) return;
    setPhase("thinking");
    const answer = await callbacks.current.onTurn(text, signal);
    if (signal.aborted) return;
    if (!answer) { end(); return; }

    const spoken = answer.replace(/\[(?:ev-[^\]]+|\d+)\]/gi, "").replace(/https?:\/\/\S+/gi, "").trim().slice(0, 3_000);
    const response = await voiceRequest("/api/voice", JSON.stringify({ text: spoken }), signal, { "content-type": "application/json" });
    if (!response) throw new Error("Spoken reply is unavailable. The written reply is available.");
    const voice = await response.blob();
    if (signal.aborted) return;
    const url = URL.createObjectURL(voice);
    const player = new Audio(url);
    session.url = url;
    session.player = player;
    setPhase("speaking");
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", finish);
        resolve();
      };
      session.skipReply = () => { player.pause(); finish(); };
      player.onended = finish;
      player.onerror = () => { signal.removeEventListener("abort", finish); reject(new Error("Reply audio could not play. The written reply is available.")); };
      signal.addEventListener("abort", finish, { once: true });
      void player.play().catch((cause) => { signal.removeEventListener("abort", finish); reject(cause); });
    });
    if (signal.aborted) return;
    URL.revokeObjectURL(url);
    session.url = undefined;
    session.player = undefined;
    session.skipReply = undefined;
    listen(session);
  }

  function listen(session: Session) {
    const { signal } = session.controller;
    if (signal.aborted || !session.stream || !session.analyser) return;
    const track = session.stream.getAudioTracks()[0];
    track.enabled = true;
    setMuted(false);
    setPhase("listening");
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((value) => MediaRecorder.isTypeSupported(value));
    const recorder = new MediaRecorder(session.stream, type ? { mimeType: type } : undefined);
    session.recorder = recorder;
    let chunks: Blob[] = [];
    let heardSpeech = false;
    let speechStarted = 0;
    let lastVoice = 0;
    let noiseFloor = 0.004;
    const buffer = new Float32Array(session.analyser.fftSize);
    recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
    recorder.onerror = () => fail(session, new Error("Microphone recording failed. Try again or continue with text."));
    recorder.onstop = () => {
      if (signal.aborted) return;
      session.recorder = undefined;
      if (!heardSpeech || !chunks.length) {
        try { listen(session); } catch (cause) { fail(session, cause); }
        return;
      }
      track.enabled = false;
      const recording = new Blob(chunks, { type: recorder.mimeType || chunks[0].type || "audio/webm" });
      chunks = [];
      void reply(session, recording).catch((cause) => fail(session, cause));
    };
    recorder.start();
    const started = performance.now();
    function measure(now: number) {
      if (signal.aborted || recorder.state === "inactive") return;
      if (track.enabled) {
        session.analyser!.getFloatTimeDomainData(buffer);
        const level = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / buffer.length);
        if (level > Math.max(0.012, noiseFloor * 3.2)) {
          if (now - lastVoice > 150) speechStarted = now;
          lastVoice = now;
          if (now - speechStarted >= 100) heardSpeech = true;
        } else if (!heardSpeech) {
          noiseFloor = noiseFloor * 0.98 + Math.min(level, 0.012) * 0.02;
        }
        if ((heardSpeech && now - lastVoice >= 1_250) || now - started >= 45_000) {
          recorder.stop();
          return;
        }
      }
      session.frame = requestAnimationFrame(measure);
    }
    session.frame = requestAnimationFrame(measure);
  }

  async function start() {
    if (disabled || sessionRef.current) return;
    const session: Session = { controller: new AbortController() };
    sessionRef.current = session;
    callbacks.current.onActive(true);
    setError("");
    setPhase("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
        throw new Error("This browser doesn’t support conversational voice. Continue with text.");
      }
      session.context = new AudioContext();
      await session.context.resume();
      if (session.controller.signal.aborted) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (session.controller.signal.aborted) { stream.getTracks().forEach((track) => track.stop()); return; }
      session.stream = stream;
      session.analyser = session.context.createAnalyser();
      session.analyser.fftSize = 1024;
      session.context.createMediaStreamSource(stream).connect(session.analyser);
      stream.getAudioTracks()[0]?.addEventListener("ended", () => fail(session, new Error("The microphone disconnected. Reconnect it or continue with text.")), { once: true });
      listen(session);
    } catch (cause) { fail(session, cause); }
  }

  function toggleMute() {
    const track = sessionRef.current?.stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = muted;
    setMuted(!muted);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {phase ? <>
          {phase === "listening" ? <button type="button" className="th-button th-button--ghost" onClick={toggleMute}><Icon name={muted ? "mic" : "mic-off"} size={16} />{muted ? "Unmute" : "Mute"}</button> : null}
          {phase === "speaking" ? <button type="button" className="th-button th-button--ghost" onClick={() => sessionRef.current?.skipReply?.()}><Icon name="stop" size={16} />Skip reply</button> : null}
          <button type="button" className="th-button th-button--secondary" onClick={end}>End voice</button>
        </> : <button type="button" className={`th-button th-button--${primary ? "primary" : "secondary"}`} onClick={() => void start()} disabled={disabled}>
          <Icon name="mic" size={16} />Talk
        </button>}
        {phase ? <p className="!m-0 text-xs th-muted" role="status">{muted ? "Microphone muted" : labels[phase]}</p> : null}
      </div>
      {primary && !phase && !error ? <p className="!m-0 text-xs th-muted">Speak naturally. Pause when you’re ready for a reply.</p> : null}
      {error ? <p className="!m-0 text-xs text-bad" role="alert">{error}</p> : null}
    </div>
  );
}
