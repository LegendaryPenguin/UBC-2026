export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message || res.statusText);
  return json;
}

export function modeFromStorage(): "live" | "replay" | "paper" {
  if (typeof window === "undefined") return "replay";
  return (localStorage.getItem("thesis_mode") as "live" | "replay" | "paper") || "replay";
}

export function setMode(mode: "live" | "replay" | "paper") {
  localStorage.setItem("thesis_mode", mode);
}

export const MODE_CHANGE_EVENT = "thesis:mode-change";

const MODE_CHANGE_CONFIRMATION = "Switching refreshes mode-dependent market data. Any open quote review and unsaved order-form inputs are cleared. Existing orders and positions stay in their original environment. Continue?";

export function announceModeChange(mode: "live" | "replay" | "paper") {
  window.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { detail: { mode } }));
}

export function requestModeChange(next: "live" | "replay" | "paper") {
  const current = modeFromStorage();
  if (current !== next && !window.confirm(MODE_CHANGE_CONFIRMATION)) return false;
  if (current !== next) {
    setMode(next);
    announceModeChange(next);
  }
  return true;
}
