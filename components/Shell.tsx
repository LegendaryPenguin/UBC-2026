"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { MODE_CHANGE_EVENT, requestModeChange } from "@/lib/client";

const NAV = [
  ["Explore", "/explore"],
  ["My Theses", "/workspace"],
  ["Portfolio", "/portfolio"],
];

const MORE = [
  ["Gemini markets", "/gemini"],
  ["Alerts", "/alerts"],
  ["Journal", "/journal"],
  ["Activity", "/activity"],
  ["Reports", "/reports"],
  ["Help", "/help"],
  ["App guide", "/guide"],
  ["Settings", "/settings"],
];

function isCurrent(label: string, href: string, path: string) {
  if (label === "Explore") {
    return ["/explore", "/topics", "/gemini", "/search", "/calendar", "/watchlists"]
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }
  if (label === "My Theses") return path === "/workspace" || path.startsWith("/theses/");
  if (label === "Portfolio") return path === "/portfolio" || path.startsWith("/positions/");
  return path === href || path.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mode, setMode] = useState("replay");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setMode(localStorage.getItem("thesis_mode") || "replay");
  }, [path]);
  useEffect(() => {
    const syncMode = () => setMode(localStorage.getItem("thesis_mode") || "replay");
    window.addEventListener(MODE_CHANGE_EVENT, syncMode);
    return () => window.removeEventListener(MODE_CHANGE_EVENT, syncMode);
  }, []);
  function changeMode(next: "replay" | "live" | "paper") {
    if (!requestModeChange(next)) return false;
    setMode(next);
    return true;
  }
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 bg-white px-3 py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-[#F7F5F0]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-3 lg:px-7">
          <Link href="/explore" className="flex shrink-0 items-center gap-2 font-serif text-2xl" aria-label="Thesis home">
            <span aria-hidden="true" className="flex h-7 items-center gap-1">
              <span className="h-5 w-2 -skew-x-[22deg] rounded-sm bg-action" />
              <span className="h-6 w-2 -skew-x-[22deg] rounded-sm bg-[#7FA2FF]" />
            </span>
            Thesis
          </Link>
          <nav className="hidden gap-1 text-sm md:flex" aria-label="Primary">
            {NAV.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={isCurrent(label, href, path) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 ${isCurrent(label, href, path) ? "bg-[#E9EEFF] font-semibold text-action" : "text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <details className="relative hidden md:block">
            <summary className="min-h-11 cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">More</summary>
            <nav className="absolute right-0 top-12 z-30 min-w-44 rounded-xl border border-line bg-white p-2 shadow-lg" aria-label="More">
              {MORE.map(([label, href]) => (
                <Link key={href} href={href} className="block min-h-10 rounded-lg px-3 py-2 text-sm text-muted hover:bg-[#F4F2ED] hover:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
          </details>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden text-xs text-muted sm:block">
              Mode
              <select
                className="ml-2 min-h-11 rounded-lg border border-line bg-white px-2"
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as "replay" | "live" | "paper";
                  if (!changeMode(next)) e.currentTarget.value = mode;
                }}
              >
                <option value="replay">Replay</option>
                <option value="live">Live data</option>
                <option value="paper">Paper</option>
              </select>
            </label>
            <WalletButton />
            <Link href="/auth" className="text-sm">Account</Link>
            <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              Menu
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-line px-4 py-3 md:hidden">
            {[...NAV, ...MORE].map(([label, href]) => (
              <Link key={href} href={href} className="block min-h-11 py-2" onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      <div className="mx-auto w-full max-w-[1600px] px-3 py-5 pb-24 sm:px-5 lg:px-7 lg:py-7 md:pb-7">
        <main id="main">{children}</main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-3 border-t border-line bg-white md:hidden" aria-label="Primary mobile">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href} aria-current={isCurrent(label, href, path) ? "page" : undefined} className={`flex min-h-12 items-center justify-center text-xs ${isCurrent(label, href, path) ? "font-semibold text-action" : "text-muted"}`}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
