"use client";

import Link from "next/link";
import { useEffect } from "react";

const TABS = [
  ["Research", ""],
  ["Build", "/build"],
  ["Compare", "/compare"],
] as const;
type Stage = (typeof TABS)[number][0];

export function ThesisWorkspaceTabs({ thesisId, current, onNavigate, lockedTabs = [] }: {
  thesisId: string;
  current: Stage | "History";
  onNavigate?: (href: string) => boolean;
  lockedTabs?: Stage[];
}) {
  useEffect(() => {
    const pathname = window.location.pathname;
    if (!pathname.startsWith(`/theses/${thesisId}`)) return;
    localStorage.setItem(`thesis:last-workspace:${thesisId}`, `${pathname}${window.location.search}`);
    localStorage.setItem("thesis:last-active", thesisId);
  }, [thesisId]);

  return (
    <nav className="workspace-tabs flex items-center justify-between gap-2 overflow-x-auto border-b border-line" aria-label="Thesis workspace">
      <div className="flex shrink-0 gap-1">
        {TABS.map(([label, suffix]) => {
          const selected = label === current;
          const locked = lockedTabs.includes(label);
          if (locked) return <span key={label} aria-disabled="true" title="Confirm your view before continuing" className="min-h-11 shrink-0 cursor-not-allowed border-b-2 border-transparent px-4 py-2 text-sm text-muted/60">{label}</span>;
          const href = `/theses/${thesisId}${suffix}`;
          return <Link key={label} href={href} aria-current={selected ? "page" : undefined} onClick={(event) => { if (!selected && onNavigate && !onNavigate(href)) event.preventDefault(); }} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm ${selected ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-ink"}`}>{label}</Link>;
        })}
      </div>
      <Link href={`/theses/${thesisId}/history`} aria-current={current === "History" ? "page" : undefined} onClick={(event) => { if (current !== "History" && onNavigate && !onNavigate(`/theses/${thesisId}/history`)) event.preventDefault(); }} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm ${current === "History" ? "bg-[#E9EEFF] font-semibold text-action" : "text-muted hover:bg-white hover:text-ink"}`}><span aria-hidden="true">◷</span>History</Link>
    </nav>
  );
}
