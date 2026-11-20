"use client";

import { formatUsdcFixed } from "@/lib/format";

export function PayoffChart({
  labels,
  series,
  selectedIndex,
  onSelect,
}: {
  labels: string[];
  series: { name: string; values: bigint[]; color: string }[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const max = series.reduce((m, s) => s.values.reduce((n, v) => (v > n ? v : n), m), 1n);
  return (
    <div className="demo-payoff-chart">
      <div className="demo-chart-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Payoff comparison by scenario">
        {labels.map((label, i) => (
          <div key={label} className={`demo-scenario rounded-lg border p-3 ${selectedIndex === i ? "border-action bg-[#F2F5FF]" : "border-line"}`}>
            {onSelect ? <button className="demo-scenario-select" type="button" aria-label={`Inspect ${label}`} aria-pressed={selectedIndex === i} onClick={() => onSelect(i)} /> : null}
            <p className="text-xs text-muted">{label}</p>
            <div className="mt-3 flex items-end gap-2" style={{ height: 140 }}>
              {series.map((s) => {
                const v = s.values[i] ?? 0n;
                const h = Number((v * 120n) / max);
                return (
                  <div key={s.name} className="flex-1">
                    <div className="demo-chart-bar mx-auto w-8 rounded-t" style={{ height: Math.max(2, h), background: s.color }}><span>{formatUsdcFixed(v).replace(/\.00$/, "")}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <details className="demo-details"><summary>Exact chart values</summary><table className="mt-4 w-full text-left text-sm">
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
      </table></details>
    </div>
  );
}
