"use client";

import { useRouter } from "next/navigation";
import SettingsPage from "../../settings/page";

export default function SettingsSheetRoute() {
  const router = useRouter();
  return (
    <div className="position-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <section className="position-drawer" role="dialog" aria-modal="true" aria-label="Settings and connections">
        <header className="position-drawer__header"><span className="text-sm font-semibold">Settings and connections</span><button type="button" className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => router.back()}>Close</button></header>
        <div className="position-drawer__body"><SettingsPage /></div>
      </section>
    </div>
  );
}
