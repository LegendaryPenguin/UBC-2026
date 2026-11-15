"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("America/Chicago");
  const [density, setDensity] = useState("beginner");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Setup · step {step} of 4</h1>
      {step === 1 ? (
        <Card>
          <Field label="Interests">
            <div className="flex gap-2">
              {["Crypto", "Macro", "Politics"].map((i) => (
                <button
                  key={i}
                  className={`min-h-11 rounded-lg border px-3 ${interests.includes(i) ? "bg-ink text-white" : "border-line"}`}
                  onClick={() => setInterests((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>
        </Card>
      ) : null}
      {step === 2 ? (
        <Card>
          <Field label="Timezone" hint="Display only. Settlement times stay on the contract clock.">
            <input className={inputCls()} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
        </Card>
      ) : null}
      {step === 3 ? (
        <Card>
          <Field label="Explanations">
            <select className={inputCls()} value={density} onChange={(e) => setDensity(e.target.value)}>
              <option value="beginner">Beginner explanations</option>
              <option value="compact">Compact</option>
            </select>
          </Field>
        </Card>
      ) : null}
      {step === 4 ? (
        <Card>
          <p className="text-sm">Link a wallet now or explore first. Connecting does not request an allowance.</p>
          <Button href="/wallet" kind="ghost">Open wallet</Button>
        </Card>
      ) : null}
      <div className="flex gap-2">
        <Button kind="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
        {step < 4 ? <Button onClick={() => setStep((s) => s + 1)}>Continue</Button> : (
          <Button
            onClick={async () => {
              await api("/api/account", { method: "PATCH", body: JSON.stringify({ interests, timezone, density, onboardingComplete: true }) });
              window.location.href = "/home";
            }}
          >
            Finish
          </Button>
        )}
        <Button kind="ghost" onClick={() => (window.location.href = "/home")}>Skip</Button>
      </div>
    </div>
  );
}
