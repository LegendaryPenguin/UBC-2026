"use client";

import { formatUsdcFixed } from "@/lib/format";

export function PayoffChart({
  labels,
  series,
  selectedIndex,
}: {
  labels: string[];
  series: { name: string; values: bigint[]; color: string }[];
  selectedIndex?: number;
}) {
  const max = series.reduce((m, s) => s.values.reduce((n, v) => (v > n ? v : n), m), 1n);
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3" role="img" aria-label="Payoff comparison by scenario">
        {labels.map((label, i) => (
          <div key={label} className={`rounded-lg border p-3 ${selectedIndex === i ? "border-action bg-[#F2F5FF]" : "border-line"}`}>
            <p className="text-xs text-muted">{label}</p>
            <div className="mt-3 flex items-end gap-2" style={{ height: 140 }}>
              {series.map((s) => {
                const v = s.values[i] ?? 0n;
                const h = Number((v * 120n) / max);
                return (
                  <div key={s.name} className="flex-1">
                    <div className="mx-auto w-8 rounded-t" style={{ height: Math.max(4, h), background: s.color }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <table className="mt-4 w-full text-left text-sm">
        <caption className="sr-only">Numeric payoff table</caption>
        <thead>
          <tr>
            <th className="border-b border-line py-2">Scenario</th>
            {series.map((s) => (
              <th key={s.name} className="border-b border-line py-2">{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label} className={selectedIndex === i ? "bg-[#F2F5FF] font-medium" : undefined}>
              <td className="py-2">{label}</td>
              {series.map((s) => (
                <td key={s.name}>{formatUsdcFixed(s.values[i] ?? 0n)} USDC</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
