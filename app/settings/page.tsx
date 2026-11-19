"use client";

import { useEffect, useState } from "react";
import { SettingsAccount } from "@/components/SettingsAccount";
import { SettingsSecurity } from "@/components/SettingsSecurity";
import { SettingsConnections } from "@/components/SettingsConnections";
import { SettingsNotifications } from "@/components/SettingsNotifications";
import { SettingsPrivacy } from "@/components/SettingsPrivacy";

const TABS = [
  ["account", "Account"],
  ["security", "Security"],
  ["connections", "Connections"],
  ["notifications", "Notifications"],
  ["privacy", "Privacy"],
] as const;
type SettingsTab = (typeof TABS)[number][0];

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>("account");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([value]) => value === requested)) setTab(requested as SettingsTab);
  }, []);
  function choose(next: SettingsTab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }
  return (
    <div className="space-y-5">
      <div><h1 className="font-serif text-3xl">Account and settings</h1><p className="mt-1 text-sm text-muted">Manage your account, connected services, and privacy in one place.</p></div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Settings sections">
        {TABS.map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => choose(value)} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm ${tab === value ? "border-action font-semibold text-action" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>)}
      </nav>
      {tab === "account" ? <SettingsAccount embedded /> : null}
      {tab === "security" ? <SettingsSecurity embedded /> : null}
      {tab === "connections" ? <SettingsConnections embedded /> : null}
      {tab === "notifications" ? <SettingsNotifications embedded /> : null}
      {tab === "privacy" ? <SettingsPrivacy embedded /> : null}
    </div>
  );
}
