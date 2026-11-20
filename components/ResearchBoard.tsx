"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { AppDrawer } from "@/components/AppDrawer";
import { MarketPriceHistory } from "@/components/MarketPriceHistory";
import { Icon, type IconName } from "@/components/thesis";
import { Button, Card } from "@/components/ui";
import type { EvidenceItem, MarketFamily, SourceContract } from "@/lib/domain/types";
import { formatTime } from "@/lib/format";
import type { ResearchReply } from "@/lib/use-research-notebook";
import { researchRangeLabel, type ResearchRange } from "@/lib/research-range";

export function ResearchTile({ title, icon, detail, footer, kind, style, children }: {
  title: string;
  icon?: IconName;
  detail?: ReactNode;
  footer?: ReactNode;
  kind?: "view" | "chart" | "market-search" | "saved";
  style?: CSSProperties;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="research-tile" data-kind={kind} style={style} aria-labelledby={titleId}>
      <header className={kind === "chart" ? "sr-only" : "research-tile__header"}>
        <h2 id={titleId}>{icon ? <Icon name={icon} size={19} /> : null}{title}</h2>
        {detail}
      </header>
      <div className="research-tile__body" tabIndex={0} role="region" aria-label={`${title} contents`}>{children}</div>
      {footer ? <footer className="research-tile__footer">{footer}</footer> : null}
    </section>
  );
}

function priceInCents(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 1) return "—";
  return `${(price * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}¢`;
}

export function researchTime(value: string | null | undefined, fallback = "Not supplied") {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

type PriceSeries = Parameters<typeof MarketPriceHistory>[0]["series"];

export function hasResearchHistory(series: PriceSeries) {
  return series.some(({ points }) => points.some(({ timestamp, price }) =>
    Number.isFinite(Date.parse(timestamp)) && price.trim() && Number(price) >= 0 && Number(price) <= 1,
  ));
}

export function ResearchChart({ family, series, liveSession }: { family: MarketFamily; series: PriceSeries; liveSession?: boolean }) {
  return (
    <ResearchTile title="Market price history" kind="chart">
      <MarketPriceHistory title="What does the market expect?" illustrative={family.mode === "replay"} liveSession={liveSession} series={series} />
    </ResearchTile>
  );
}

export function ResearchPrices({ family, hasHistory, footer }: { family: MarketFamily; hasHistory: boolean; footer?: ReactNode }) {
  return (
    <ResearchTile title="Gemini prices" icon="chart" footer={footer}>
      <div className="research-price-list">
        {family.contracts.map((contract) => (
          <article className="research-price" key={contract.id}>
            <h3>{contract.label}</h3>
            <dl className="research-price__sides">
              {([ ["YES", contract.ask, contract.bid], ["NO", contract.noAsk, contract.noBid] ] as const).map(([side, ask, bid]) => (
                <div key={side} data-side={side}>
                  <dt>{side} ask</dt><dd>{priceInCents(ask)}</dd><small>Bid {priceInCents(bid)}</small>
                </div>
              ))}
            </dl>
            {contract.resolutionSide ? <p>Resolved {contract.resolutionSide.toUpperCase()}</p> : contract.lastTrade ? <p>Last trade {priceInCents(contract.lastTrade)}</p> : null}
          </article>
        ))}
        {!family.contracts.length ? <p className="research-tile__muted">Gemini hasn’t supplied a contract for this market.</p> : null}
      </div>
      <p className="research-tile__muted mt-3">{family.mode === "replay" ? "Recorded reference prices" : `${family.freshness === "stale" ? "Stale reference prices" : "Reference prices"} · ${researchTime(family.fetchedAt, "Time unavailable")}`}</p>
      {!hasHistory ? <p className="research-tile__muted mt-1">Gemini has not returned a history series for these contracts.</p> : null}
    </ResearchTile>
  );
}

export function ResearchRules({ family, contracts = family.contracts }: { family: MarketFamily; contracts?: SourceContract[] }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const source = contracts[0]?.source || family.sourceEvent.sourceIndex || family.sourceEvent.sourceAgency;
  const eventRules = family.sourceEvent.sourceUrl;
  const showEventRules = eventRules && !contracts.some(({ termsUrl }) => termsUrl === eventRules);
  return (
    <>
      <ResearchTile title="Settlement rules" icon="rules" footer={<Button kind="secondary" icon="arrow-right" onClick={() => setOpen(true)}>Read full rules</Button>}>
        <p className="research-rules__question">{family.question}</p>
        <dl className="research-facts mt-3">
          <div><dt>Observation</dt><dd>{researchTime(family.observationTime)}</dd></div>
          <div><dt>Trade cutoff</dt><dd>{researchTime(family.closeTime)}</dd></div>
          <div><dt>Settlement source</dt><dd>{source || "Not supplied"}</dd></div>
        </dl>
      </ResearchTile>
      <AppDrawer open={open} titleId={titleId} onClose={() => setOpen(false)}>
        <header className="research-drawer__header">
          <div><p className="source-pill">Gemini contract terms</p><h2 id={titleId}>Settlement rules</h2></div>
          <button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Close settlement rules" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </header>
        <p className="research-rules__question">{family.question}</p>
        <dl className="research-facts my-4">
          <div><dt>Observation</dt><dd>{formatTime(family.observationTime)}</dd></div>
          <div><dt>Trade cutoff</dt><dd>{formatTime(family.closeTime)}</dd></div>
          <div><dt>Market status</dt><dd className="capitalize">{family.sourceEvent.status.replaceAll("_", " ")}</dd></div>
        </dl>
        <div className="space-y-3">
          {contracts.map((contract) => (
            <article className="research-drawer__block" key={contract.id}>
              <h3>{contract.label}</h3>
              <p className="research-tile__muted mt-2">Exact Gemini contract wording</p>
              <p className="whitespace-pre-wrap text-sm">{contract.description || "Gemini did not include contract-level wording in this response."}</p>
              {contract.strike ? <p className="research-tile__muted mt-2">Strike: {contract.strike.type || "Type not listed"} · {contract.strike.value || "Value not supplied"}{contract.strike.availableAt ? ` · available ${researchTime(contract.strike.availableAt)}` : ""}</p> : null}
              <p className="research-tile__muted mt-2">Settlement source: {contract.source || source || "Not supplied"}</p>
              {contract.termsUrl ? <a className="mt-2 inline-block text-sm text-action underline" href={contract.termsUrl} target="_blank" rel="noreferrer">Open exact Gemini contract rules</a> : <p className="mt-2 text-xs th-muted">No contract-specific rules link was supplied.</p>}
            </article>
          ))}
          {showEventRules ? <a className="inline-block text-sm text-action underline" href={eventRules} target="_blank" rel="noreferrer">Open event-level Gemini rules</a> : null}
        </div>
        <p className="mt-4 break-all border-t border-line pt-3 text-xs th-muted">Gemini snapshot {formatTime(family.sourceEvent.fetchedAt)} · SHA-256 {family.sourceEvent.payloadHash}</p>
      </AppDrawer>
    </>
  );
}

export function ResearchEvidenceList({ items, onSelect }: { items: EvidenceItem[]; onSelect: (item: EvidenceItem) => void }) {
  return <ul className="research-list">
    {items.map((item) => <li key={item.id}>
      <button type="button" className="research-list__item" onClick={() => onSelect(item)}>
        <Icon name={item.mode === "live" ? "rules" : item.stance === "challenges" ? "warning" : "news"} size={18} />
        <span><strong>{item.title}</strong><small>{item.publisher}</small></span><Icon name="chevron-right" size={16} />
      </button>
    </li>)}
  </ul>;
}

export type RelatedContract = { slug: string; label: string; bid: string | null; ask: string | null };

export function ResearchRelatedContracts({ ticker, contracts }: { ticker: string; contracts: RelatedContract[] }) {
  return <ResearchTile title="Related contracts" icon="build" detail={<span className="status-pill">{contracts.length}</span>}>
    <ul className="research-list">
      {contracts.map((contract) => <li key={contract.slug}>
        <Link className="research-list__item" href={`/topics/${contract.slug}?event=${encodeURIComponent(ticker)}`}>
          <Icon name="chart" size={18} /><span><strong>{contract.label}</strong><small>YES ask {priceInCents(contract.ask)} · bid {priceInCents(contract.bid)}</small></span><Icon name="chevron-right" size={16} />
        </Link>
      </li>)}
    </ul>
  </ResearchTile>;
}

export function ResearchOutcomes({ family, range }: { family: MarketFamily; range?: ResearchRange | null }) {
  const integerScore = range?.unit === "points" && /^(NFL|NCAAF|NBA|WNBA|NCAAB)-/i.test(family.sourceEvent.ticker);
  const minPoints = range && integerScore ? (range.lowerInclusive ? Math.ceil(range.lower) : Math.floor(range.lower) + 1) : null;
  const maxPoints = range && integerScore ? (range.upperInclusive ? Math.floor(range.upper) : Math.ceil(range.upper) - 1) : null;
  return <ResearchTile title="Settlement outcomes" icon="compare">
    {range ? <>
      <p className="research-rules__question">{minPoints !== null && maxPoints !== null && minPoints <= maxPoints ? `${minPoints}–${maxPoints} total points matches your view.` : researchRangeLabel(range)}</p>
      {minPoints !== null && maxPoints !== null && minPoints <= maxPoints ? <dl className="research-facts mt-3">
        <div><dt>{minPoints - 1} or fewer</dt><dd>Outside the view</dd></div>
        <div><dt>{minPoints}–{maxPoints}</dt><dd>Matches the view</dd></div>
        <div><dt>{maxPoints + 1} or more</dt><dd>Outside the view</dd></div>
      </dl> : null}
      <p className="research-tile__muted mt-3">Research scenarios for your exact range.</p>
    </> : <dl className="research-facts">
      {family.scenarios.map((scenario) => <div key={scenario.id}><dt>{scenario.label}</dt><dd>{scenario.detail}</dd></div>)}
    </dl>}
  </ResearchTile>;
}

export function ResearchRangeNotice({ thesisId, range }: { thesisId: string; range: ResearchRange }) {
  return <Card>
    <h1 className="font-serif text-2xl font-bold">This range is saved for research</h1>
    <p className="mt-2 text-sm">YES · {researchRangeLabel(range)}</p>
    <p className="mt-2 text-sm th-muted">Quoting this payoff requires a verified settlement source for the exact range.</p>
    <Button className="mt-4" href={`/theses/${thesisId}`} icon="arrow-left">Return to Research</Button>
  </Card>;
}

export function ResearchSavedTile({ usedColumns, sources, replies, onSelectSource, onRemoveReply }: {
  usedColumns: number;
  sources: EvidenceItem[];
  replies: (ResearchReply & { id: string })[];
  onSelectSource: (item: EvidenceItem) => void;
  onRemoveReply: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const count = sources.length + replies.length;
  const style = { "--saved-span": 3 - usedColumns % 3, "--saved-span-tablet": 2 - usedColumns % 2 } as CSSProperties;
  return <ResearchTile title="Saved research" icon="bookmark" kind="saved" style={style} detail={count > 0 ? <span className="status-pill">{count}</span> : null}>
    {count === 0 ? <p className="research-tile__muted">Save a source or an assistant reply to keep it here.</p> : null}
    {sources.length ? <ResearchEvidenceList items={sources} onSelect={onSelectSource} /> : null}
    {replies.length ? <ul className={`research-list ${sources.length ? "mt-2" : ""}`}>
      {replies.map((reply) => <li key={reply.id}>
        <details className="research-drawer__block">
          <summary className="cursor-pointer break-words text-sm font-semibold">{reply.question}</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{reply.answer}</p>
          <Button kind="ghost" icon="trash" onClick={() => {
            setError("");
            try { onRemoveReply(reply.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove reply."); }
          }}>Remove saved reply</Button>
        </details>
      </li>)}
    </ul> : null}
    {error ? <p className="mt-2 text-sm text-bad" role="alert">{error}</p> : null}
  </ResearchTile>;
}

export function ResearchEvidenceDrawer({ item, onClose, onAsk, onSave, saved, saveLabel = "Save to thesis", saving, saveError }: {
  item: EvidenceItem | null;
  onClose: () => void;
  onAsk: (item: EvidenceItem) => void;
  onSave?: (item: EvidenceItem) => void;
  saved?: boolean;
  saveLabel?: string;
  saving?: boolean;
  saveError?: string;
}) {
  const titleId = useId();
  return <AppDrawer open={Boolean(item)} titleId={titleId} onClose={onClose}>
    {item ? <div className="space-y-4">
      <header className="research-drawer__header"><div><p className="source-pill">Evidence detail</p><h2 id={titleId}>{item.title}</h2></div><button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Close evidence detail" onClick={onClose}><Icon name="close" /></button></header>
      <p className="text-xs th-muted">{item.publisher} · retrieved {formatTime(item.retrievedAt)}</p>
      <div className="research-drawer__block"><h3>Source claim</h3><p className="mt-2 whitespace-pre-wrap text-sm">{item.excerpt}</p></div>
      <div className="research-drawer__block research-drawer__block--context"><h3>Relationship to the view</h3><p className="mt-2 text-sm">{item.mode === "live" && item.publisher.startsWith("Gemini") ? "Use this market source to verify the proposition or settlement method." : item.stance === "supports" ? "Potentially supports the current view." : item.stance === "challenges" ? "Challenges an assumption in the current view." : "Adds context to the market question."}</p></div>
      <div className="flex flex-wrap gap-2">
        <a className="th-button th-button--secondary" href={item.url} target="_blank" rel="noreferrer"><Icon name="external-link" size={17} /> Open original</a>
        {onSave ? <Button kind="secondary" icon="bookmark" disabled={saving} onClick={() => onSave(item)}>{saving ? "Saving…" : saved ? "Remove saved source" : saveLabel}</Button> : null}
        <Button icon="assistant" onClick={() => onAsk(item)}>Ask about this</Button>
      </div>
      {saveError ? <p className="text-sm text-bad" role="alert">{saveError}</p> : null}
    </div> : null}
  </AppDrawer>;
}
