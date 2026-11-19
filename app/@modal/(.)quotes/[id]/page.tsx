"use client";

import { useRouter } from "next/navigation";
import QuotePage from "../../../quotes/[id]/page";

export default function QuoteDrawerRoute() {
  const router = useRouter();
  return (
    <div className="position-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <section className="position-drawer" role="dialog" aria-modal="true" aria-label="Quote and result">
        <header className="position-drawer__header"><span className="text-sm font-semibold">Quote and result</span><button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => router.back()}>Close</button></header>
        <div className="position-drawer__body"><QuotePage /></div>
      </section>
    </div>
  );
}
