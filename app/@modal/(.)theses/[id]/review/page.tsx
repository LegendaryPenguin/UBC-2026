"use client";

import { useRouter } from "next/navigation";
import ReviewPage from "../../../../theses/[id]/review/page";

export default function ReviewDrawerRoute() {
  const router = useRouter();
  return (
    <div className="position-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <section className="position-drawer" role="dialog" aria-modal="true" aria-label="Review construction">
        <header className="position-drawer__header"><span className="text-sm font-semibold">Review construction</span><button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => router.back()}>Close</button></header>
        <div className="position-drawer__body"><ReviewPage /></div>
      </section>
    </div>
  );
}
