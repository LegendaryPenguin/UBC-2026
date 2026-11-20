"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  announceModeChange,
  dataContextFromStorage,
  executionEnvironmentFromStorage,
  MODE_CHANGE_EVENT,
  MODE_CHANGE_REQUEST_EVENT,
  setDataContext,
  setExecutionEnvironment,
  type ExecutionEnvironment,
  type DataContext,
} from "@/lib/client";
import { ContextualAssistant } from "@/components/ContextualAssistant";
import { AppDialog } from "@/components/AppDialog";
import { BrandMark, Icon, type IconName } from "@/components/thesis";
import { Button, Badge } from "@/components/ui";

type Mode = "replay" | "live" | "paper";
type Account = { name?: string | null; email?: string | null } | null;
type PendingContext = { axis: "execution"; value: ExecutionEnvironment };

const NAV = [
  ["Dashboard", "/", "dashboard"],
  ["Explore", "/explore", "explore"],
  ["My Theses", "/theses", "theses"],
  ["Portfolio", "/portfolio", "portfolio"],
] as const;

function isCurrent(label: string, href: string, path: string) {
  if (label === "Dashboard") return path === "/" || path === "/home";
  if (label === "Explore") return ["/explore", "/topics", "/gemini", "/search", "/calendar", "/watchlists"]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (label === "My Theses") return path === "/theses" || path === "/workspace" || path.startsWith("/theses/");
  return ["/portfolio", "/positions", "/quotes", "/orders", "/activity", "/alerts", "/notifications", "/transactions"]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [dataContext, setCurrentDataContext] = useState<DataContext>("live");
  const [executionEnvironment, setCurrentExecutionEnvironment] = useState<ExecutionEnvironment>("none");
  const [pendingContext, setPendingContext] = useState<PendingContext | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [account, setAccount] = useState<Account>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    setCurrentDataContext(dataContextFromStorage());
    setCurrentExecutionEnvironment(executionEnvironmentFromStorage());
  }, [path]);

  useEffect(() => {
    let active = true;
    api<{ account: Account }>("/api/auth").then(({ account: value }) => { if (active) setAccount(value); }).catch(() => { if (active) setAccount(null); });
    return () => { active = false; };
  }, [path]);

  useEffect(() => {
    const syncMode = (event: Event) => {
      const detail = (event as CustomEvent<{
        mode?: Mode;
        executionEnvironment?: ExecutionEnvironment;
      }>).detail;
      setCurrentDataContext(dataContextFromStorage());
      setCurrentExecutionEnvironment(detail?.executionEnvironment || executionEnvironmentFromStorage());
    };
    const requestMode = (event: Event) => {
      const detail = (event as CustomEvent<{
        mode?: Mode;
        axis?: "data" | "execution";
        value?: ExecutionEnvironment;
      }>).detail;
      if (detail?.axis === "data") {
        setDataContext("live");
        setCurrentDataContext("live");
        return;
      }
      if (detail?.axis === "execution" && ["none", "paper", "gemini", "arc"].includes(String(detail.value))) {
        setPendingContext({ axis: "execution", value: detail.value as ExecutionEnvironment });
      } else if (detail?.mode === "paper") {
        setPendingContext({ axis: "execution", value: "paper" });
      } else if (detail?.mode === "live" || detail?.mode === "replay") {
        setDataContext("live");
        setCurrentDataContext("live");
      }
    };
    window.addEventListener(MODE_CHANGE_EVENT, syncMode);
    window.addEventListener(MODE_CHANGE_REQUEST_EVENT, requestMode);
    return () => {
      window.removeEventListener(MODE_CHANGE_EVENT, syncMode);
      window.removeEventListener(MODE_CHANGE_REQUEST_EVENT, requestMode);
    };
  }, []);

  useEffect(() => {
    if (!profileOpen && !modeOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileOpen(false);
      setModeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen, modeOpen]);

  const confirmContextChange = useCallback(() => {
    if (!pendingContext) return;
    setExecutionEnvironment(pendingContext.value);
    setCurrentExecutionEnvironment(pendingContext.value);
    setDataContext("live");
    setCurrentDataContext("live");
    announceModeChange(pendingContext.value === "paper" ? "paper" : "live", {
      dataContext: "live",
      executionEnvironment: pendingContext.value,
    });
    setPendingContext(null);
    setModeOpen(false);
  }, [pendingContext]);

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

  const environmentLabel = dataContext === "replay" ? "Recorded Gemini · Paper" : executionEnvironment === "paper"
    ? "Live data · Paper"
    : executionEnvironment === "gemini" ? "Live data · Gemini"
      : executionEnvironment === "arc" ? "Live data · Arc"
        : "Live market data";
  const sourceLabel = dataContext === "replay" ? "Recorded Gemini market data" : "Live Gemini prediction markets";
  const executionLabel = executionEnvironment === "paper" ? "Paper simulation"
    : executionEnvironment === "gemini" ? "Gemini sandbox"
      : executionEnvironment === "arc" ? "Arc testnet" : "Research only";

  const profileInitial = (account?.name || account?.email || "G").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <a href="#main" className="th-sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 z-50 bg-white px-3 py-2">Skip to content</a>
      <div className="thesis-shell">
        <header className="thesis-header">
          <div className="thesis-header__inner flex w-full items-center">
            <Link href="/" className="th-brand thesis-brand shrink-0" aria-label="Thesis dashboard">
              <BrandMark size={28} />
              Thesis
            </Link>
            <nav className="th-nav th-desktop-nav ml-3" aria-label="Primary">
              {NAV.map(([label, href, icon]) => (
                <Link key={href} href={href} aria-current={isCurrent(label, href, path) ? "page" : undefined} className="thesis-nav-link inline-flex items-center gap-2">
                  <Icon name={icon as IconName} size={18} />{label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
              <div className="relative">
                <button type="button" className="thesis-env-pill" aria-expanded={modeOpen} aria-controls="environment-menu" aria-label={environmentLabel} onClick={() => { setModeOpen((value) => !value); setProfileOpen(false); }}>
                  <Icon name="globe" size={14} />
                  <span className="thesis-env-pill__label">{environmentLabel}</span>
                  <Icon name="chevron-down" size={14} />
                </button>
                {modeOpen ? <div id="environment-menu" className="thesis-popover absolute right-0 top-11 z-40 w-[min(92vw,330px)] p-4" aria-label="Data and execution context">
                  <div className="grid gap-3 text-sm">
                    <div><p className="th-label">Market data</p><p className="mt-1 font-medium">{sourceLabel}</p>{dataContext === "replay" ? <Button className="mt-2" kind="secondary" onClick={() => {
                      setDataContext("live");
                      setExecutionEnvironment("none");
                      setModeOpen(false);
                      announceModeChange("live");
                    }}>Return to live Gemini</Button> : null}</div>
                    <div><p className="th-label">Execution environment</p><p className="mt-1 font-medium">{executionLabel}</p><p className="mt-1 text-xs th-muted">Review always names the venue before any approval.</p></div>
                    <div className="grid gap-2 border-t border-line pt-3">
                      <p className="th-label">Choose execution</p>
                      {([["none", "Research only"], ["paper", "Paper simulation"], ["gemini", "Gemini sandbox"], ["arc", "Arc testnet"]] as [ExecutionEnvironment, string][]).map(([value, label]) => <button key={value} type="button" className={`min-h-11 rounded-lg border px-3 text-left text-sm ${executionEnvironment === value ? "border-action bg-[var(--th-selected)] text-action" : "border-line hover:bg-[var(--th-soft)]"}`} onClick={() => { setModeOpen(false); if (executionEnvironment !== value) setPendingContext({ axis: "execution", value }); }}>{label}{executionEnvironment === value ? " · current" : ""}</button>)}
                    </div>
                  </div>
                </div> : null}
              </div>
              <div className="relative">
                <button type="button" className="thesis-profile-button" aria-label="Profile" aria-expanded={profileOpen} aria-controls="profile-menu" onClick={() => { setProfileOpen((value) => !value); setModeOpen(false); }}>{account ? profileInitial : <Icon name="user" size={18} />}</button>
                {profileOpen ? <div id="profile-menu" className="thesis-popover absolute right-0 top-12 z-40 min-w-[220px] p-2" aria-label="Profile menu">
                  <div className="border-b border-line px-3 py-2"><p className="text-sm font-semibold">{account?.name || "Guest workspace"}</p><p className="text-xs th-muted">{account?.email || "Research without an account"}</p></div>
                  <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--th-soft)]"><Icon name="settings" size={16} />Settings</Link>
                  <Link href="/settings?tab=connections" onClick={() => setProfileOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--th-soft)]"><Icon name="link" size={16} />Connections</Link>
                  <Link href="/help" onClick={() => setProfileOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--th-soft)]"><Icon name="help" size={16} />Help</Link>
                  {account ? <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-[var(--th-danger-bg)] disabled:opacity-50" onClick={() => void signOut()} disabled={signingOut}><Icon name="logout" size={16} />{signingOut ? "Signing out…" : "Sign out"}</button> : <Link href={`/auth?returnTo=${encodeURIComponent(path)}`} onClick={() => setProfileOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-action hover:bg-[var(--th-soft)]"><Icon name="user" size={16} />Save across devices · Sign in</Link>}
                  {signOutError ? <p role="alert" className="px-3 py-2 text-xs text-bad">{signOutError}</p> : null}
                </div> : null}
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className="th-main thesis-main mx-auto w-full pb-24 md:pb-8">
        <main id="main">{children}</main>
      </div>

      <nav className="th-mobile-nav thesis-mobile-nav" aria-label="Primary mobile">
        {NAV.map(([label, href, icon]) => (
          <Link key={href} href={href} aria-current={isCurrent(label, href, path) ? "page" : undefined}>
            <Icon name={icon as IconName} size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <ContextualAssistant />
      <AppDialog open={Boolean(pendingContext)} titleId="mode-dialog-title" onClose={() => setPendingContext(null)}>
        {pendingContext ? <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge tone="primary">Context change</Badge>
              <h2 id="mode-dialog-title" className="mt-3 font-serif text-2xl font-bold">Switch to {pendingContext.value === "paper" ? "Paper simulation" : pendingContext.value === "gemini" ? "Gemini sandbox" : pendingContext.value === "arc" ? "Arc testnet" : "research only"}?</h2>
            </div>
            <button type="button" aria-label="Cancel context change" className="th-button th-button--ghost th-button--icon" onClick={() => setPendingContext(null)}><Icon name="close" /></button>
          </div>
          <p className="mt-3 text-sm th-muted">Your notes and saved view stay in place. Market selections and open offers are revalidated for the new execution environment. Existing orders and positions remain in their original environment.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button kind="ghost" onClick={() => setPendingContext(null)}>Cancel</Button>
            <Button onClick={confirmContextChange}>Switch context</Button>
          </div>
        </> : null}
      </AppDialog>
    </div>
  );
}
