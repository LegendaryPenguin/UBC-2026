"use client";

import { useSyncExternalStore } from "react";

const compact = "(max-width: 900px)";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(compact);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useCompactWorkspace() {
  return useSyncExternalStore(subscribe, () => typeof window.matchMedia === "function" && window.matchMedia(compact).matches, () => false);
}
