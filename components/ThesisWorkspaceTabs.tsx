"use client";

import Link from "next/link";

const TABS = [
  ["Research", ""],
  ["Build", "/build"],
  ["Compare", "/compare"],
  ["History", "/history"],
] as const;

export function ThesisWorkspaceTabs({ thesisId, current, onNavigate, lockedTabs = [] }: {
  thesisId: string;
  current: (typeof TABS)[number][0];
  onNavigate?: () => boolean;
  lockedTabs?: (typeof TABS)[number][0][];
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Thesis workspace">
      {TABS.map(([label, suffix]) => {
        const selected = label === current;
        const locked = lockedTabs.includes(label);
        if (locked) {
          return (
            <span key={label} aria-disabled="true" title="Confirm your view before continuing" className="min-h-11 shrink-0 cursor-not-allowed border-b-2 border-transparent px-4 py-2 text-sm text-muted/60">
              {label}
            </span>
          );
        }
        return (
          <Link
            key={label}
            href={`/theses/${thesisId}${suffix}`}
            aria-current={selected ? "page" : undefined}
            onClick={(event) => {
              if (!selected && onNavigate && !onNavigate()) event.preventDefault();
            }}
            className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm ${selected ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
