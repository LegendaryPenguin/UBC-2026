"use client";

import { useEffect, useState } from "react";
import type { ResearchRange } from "@/lib/research-range";

export type ResearchReply = { question: string; answer: string };
type SavedReply = ResearchReply & { id: string };
type Notebook = { sourceIds: string[]; replies: SavedReply[]; targetRange?: ResearchRange | null };

const empty: Notebook = { sourceIds: [], replies: [] };
const storageKey = (scope: string) => `thesis:research-saved:${scope}`;
const notebookUpdated = "thesis:research-notebook-updated";

function readNotebook(scope: string): Notebook {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(scope)) || "null") as Notebook | null;
    return {
      sourceIds: Array.isArray(value?.sourceIds) ? value.sourceIds.filter((id) => typeof id === "string") : [],
      replies: Array.isArray(value?.replies) ? value.replies.filter((reply) =>
        typeof reply?.id === "string" && typeof reply.question === "string" && typeof reply.answer === "string") : [],
      targetRange: value?.targetRange && Number.isFinite(value.targetRange.lower) && Number.isFinite(value.targetRange.upper) && typeof value.targetRange.unit === "string" ? value.targetRange : null,
    };
  } catch {
    return empty;
  }
}

function writeNotebook(scope: string, data: Notebook) {
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(data));
    window.dispatchEvent(new CustomEvent(notebookUpdated, { detail: scope }));
  } catch {
    throw new Error("This browser could not save the item. Check your storage settings and try again.");
  }
}

export function copyMarketReplies(slug: string, thesisId: string) {
  const { replies } = readNotebook(`market:${slug}`);
  if (!replies.length) return;
  try { writeNotebook(`thesis:${thesisId}`, { ...empty, replies }); }
  catch { /* The saved replies remain available on their original market board. */ }
}

export function useResearchNotebook(scope: string) {
  const [notebook, setNotebook] = useState<{ scope: string; data: Notebook }>({ scope, data: empty });
  useEffect(() => {
    const reload = () => setNotebook({ scope, data: readNotebook(scope) });
    reload();
    function onStorage(event: StorageEvent) {
      if (event.key === storageKey(scope) || event.key === null) reload();
    }
    function onNotebookUpdated(event: Event) {
      if ((event as CustomEvent<string>).detail === scope) reload();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(notebookUpdated, onNotebookUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(notebookUpdated, onNotebookUpdated);
    };
  }, [scope]);

  function update(change: (current: Notebook) => Notebook) {
    const data = change(readNotebook(scope));
    writeNotebook(scope, data);
    setNotebook({ scope, data });
  }

  return {
    ...(notebook.scope === scope ? notebook.data : empty),
    saveReply: (reply: ResearchReply) => update((current) => {
      if (current.replies.some(({ question, answer }) => question === reply.question && answer === reply.answer)) return current;
      return { ...current, replies: [{ id: window.crypto.randomUUID(), ...reply }, ...current.replies] };
    }),
    removeReply: (id: string) => update((current) => ({ ...current, replies: current.replies.filter((reply) => reply.id !== id) })),
    toggleSource: (id: string) => update((current) => ({ ...current, sourceIds: current.sourceIds.includes(id) ? current.sourceIds.filter((sourceId) => sourceId !== id) : [...current.sourceIds, id] })),
    setTargetRange: (range: ResearchRange | null) => update((current) => ({ ...current, targetRange: range })),
  };
}
