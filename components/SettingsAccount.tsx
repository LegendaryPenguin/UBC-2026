"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

type AccountData = { name: string; handle: string; timezone: string; density: "beginner" | "compact"; interests: string[]; displayCurrency: string };
const INTERESTS = ["Crypto", "Macro", "Politics"];

export function SettingsAccount({ embedded = false }: { embedded?: boolean }) {
  const [account, setAccount] = useState<AccountData>({ name: "", handle: "", timezone: "America/Chicago", density: "beginner", interests: [], displayCurrency: "USD" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api<{ account: AccountData }>("/api/account").then(({ account: value }) => { if (active) setAccount(value); })
      .catch((cause) => { if (active) { setLoadFailed(true); setError(cause instanceof Error ? cause.message : "Account settings could not be loaded."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function update(change: Partial<AccountData>) {
    setAccount((current) => ({ ...current, ...change }));
    setNotice("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setLoadFailed(false);
    setNotice("");
    try {
      const result = await api<{ account: AccountData }>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ ...account, onboardingComplete: true }),
      });
      setAccount(result.account);
      setNotice("Account and display preferences saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings could not be saved. Your current account values are preserved for retry.");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {embedded ? <h2 className="font-serif text-2xl">Account and preferences</h2> : <h1 className="font-serif text-3xl">Account and preferences</h1>}
      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><p className="mt-2 text-xs text-muted">{loadFailed ? "Your saved profile values could not be loaded." : "Your edits are still here. Correct any highlighted values and retry Save changes."}</p><div className="mt-2 flex gap-2">{error.toLowerCase().includes("sign in") ? <Button href="/auth">Sign in</Button> : null}{loadFailed ? <Button onClick={() => window.location.reload()} kind="ghost">Retry loading</Button> : null}</div></Card> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      <Card className="space-y-3">
        <h3 className="font-serif text-xl">Profile</h3>
        <Field label="Name"><input className={inputCls()} value={account.name} maxLength={100} onChange={(event) => update({ name: event.target.value })} disabled={loading || saving} /></Field>
        <Field label="Handle" hint="3–30 letters, numbers, or underscores."><input className={inputCls()} value={account.handle} maxLength={30} onChange={(event) => update({ handle: event.target.value })} disabled={loading || saving} /></Field>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-serif text-xl">Research preferences</h3>
        <Field label="Interests" hint="Used to personalize discovery. They do not change market data or alerts.">
          <div className="flex flex-wrap gap-2">{INTERESTS.map((interest) => {
            const selected = account.interests.some((item) => item.toLowerCase() === interest.toLowerCase());
            return <button key={interest} type="button" aria-pressed={selected} onClick={() => update({ interests: selected ? account.interests.filter((item) => item.toLowerCase() !== interest.toLowerCase()) : [...account.interests, interest] })} disabled={loading || saving} className={`min-h-10 rounded-full border px-3 text-sm ${selected ? "border-action bg-[#E9EEFF] text-action" : "border-line text-muted"}`}>{interest}</button>;
          })}</div>
        </Field>
        <Field label="Timezone" hint="Display only. Settlement deadlines stay on the contract's stated clock."><input className={inputCls()} value={account.timezone} maxLength={80} onChange={(event) => update({ timezone: event.target.value })} disabled={loading || saving} /></Field>
        <Field label="Explanation density">
          <select className={inputCls()} value={account.density} onChange={(event) => update({ density: event.target.value as AccountData["density"] })} disabled={loading || saving}><option value="beginner">Beginner explanations</option><option value="compact">Compact</option></select>
        </Field>
        <p className="text-xs text-muted">USD display is the only supported currency at this time.</p>
      </Card>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={loading || saving || !account.name.trim() || !account.handle.trim()}>{saving ? "Saving…" : "Save changes"}</Button><Button href="/settings?tab=privacy" kind="danger">Close account</Button></div>
    </div>
  );
}
