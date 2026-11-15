"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WalletButton } from "@/components/WalletButton";

const NAV = [
  ["Home", "/home"],
  ["Explore", "/explore"],
  ["Workspace", "/workspace"],
  ["Portfolio", "/portfolio"],
  ["Alerts", "/alerts"],
  ["Journal", "/journal"],
];

const MORE = [
  ["Activity", "/activity"],
  ["Reports", "/reports"],
  ["Help", "/help"],
  ["Settings", "/settings"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mode, setMode] = useState("replay");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setMode(localStorage.getItem("thesis_mode") || "replay");
  }, [path]);
  function changeMode(next: string) {
    const current = localStorage.getItem("thesis_mode") || "replay";
    if (current !== next && !window.confirm("Switching mode does not move quotes or positions between environments. Continue?")) return;
    localStorage.setItem("thesis_mode", next);
    setMode(next);
  }
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 bg-white px-3 py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-[#F4F2ED]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-serif text-2xl">Thesis</Link>
          <nav className="hidden gap-3 text-sm md:flex" aria-label="Primary">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? "font-semibold" : "text-muted"}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden text-xs text-muted sm:block">
              Mode
              <select
                className="ml-2 min-h-11 rounded-lg border border-line bg-white px-2"
                value={mode}
                onChange={(e) => changeMode(e.target.value)}
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
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_180px]">
        <main id="main">{children}</main>
        <aside className="hidden lg:block">
          <p className="text-xs uppercase tracking-wide text-muted">More</p>
          <nav className="mt-2 space-y-2 text-sm">
            {MORE.map(([label, href]) => (
              <Link key={href} href={href} className="block text-muted hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
        </aside>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4 border-t border-line bg-white md:hidden" aria-label="Mobile">
        {[
          ["Home", "/home"],
          ["Explore", "/explore"],
          ["Portfolio", "/portfolio"],
          ["Inbox", "/notifications"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="flex min-h-11 items-center justify-center text-xs">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
