import type { PricePoint } from "@/lib/domain/types";

const WIDTH = 720;
const HEIGHT = 260;
const LEFT = 48;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 34;

export function MarketPriceHistory({ series, illustrative = false, liveSession = false }: {
  series: { label: string; color: string; points: PricePoint[] }[];
  illustrative?: boolean;
  liveSession?: boolean;
}) {
  const normalized = series.map((item) => ({
    ...item,
    points: item.points
      .map((point) => ({ ...point, time: Date.parse(point.timestamp), value: Number(point.price) }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value >= 0 && point.value <= 1)
      .sort((a, b) => a.time - b.time),
  }));
  const points = normalized.flatMap((item) => item.points);
  if (!points.length) {
    return (
      <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-serif text-xl">Market-price history</h2>
        <p className="mt-2 text-sm text-muted">Gemini has not returned a history series for these contracts. Current bid and ask references remain available below.{liveSession ? " New Gemini trade prints will appear here while this page stays connected." : ""}</p>
      </section>
    );
  }

  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (time: number, index: number, length: number) => maxTime > minTime
    ? LEFT + ((time - minTime) / (maxTime - minTime)) * plotWidth
    : LEFT + (length <= 1 ? plotWidth / 2 : (index / (length - 1)) * plotWidth);
  const y = (value: number) => TOP + (1 - value) * plotHeight;
  const dateLabel = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const start = dateLabel(minTime);
  const end = dateLabel(maxTime);

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl">Market-price history</h2>
          <p className="mt-1 text-xs text-muted">YES contract price per $1 payout · price is not a forecast probability{liveSession ? " · live prints accrue only during this session" : ""}</p>
        </div>
        {illustrative ? <span className="rounded-full bg-[#FFF8E7] px-3 py-1 text-xs text-muted">Illustrative replay</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {normalized.filter((item) => item.points.length).map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="h-0.5 w-4" style={{ backgroundColor: item.color }} />{item.label}
          </span>
        ))}
      </div>
      <svg className="mt-3 w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Historical Gemini YES contract prices over time">
        {[0, 0.25, 0.5, 0.75, 1].map((value) => {
          const lineY = y(value);
          return (
            <g key={value}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={lineY} y2={lineY} stroke="#E4E6E8" strokeWidth="1" />
              <text x={LEFT - 8} y={lineY + 4} textAnchor="end" fill="#52616B" fontSize="12">{Math.round(value * 100)}¢</text>
            </g>
          );
        })}
        <line x1={LEFT} x2={LEFT} y1={TOP} y2={HEIGHT - BOTTOM} stroke="#A9B1B5" />
        <line x1={LEFT} x2={WIDTH - RIGHT} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM} stroke="#A9B1B5" />
        {normalized.filter((item) => item.points.length).map((item) => {
          const coordinates = item.points.map((point, index) => `${x(point.time, index, item.points.length)},${y(point.value)}`).join(" ");
          return (
            <g key={item.label}>
              {item.points.length > 1 ? <polyline points={coordinates} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
              {item.points.map((point, index) => <circle key={`${point.timestamp}-${index}`} cx={x(point.time, index, item.points.length)} cy={y(point.value)} r={item.points.length === 1 ? 5 : 2} fill={item.color} />)}
            </g>
          );
        })}
        <text x={LEFT} y={HEIGHT - 8} fill="#52616B" fontSize="12">{start}</text>
        <text x={WIDTH - RIGHT} y={HEIGHT - 8} textAnchor="end" fill="#52616B" fontSize="12">{end}</text>
      </svg>
      {illustrative ? <p className="mt-1 text-xs text-muted">Replay points are demonstration fixtures, not live Gemini history.</p> : null}
    </section>
  );
}
