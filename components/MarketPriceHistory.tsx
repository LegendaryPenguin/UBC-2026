"use client";

import { useId, useState } from "react";
import type { PricePoint } from "@/lib/domain/types";
import { useCompactWorkspace } from "@/lib/use-compact-workspace";

const day = 86_400_000;

export function MarketPriceHistory({ series, illustrative = false, liveSession = false, title = "Market-price history" }: {
  series: { label: string; color: string; points: PricePoint[] }[];
  illustrative?: boolean;
  liveSession?: boolean;
  title?: string;
}) {
  const compact = useCompactWorkspace();
  const [range, setRange] = useState("all");
  const rangeId = useId();
  const width = compact ? 380 : 720;
  const height = compact ? 190 : 245;
  const left = compact ? 39 : 48;
  const right = 14;
  const top = 14;
  const bottom = 28;
  const fontSize = compact ? 13 : 12;
  const allSeries = series.map((item) => ({
    ...item,
    points: item.points
      .map((point) => ({ ...point, time: Date.parse(point.timestamp), value: Number(point.price) }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value >= 0 && point.value <= 1)
      .sort((a, b) => a.time - b.time),
  }));
  const allPoints = allSeries.flatMap((item) => item.points);
  if (!allPoints.length) {
    return (
      <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="mt-2 text-sm text-muted">Gemini has not returned a history series for these contracts. Current bid and ask references remain available below.{liveSession ? " New Gemini trade prints will appear here while this page stays connected." : ""}</p>
      </section>
    );
  }

  const latest = Math.max(...allPoints.map((point) => point.time));
  const earliest = Math.min(...allPoints.map((point) => point.time));
  const canFilter = latest - earliest > day;
  const startAt = range === "all" || !canFilter ? earliest : latest - Number(range) * day;
  const normalized = allSeries.map((item) => ({ ...item, points: item.points.filter((point) => point.time >= startAt) })).filter((item) => item.points.length);
  const points = normalized.flatMap((item) => item.points);
  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (time: number, index: number, length: number) => maxTime > minTime
    ? left + ((time - minTime) / (maxTime - minTime)) * plotWidth
    : left + (length <= 1 ? plotWidth / 2 : (index / (length - 1)) * plotWidth);
  const y = (value: number) => top + (1 - value) * plotHeight;
  const dateLabel = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const start = dateLabel(minTime);
  const end = dateLabel(maxTime);

  return (
    <section className="market-history rounded-card border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl">{title}</h2>
          <p className="mt-1 text-xs text-muted">Gemini YES contract prices in cents{liveSession ? " · includes live trades from this session" : ""}</p>
        </div>
        {illustrative ? <span className="rounded-full bg-[#FFF8E7] px-3 py-1 text-xs text-muted">Illustrative replay</span> : null}
        {canFilter ? <div className="market-history__range">
          <label htmlFor={rangeId}>Range</label>
          <select id={rangeId} value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="all">All data</option>
            {latest - earliest > 7 * day ? <option value="7">Last 7 days</option> : range === "7" ? <option value="7">Last 7 days</option> : null}
            <option value="1">Last 24 hours</option>
          </select>
        </div> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {normalized.map((item) => {
          const first = item.points[0];
          const last = item.points[item.points.length - 1];
          const move = Number(((last.value - first.value) * 100).toFixed(2));
          return (
            <span key={item.label} className="market-history__legend">
              <span className="h-0.5 w-4 shrink-0" style={{ backgroundColor: item.color }} />{item.label}
              <strong title="Last displayed price">{Number((last.value * 100).toFixed(2))}¢</strong>
              {last.time > first.time ? <span className="market-history__move" title={`Change since ${dateLabel(first.time)}`} aria-label={`${move > 0 ? "+" : ""}${move} cents over the displayed period`}>{move > 0 ? "+" : ""}{move}¢</span> : null}
            </span>
          );
        })}
      </div>
      <svg className="mt-3 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical Gemini YES contract prices over time">
        {[0, 0.25, 0.5, 0.75, 1].map((value) => {
          const lineY = y(value);
          return (
            <g key={value}>
              <line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#E4E6E8" strokeWidth="1" />
              <text x={left - 6} y={lineY + 4} textAnchor="end" fill="#52616B" fontSize={fontSize}>{Math.round(value * 100)}¢</text>
            </g>
          );
        })}
        <line x1={left} x2={left} y1={top} y2={height - bottom} stroke="#A9B1B5" />
        <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="#A9B1B5" />
        {normalized.filter((item) => item.points.length).map((item) => {
          const coordinates = item.points.map((point, index) => `${x(point.time, index, item.points.length)},${y(point.value)}`).join(" ");
          return (
            <g key={item.label}>
              {item.points.length > 1 ? <polyline points={coordinates} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
              {item.points.map((point, index) => <circle key={`${point.timestamp}-${index}`} cx={x(point.time, index, item.points.length)} cy={y(point.value)} r={item.points.length === 1 ? 5 : 2.5} fill={item.color}><title>{item.label} · {Number((point.value * 100).toFixed(2))}¢ · {new Date(point.time).toLocaleString()}</title></circle>)}
            </g>
          );
        })}
        <text x={left} y={height - 6} fill="#52616B" fontSize={fontSize}>{start}</text>
        {start !== end ? <text x={width - right} y={height - 6} textAnchor="end" fill="#52616B" fontSize={fontSize}>{end}</text> : null}
      </svg>
      <details className="market-history__values">
        <summary>View chart values</summary>
        <div className="table-scroll">
          <table className="w-full text-left text-xs">
            <thead><tr><th scope="col">Contract</th><th scope="col">Time</th><th scope="col">YES price</th></tr></thead>
            <tbody>{normalized.flatMap((item, seriesIndex) => item.points.map((point, pointIndex) => (
              <tr key={`${seriesIndex}-${pointIndex}`}><td>{item.label}</td><td><time dateTime={point.timestamp}>{new Date(point.time).toLocaleString()}</time></td><td>{Number((point.value * 100).toFixed(2))}¢</td></tr>
            )))}</tbody>
          </table>
        </div>
      </details>
      {illustrative ? <p className="mt-1 text-xs text-muted">Replay points are demonstration fixtures, not live Gemini history.</p> : null}
    </section>
  );
}
