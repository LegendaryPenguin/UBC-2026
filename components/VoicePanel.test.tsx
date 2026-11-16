// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

import { VoicePanel } from "@/components/VoicePanel";

type FetchCall = { url: string; init?: RequestInit };
type FakeReply = { ok: boolean; json: () => Promise<unknown>; blob?: () => Promise<Blob> };

const family = {
  id: "btc-friday",
  slug: "btc-friday",
  version: "1",
  mode: "replay",
  title: "Bitcoin Friday",
  question: "Where will Bitcoin finish Friday?",
  observationTime: "2026-11-20T23:59:00.000Z",
  sourceEvent: {
    id: "event-btc",
    ticker: "BTCFRIDAY",
    title: "Bitcoin Friday",
    description: "Bitcoin closing price",
    sourceUrl: null,
    category: "Crypto",
    status: "active",
    expiryDate: "2026-11-20T23:59:00.000Z",
    effectiveDate: null,
    payloadHash: "0xhash",
    fetchedAt: "2026-11-15T00:00:00.000Z",
    sourceAgency: "Gemini",
    sourceIndex: "BTC-USD",
  },
  contracts: [
    { id: "btc-95", instrumentSymbol: "BTC95", eventId: "event-btc", ticker: "BTC95", label: "$95,000 or above", termsUrl: null, expiryDate: null, effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.2", ask: "0.3", lastTrade: null },
    { id: "btc-100", instrumentSymbol: "BTC100", eventId: "event-btc", ticker: "BTC100", label: "$100,000 or above", termsUrl: null, expiryDate: null, effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.1", ask: "0.2", lastTrade: null },
  ],
  predicates: [
    { id: "btc-95", contractId: "btc-95", instrumentSymbol: "BTC95", label: "$95,000 or above", kind: "gte", threshold: 95_000, unit: "USD" },
    { id: "btc-100", contractId: "btc-100", instrumentSymbol: "BTC100", label: "$100,000 or above", kind: "gte", threshold: 100_000, unit: "USD" },
  ],
  scenarios: [],
  closeTime: null,
  longstopTime: null,
  familyHash: "0xfamily",
  quotesAvailable: false,
  freshness: "replay",
  fetchedAt: "2026-11-15T00:00:00.000Z",
} satisfies MarketFamily;

const thesis: ThesisRevision = {
  id: "thesis-1",
  topicSlug: family.slug,
  familyId: family.id,
  familyVersion: family.version,
  template: "range",
  direction: null,
  lowerThreshold: 95_000,
  upperThreshold: 100_000,
  rationale: "Existing rationale",
  invalidation: "",
  evidenceIds: [],
  status: "draft",
  revision: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

let fetchCalls: FetchCall[];
let fetchHandler: (url: string, init?: RequestInit) => Promise<FakeReply>;
let getUserMedia: ReturnType<typeof vi.fn>;
let tracks: { enabled: boolean; stop: ReturnType<typeof vi.fn> }[];

function reply(body: unknown, ok = true, audio = false): FakeReply {
  return {
    ok,
    json: async () => body,
    blob: async () => new Blob(["mp3"], { type: "audio/mpeg" }),
  };
}

function researchReply(proposed?: unknown): FakeReply {
  return reply({
    answer: "A bounded range differs from a threshold ticket [ev-resistance].",
    citations: [{ id: "ev-resistance", title: "Friday resistance level" }],
    proposed,
  });
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = () => true;
  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream) { MockMediaRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded question"], { type: "audio/webm" }) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function installMediaPermission() {
  tracks = [{ enabled: true, stop: vi.fn() }];
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
}

function panel(props: Partial<React.ComponentProps<typeof VoicePanel>> = {}) {
  return render(
    <VoicePanel slug={family.slug} family={family} evidence={[] as EvidenceItem[]} thesis={thesis} {...props} />,
  );
}

function requests(path: string) {
  return fetchCalls.filter((call) => call.url === path);
}

beforeEach(() => {
  fetchCalls = [];
  MockMediaRecorder.instances = [];
  installMediaPermission();
  fetchHandler = async (url) => {
    if (url === "/api/status") return reply({ services: [{ id: "voice", state: "available", note: "" }] });
    if (url === "/api/voice/transcribe") return reply({ text: "I think Bitcoin finishes between $95,000 and $100,000.", languageCode: "eng" });
    if (url === "/api/research") return researchReply({ template: "range", lowerThreshold: 95_000, upperThreshold: 100_000, rationale: "A bounded Friday range.", invalidation: "" });
    if (url === "/api/theses/thesis-1") return reply({ thesis: { ...thesis, revision: 2, rationale: "A bounded Friday range." } });
    if (url === "/api/voice") return reply({}, true, true);
    return reply({ error: { message: "Unexpected request" } }, false);
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    return fetchHandler(url, init);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VoicePanel interaction flows", () => {
  it("recovers from denied microphone permission and sends typed input through research", async () => {
    getUserMedia.mockRejectedValue(new DOMException("permission denied", "NotAllowedError"));
    panel();

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    expect(await screen.findByText(/Microphone permission was denied/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to text" }));

    const question = screen.getByLabelText("Your question");
    fireEvent.change(question, { target: { value: "What does Friday settlement mean?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    await screen.findByText("A bounded range differs from a threshold ticket [ev-resistance].");

    expect(JSON.parse(String(requests("/api/research")[0].init?.body)).question).toBe("What does Friday settlement mean?");
  });

  it.each([
    ["NotFoundError", "No microphone was found"],
    ["NotReadableError", "microphone is busy in another app"],
  ])("explains %s microphone errors and leaves text available", async (errorName, expectedMessage) => {
    getUserMedia.mockRejectedValue(new DOMException("microphone error", errorName));
    panel();

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    expect(await screen.findByText(new RegExp(expectedMessage, "i"))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to text" }).hasAttribute("disabled")).toBe(false);
  });

  it("transcribes, lets the user edit, then saves a proposed view only as a draft", async () => {
    const onThesisChange = vi.fn();
    panel({ onThesisChange });

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    await screen.findByText("Listening");
    fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
    await waitFor(() => expect(requests("/api/voice/transcribe")).toHaveLength(1));

    const transcript = await screen.findByDisplayValue("I think Bitcoin finishes between $95,000 and $100,000.");
    fireEvent.change(transcript, { target: { value: "I expect a bounded move; compare the Friday scenarios." } });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    await screen.findByText("Suggested view preview");

    expect(JSON.parse(String(requests("/api/research")[0].init?.body)).question).toBe("I expect a bounded move; compare the Friday scenarios.");
    fireEvent.click(screen.getByRole("button", { name: "Save edit as draft" }));
    await waitFor(() => expect(requests("/api/theses/thesis-1")).toHaveLength(1));
    expect(onThesisChange).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
    expect(fetchCalls.some(({ url }) => url.includes("/api/quotes") || url.includes("/api/positions"))).toBe(false);
  });

  it("discards an active recording without uploading it", async () => {
    panel();

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    await screen.findByText("Listening");
    fireEvent.click(screen.getByRole("button", { name: "Cancel and discard" }));

    expect(await screen.findByText(/Recording canceled and discarded/)).toBeTruthy();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(requests("/api/voice/transcribe")).toHaveLength(0);
  });

  it("mutes and unmutes the microphone, then switches to text without uploading the capture", async () => {
    panel();

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    await screen.findByText("Listening");
    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(tracks[0].enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Unmute microphone" }));
    expect(tracks[0].enabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to text" }));

    expect(screen.getByLabelText("Your question")).toBeTruthy();
    expect(requests("/api/voice/transcribe")).toHaveLength(0);
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it("keeps a failed recording available for retry and preserves the transcript in text mode", async () => {
    let transcriptionAttempts = 0;
    fetchHandler = async (url) => {
      if (url === "/api/status") return reply({ services: [{ id: "voice", state: "available", note: "" }] });
      if (url === "/api/voice/transcribe") {
        transcriptionAttempts += 1;
        return transcriptionAttempts === 1
          ? reply({ error: { message: "ElevenLabs connection timed out." } }, false)
          : reply({ text: "Check the Friday closing rule.", languageCode: "eng" });
      }
      return reply({ answer: "The response is based on the listed Friday rule.", citations: [] });
    };
    panel();

    fireEvent.click(await screen.findByRole("button", { name: "Record a question" }));
    await screen.findByText("Listening");
    fireEvent.click(screen.getByRole("button", { name: "Stop and transcribe" }));
    expect(await screen.findByText("ElevenLabs connection timed out.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry transcription" }));
    expect(await screen.findByDisplayValue("Check the Friday closing rule.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to text" }));
    expect(screen.getByDisplayValue("Check the Friday closing rule.")).toBeTruthy();
    expect(transcriptionAttempts).toBe(2);
  });

  it("speaks source titles without citation IDs and allows interruption", async () => {
    class MockAudio {
      static current: MockAudio;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn().mockResolvedValue(undefined);
      constructor(_url: string) { MockAudio.current = this; }
    }
    vi.stubGlobal("Audio", MockAudio);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:reply") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    panel();

    const question = await screen.findByLabelText("Editable transcript or question");
    fireEvent.change(question, { target: { value: "Explain the comparison." } });
    fireEvent.click(screen.getByRole("button", { name: "Ask question" }));
    await screen.findByText("A bounded range differs from a threshold ticket [ev-resistance].");
    fireEvent.click(screen.getByRole("button", { name: "Play spoken reply" }));
    await screen.findByRole("button", { name: "Stop speaking" });

    const speechRequest = requests("/api/voice")[0];
    const speechText = JSON.parse(String(speechRequest.init?.body)).text as string;
    expect(speechText).not.toContain("ev-resistance");
    expect(speechText).toContain("Friday resistance level");
    fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }));
    expect(MockAudio.current.pause).toHaveBeenCalled();
  });
});
