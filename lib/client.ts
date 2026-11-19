export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message || res.statusText);
  return json;
}

export type DataContext = "live" | "replay";
export type ExecutionEnvironment = "none" | "paper" | "gemini" | "arc";
export type LegacyMode = "live" | "replay" | "paper";

function legacyMode(): LegacyMode {
  const value = localStorage.getItem("thesis_mode");
  return value === "live" || value === "paper" ? value : "replay";
}

export function dataContextFromStorage(): DataContext {
  if (typeof window === "undefined") return "replay";
  const value = localStorage.getItem("thesis_data_context");
  if (value === "live" || value === "replay") return value;
  return legacyMode() === "live" ? "live" : "replay";
}

export function executionEnvironmentFromStorage(): ExecutionEnvironment {
  if (typeof window === "undefined") return "none";
  const value = localStorage.getItem("thesis_execution_environment");
  if (value === "paper" || value === "gemini" || value === "arc" || value === "none") return value;
  return legacyMode() === "paper" ? "paper" : "none";
}

export function modeFromStorage(): LegacyMode {
  if (typeof window === "undefined") return "replay";
  const execution = executionEnvironmentFromStorage();
  return execution === "paper" ? "paper" : dataContextFromStorage();
}

export function setDataContext(context: DataContext) {
  localStorage.setItem("thesis_data_context", context);
  localStorage.setItem("thesis_mode", executionEnvironmentFromStorage() === "paper" ? "paper" : context);
}

export function setExecutionEnvironment(environment: ExecutionEnvironment) {
  localStorage.setItem("thesis_execution_environment", environment);
  localStorage.setItem("thesis_mode", environment === "paper" ? "paper" : dataContextFromStorage());
}

/** Backward-compatible setter for existing execution and tests. */
export function setMode(mode: LegacyMode) {
  if (mode === "paper") setExecutionEnvironment("paper");
  else {
    setExecutionEnvironment("none");
    setDataContext(mode);
  }
}

export const MODE_CHANGE_EVENT = "thesis:mode-change";
export const MODE_CHANGE_REQUEST_EVENT = "thesis:mode-change-request";
export const OPEN_ASSISTANT_EVENT = "thesis:open-assistant";

export function announceModeChange(
  mode: LegacyMode,
  detail?: { dataContext?: DataContext; executionEnvironment?: ExecutionEnvironment },
) {
  window.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, {
    detail: {
      mode,
      dataContext: detail?.dataContext ?? dataContextFromStorage(),
      executionEnvironment: detail?.executionEnvironment ?? executionEnvironmentFromStorage(),
    },
  }));
}

export function requestModeChange(next: LegacyMode) {
  const current = modeFromStorage();
  if (current === next) return true;
  window.dispatchEvent(new CustomEvent(MODE_CHANGE_REQUEST_EVENT, { detail: { mode: next } }));
  return false;
}

export function requestDataContextChange(next: DataContext) {
  if (dataContextFromStorage() === next) return true;
  window.dispatchEvent(new CustomEvent(MODE_CHANGE_REQUEST_EVENT, { detail: { axis: "data", value: next } }));
  return false;
}

export function requestExecutionEnvironmentChange(next: ExecutionEnvironment) {
  if (executionEnvironmentFromStorage() === next) return true;
  window.dispatchEvent(new CustomEvent(MODE_CHANGE_REQUEST_EVENT, { detail: { axis: "execution", value: next } }));
  return false;
}
