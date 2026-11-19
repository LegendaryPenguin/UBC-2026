"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PositionPage from "../../../positions/[id]/page";

export default function PositionDrawerRoute() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return <div className="position-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
    <section className="position-drawer" role="dialog" aria-modal="true" aria-label="Position details">
      <header className="position-drawer__header"><span className="text-sm font-semibold">Position details</span><button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => router.back()}>Close</button></header>
      <div className="position-drawer__body"><PositionPage /></div>
    </section>
  </div>;
}
