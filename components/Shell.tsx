"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, announceModeChange, MODE_CHANGE_EVENT, MODE_CHANGE_REQUEST_EVENT, OPEN_ASSISTANT_EVENT, setMode } from "@/lib/client";
import { ContextualAssistant } from "@/components/ContextualAssistant";

type Mode = "replay" | "live" | "paper";
type Account = { name?: string | null; email?: string | null } | null;

const NAV = [
  ["Dashboard", "/"],
  ["Explore", "/explore"],
  ["My Theses", "/theses"],
  ["Portfolio", "/portfolio"],
] as const;

function isCurrent(label: string, href: string, path: string) {
  if (label === "Dashboard") return path === "/" || path === "/home";
  if (label === "Explore") return ["/explore", "/topics", "/gemini", "/search", "/calendar", "/watchlists"]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (label === "My Theses") return path === "/theses" || path === "/workspace" || path.startsWith("/theses/");
  return ["/portfolio", "/positions", "/quotes", "/orders", "/activity", "/alerts", "/notifications", "/transactions"]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function NavIcon({ label, size = 20 }: { label: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (label === "Dashboard") return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></svg>;
  if (label === "Explore") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1 5.1-2.5Z"/></svg>;
  if (label === "My Theses") return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
  return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 10h18M8 15h3"/></svg>;
}

function ProfileIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.7-3.5 3.4-5.5 7.5-5.5s6.8 2 7.5 5.5"/></svg>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [mode, setCurrentMode] = useState<Mode>("replay");
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [account, setAccount] = useState<Account>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    const next = localStorage.getItem("thesis_mode") as Mode | null;
    setCurrentMode(next === "live" || next === "paper" ? next : "replay");
  }, [path]);

  useEffect(() => {
    let active = true;
    api<{ account: Account }>("/api/auth").then(({ account: value }) => { if (active) setAccount(value); }).catch(() => { if (active) setAccount(null); });
    return () => { active = false; };
  }, [path]);

  useEffect(() => {
    const syncMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: Mode }>).detail?.mode;
      setCurrentMode(next === "live" || next === "paper" ? next : "replay");
    };
    const requestMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: Mode }>).detail?.mode;
      if (next === "live" || next === "replay" || next === "paper") setPendingMode(next);
    };
    window.addEventListener(MODE_CHANGE_EVENT, syncMode);
    window.addEventListener(MODE_CHANGE_REQUEST_EVENT, requestMode);
    return () => {
      window.removeEventListener(MODE_CHANGE_EVENT, syncMode);
      window.removeEventListener(MODE_CHANGE_REQUEST_EVENT, requestMode);
    };
  }, []);

  useEffect(() => {
    if (!pendingMode && !profileOpen && !modeOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPendingMode(null);
      setProfileOpen(false);
      setModeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingMode, profileOpen, modeOpen]);

  const confirmModeChange = useCallback(() => {
    if (!pendingMode) return;
    setMode(pendingMode);
    setCurrentMode(pendingMode);
    announceModeChange(pendingMode);
    setPendingMode(null);
    setModeOpen(false);
  }, [pendingMode]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signout" }) });
      setAccount(null);
      setProfileOpen(false);
      router.push("/");
      router.refresh();
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : "Could not sign out. Try again.");
    } finally { setSigningOut(false); }
  }

  const environmentLabel = mode === "live" ? "Live market data" : mode === "paper" ? "Paper simulation" : "Illustrative demo";
  const sourceLabel = mode === "live" ? "Live Gemini data" : "Recorded replay data";
  const executionLabel = mode === "paper" ? "Paper simulation" : "No execution selected";

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 bg-white px-3 py-2">Skip to content</a>
      <header className="thesis-header sticky top-0 z-30 border-b">
        <div className="thesis-header__inner mx-auto flex w-full max-w-[1600px] items-center gap-5 px-4 lg:px-7">
          <Link href="/" className="thesis-brand flex shrink-0 items-center gap-3 font-serif text-[27px] font-bold" aria-label="Thesis dashboard">
            <span aria-hidden="true" className="thesis-logo-mark" />
            Thesis
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} aria-current={isCurrent(label, href, path) ? "page" : undefined} className={`thesis-nav-link inline-flex items-center gap-2 ${isCurrent(label, href, path) ? "" : "hover:bg-white/80"}`}>
                <NavIcon label={label} size={18} />{label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <button type="button" className="thesis-env-pill" aria-expanded={modeOpen} aria-controls="environment-menu" onClick={() => { setModeOpen((value) => !value); setProfileOpen(false); }}>
                <span className={`h-2 w-2 rounded-full ${mode === "live" ? "bg-good" : mode === "paper" ? "bg-[#C57A36]" : "bg-[#718394]"}`} />
                {environmentLabel}<span aria-hidden="true" className="text-muted">ⓘ</span>
              </button>
              {modeOpen ? <div id="environment-menu" className="thesis-popover absolute right-0 top-11 z-40 w-[min(92vw,330px)] p-4" aria-label="Data and execution context">
                <div className="grid gap-3 text-sm">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Data context</p><p className="mt-1 font-medium">{sourceLabel}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Execution environment</p><p className="mt-1 font-medium">{executionLabel}</p><p className="mt-1 text-xs text-muted">Review always names the venue and environment before any approval.</p></div>
                  <div className="grid gap-2 border-t border-line pt-3">
                    {([ ["replay", "Replay data"], ["live", "Live data"], ["paper", "Paper simulation"] ] as [Mode, string][]).map(([value, label]) => <button key={value} type="button" className={`min-h-10 rounded-lg border px-3 text-left text-sm ${mode === value ? "border-action bg-[#E9EEFF] text-action" : "border-line hover:bg-[#F7F6F2]"}`} onClick={() => { setModeOpen(false); if (mode !== value) setPendingMode(value); }}>{label}{mode === value ? " · current" : ""}</button>)}
                  </div>
                </div>
              </div> : null}
            </div>
            <div className="relative">
              <button type="button" className="thesis-profile-button" aria-label="Profile" aria-expanded={profileOpen} aria-controls="profile-menu" onClick={() => { setProfileOpen((value) => !value); setModeOpen(false); }}><ProfileIcon /></button>
              {profileOpen ? <div id="profile-menu" className="thesis-popover absolute right-0 top-12 z-40 min-w-[220px] p-2" aria-label="Profile menu">
                <div className="border-b border-line px-3 py-2"><p className="text-sm font-semibold">{account?.name || "Guest workspace"}</p><p className="text-xs text-muted">{account?.email || "Research without an account"}</p></div>
                <Link href="/settings" onClick={() => setProfileOpen(false)} className="block min-h-10 rounded-lg px-3 py-2 text-sm hover:bg-[#F4F2ED]">Settings</Link>
                <Link href="/settings?tab=connections" onClick={() => setProfileOpen(false)} className="block min-h-10 rounded-lg px-3 py-2 text-sm hover:bg-[#F4F2ED]">Connections</Link>
                <Link href="/help" onClick={() => setProfileOpen(false)} className="block min-h-10 rounded-lg px-3 py-2 text-sm hover:bg-[#F4F2ED]">Help</Link>
                {account ? <button type="button" className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-[#FDF0F0] disabled:opacity-50" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button> : <Link href="/auth" onClick={() => setProfileOpen(false)} className="block min-h-10 rounded-lg px-3 py-2 text-sm text-action hover:bg-[#F4F2ED]">Save across devices · Sign in</Link>}
                {signOutError ? <p role="alert" className="px-3 py-2 text-xs text-bad">{signOutError}</p> : null}
              </div> : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-3 py-5 pb-24 sm:px-5 lg:px-7 lg:py-6 md:pb-8">
        <main id="main">{children}</main>
      </div>

      <nav className="thesis-mobile-nav fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t md:hidden" aria-label="Primary mobile">
        {NAV.map(([label, href]) => <Link key={href} href={href} aria-current={isCurrent(label, href, path) ? "page" : undefined} className={`flex items-center justify-center ${isCurrent(label, href, path) ? "font-semibold text-action" : "text-muted"}`}><NavIcon label={label} size={20} /><span>{label}</span></Link>)}
      </nav>

      <ContextualAssistant />
      {pendingMode ? <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingMode(null); }}>
        <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="mode-dialog-title">
          <div className="flex items-start justify-between gap-4"><div><p className="source-pill">Context change</p><h2 id="mode-dialog-title" className="mt-3 font-serif text-2xl font-bold">Switch to {pendingMode === "live" ? "live data" : pendingMode === "paper" ? "Paper simulation" : "Replay data"}?</h2></div><button type="button" aria-label="Cancel context change" className="min-h-10 rounded-lg px-3 text-xl text-muted hover:bg-[#F4F2ED]" onClick={() => setPendingMode(null)}>×</button></div>
          <p className="mt-3 text-sm text-muted">Your notes and saved view stay in place. Market selections and open offers are revalidated for the new context; a quote tied to another source is cleared. Existing orders and positions remain in their original environment.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="app-button min-h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => setPendingMode(null)}>Cancel</button><button type="button" className="app-button min-h-11 rounded-lg bg-action px-5 text-sm font-semibold text-white" onClick={confirmModeChange}>Switch context</button></div>
        </section>
      </div> : null}
    </div>
  );
}
