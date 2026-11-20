"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/thesis";
import { flattenEvents, geminiBinaryTopicSlug, type GeminiContract, type GeminiEvent } from "@/lib/gemini/types";

const groups = ["Winner", "Spread", "Total", "Props", "Other", "Contracts"] as const;
type Group = typeof groups[number];
export type MarketSelection = { event: GeminiEvent; contract?: GeminiContract };
export type ExploreMarket = {
  id: string;
  title: string;
  event: GeminiEvent;
  teams?: { code: string; name: string }[];
  league?: string;
  sections: { name: Group; selections: MarketSelection[] }[];
  contractCount: number;
  closesAt: number;
};

const leagues: Record<string, string> = {
  NCAAF: "College football", NCAAB: "College basketball", NBA: "NBA", WNBA: "WNBA", NFL: "NFL", NHL: "NHL", MLB: "MLB",
};

function matchup(event: GeminiEvent) {
  if (event.category?.toLowerCase() !== "sports") return;
  const ticker = event.ticker.match(/^([a-z][a-z0-9]*)-(\d{10,12})-([a-z0-9]+)-([a-z0-9]+)(?:-[a-z0-9]+)*$/i);
  const title = event.title.split(":")[0].trim();
  const teams = title.split(/\s+(?:vs\.?|versus|at)\s+/i);
  if (!ticker || teams.length !== 2) return;
  const [, league, date, first, second] = ticker;
  return {
    id: `${league}-${date}-${first}-${second}`.toUpperCase(),
    title,
    league: leagues[league.toUpperCase()] || league.toUpperCase(),
    teams: [{ code: first.toUpperCase(), name: teams[0] }, { code: second.toUpperCase(), name: teams[1] }],
  };
}

function sectionName(event: GeminiEvent): Group {
  const kind = event.title.split(":").slice(1).join(" ");
  const text = `${event.template || ""} ${kind}`;
  if (/player|props/i.test(text)) return "Props";
  if (/spread|handicap|puck line|run line/i.test(text)) return "Spread";
  if (/total|over.under/i.test(text)) return "Total";
  if (/moneyline|winner|match.winner/i.test(text) || !kind) return "Winner";
  return "Other";
}

function closeTime(event: GeminiEvent, contract?: GeminiContract) {
  const value = contract?.expiryDate || event.expiryDate;
  return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).getTime() : Infinity;
}

export function exploreMarkets(events: GeminiEvent[], now: number): ExploreMarket[] {
  const cards = new Map<string, ExploreMarket>();
  for (const event of flattenEvents(events)) {
    if (event.events?.length && !event.contracts?.length) continue;
    const game = matchup(event);
    const id = game?.id || event.id || event.ticker;
    const name = game ? sectionName(event) : "Contracts";
    const card = cards.get(id) || { id, title: game?.title || event.title, event, teams: game?.teams, league: game?.league, sections: [], contractCount: 0, closesAt: Infinity };
    const selections: MarketSelection[] = event.contracts?.length
      ? event.contracts.map((contract) => ({ event, contract }))
      : [{ event }];
    const section = card.sections.find((item) => item.name === name);
    if (section) section.selections.push(...selections);
    else card.sections.push({ name, selections });
    card.contractCount += event.contracts?.length || 0;
    for (const item of selections) {
      const expiry = closeTime(item.event, item.contract);
      if (expiry >= now) card.closesAt = Math.min(card.closesAt, expiry);
    }
    cards.set(id, card);
  }
  return [...cards.values()].map((card) => {
    card.sections.sort((a, b) => groups.indexOf(a.name) - groups.indexOf(b.name));
    for (const section of card.sections) {
      const segment = ({ event }: MarketSelection) => /\b(?:half|quarter|period|inning)\b/i.test(event.title.split(":").slice(1).join(" "));
      section.selections.sort((a, b) => Number(segment(a)) - Number(segment(b)));
    }
    return card;
  });
}

export function marketDetailHref({ event, contract }: MarketSelection, mode: "live" | "replay") {
  const params = new URLSearchParams({ mode });
  if (contract?.instrumentSymbol) params.set("symbol", contract.instrumentSymbol);
  return `/gemini/${encodeURIComponent(event.ticker)}?${params}`;
}

export function selectionTopic({ event, contract }: MarketSelection, mode: "live" | "replay") {
  if (mode !== "live" || !contract?.instrumentSymbol || event.status !== "active" || contract.status !== "active" || contract.marketState === "closed") return;
  return geminiBinaryTopicSlug(event.ticker, contract.id);
}

function whenLabel({ event, contract }: MarketSelection, now: number) {
  const expiry = closeTime(event, contract);
  const resolved = event.status === "settled" ? new Date(contract?.resolvedAt || event.resolvedAt || "").getTime() : NaN;
  const date = Number.isFinite(resolved) ? resolved : expiry;
  if (!Number.isFinite(date)) return { label: "Close time unavailable" };
  const textDate = new Date(date);
  const full = textDate.toLocaleString();
  const short = textDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const difference = date - now;
  if (event.status === "settled") return { label: `Settled ${short}`, full, date };
  if (event.status === "closed") return { label: `Closed ${short}`, full, date };
  if (difference < 0) return { label: `Scheduled close ${short}`, full, date };
  const minute = 60_000;
  if (difference < minute) return { label: "Closes in less than a minute", full, date };
  const [unitMs, unit] = difference >= 86_400_000 ? [86_400_000, "day"] : difference >= 3_600_000 ? [3_600_000, "hour"] : [minute, "minute"];
  const count = Math.ceil(difference / Number(unitMs));
  return { label: `Closes in ${count} ${unit}${count === 1 ? "" : "s"}`, full, date };
}

function askLabel(value: string | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return null;
  return `${(number * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}¢`;
}

const palette = ["#2544a5", "#087650", "#a5224f", "#7b3aa2", "#b45318", "#086e83", "#384a66"];
const categoryIcon: Record<string, IconName> = { sports: "trophy", crypto: "coins", economics: "chart", politics: "ballot", culture: "news", technology: "network" };
const cryptoIcons = [
  { code: "btc", icon: "bitcoin", title: /\b(?:bitcoin|btc)\b/i },
  { code: "eth", icon: "ethereum", title: /\b(?:ethereum|ether|eth)\b/i },
  { code: "sol", icon: "solana", title: /\b(?:solana|sol)\b/i },
  { code: "xrp", icon: "xrp", title: /\bxrp\b/i },
] as const;
const prompts: Record<Group, string> = { Winner: "Who will win?", Spread: "Point spread", Total: "Combined score", Props: "Player outcomes", Other: "Available outcomes", Contracts: "Available outcomes" };

function marketMark(event: GeminiEvent, category: string): { icon: IconName; asset?: string } {
  if (category === "crypto") {
    const ticker = event.ticker.match(/^[a-z]+/i)?.[0].toLowerCase();
    const asset = cryptoIcons.find(({ code }) => ticker === code)
      ?? cryptoIcons.find(({ title }) => title.test(event.title));
    if (asset) return { icon: asset.icon, asset: asset.code };
  }
  if (category === "economics") {
    if (/\b(?:federal reserve|fed|fomc|central bank|rate (?:cut|hike|decision)|interest rates?)\b/i.test(event.title)) return { icon: "bank" };
    if (/\b(?:cpi|inflation|gdp|jobs|payrolls|unemployment)\b/i.test(event.title)) return { icon: "bars" };
  }
  if (category === "politics" && /\b(?:bill|court|law|tariff|legislation)\b/i.test(event.title)) return { icon: "rules" };
  return { icon: categoryIcon[category] || "explore" };
}

function markColor(code: string, offset = 0) {
  const index = [...code].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % palette.length, 0);
  return palette[(index + offset) % palette.length];
}

function selectionKey({ event, contract }: MarketSelection) {
  return `${event.ticker}:${contract?.id || ""}`;
}

export function ExploreMarketCard({ card, mode, now, watchedSlugs, watchBusy, onWatch, onResearch, onAttach, researchBusy }: {
  card: ExploreMarket;
  mode: "live" | "replay";
  now: number;
  watchedSlugs?: Set<string>;
  watchBusy?: boolean;
  onWatch?: (slug: string, title: string) => void;
  onResearch: (selection: MarketSelection) => void;
  onAttach: (selection: MarketSelection) => void;
  researchBusy: boolean;
}) {
  const panelId = useId();
  const [group, setGroup] = useState<Group>();
  const [picked, setPicked] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const section = card.sections.find((item) => item.name === group) || card.sections[0];
  const selection = section.selections.find((item) => selectionKey(item) === picked) || section.selections[0];
  const date = whenLabel(selection, now);
  const slug = selectionTopic(selection, mode);
  const watched = Boolean(slug && watchedSlugs?.has(slug));
  const category = card.event.category || "Market";
  const categoryKey = category.toLowerCase();
  const mark = marketMark(card.event, categoryKey);
  const preview = section.selections.slice(0, 2);
  if (preview.length === 2 && !preview.includes(selection)) preview[1] = selection;
  const display = expanded ? section.selections : preview;
  const hasVariants = card.teams && section.selections.some(({ event }) => event.ticker !== section.selections[0].event.ticker);
  const settled = section.selections.every(({ event, contract }) => event.status === "settled" || contract?.status === "settled");
  const status = selection.event.status.replaceAll("_", " ");
  const link = marketDetailHref(selection, mode);

  return (
    <Card className={card.teams ? "explore-market-card explore-market-card--matchup" : "explore-market-card"}>
      <div className="explore-market-card__icons">
        <div className="explore-market-card__marks" aria-hidden="true">
          {card.teams ? card.teams.map((team, index) => <span key={team.code} className="explore-market-card__team" title={team.name} style={{ backgroundColor: markColor(team.code, index && markColor(team.code) === markColor(card.teams![0].code) ? 1 : 0) }}>{team.code}</span>) : (
            <span className="explore-market-card__category" data-category={categoryKey} data-asset={mark.asset}><Icon name={mark.icon} size={24} /></span>
          )}
        </div>
        <div className="explore-market-card__status">
          {status !== "active" ? <span className="source-pill capitalize">{status}</span> : null}
          {slug && onWatch ? <button type="button" className="explore-market-card__bookmark" title={watched ? "Remove from Watching" : "Save to Watching"} aria-pressed={watched} aria-label={`${watched ? "Remove saved" : "Watch"} ${selection.contract ? `${card.title} · ${selection.contract.label}` : card.title}`} disabled={watchBusy} onClick={() => onWatch(slug, selection.contract ? `${card.title} · ${selection.contract.label}` : card.title)}>
            <Icon name={watched ? "check" : "bookmark"} size={21} />
          </button> : null}
        </div>
      </div>
      <div>
        <p className="explore-market-card__eyebrow">{card.league || category}</p>
        <h3 className="explore-market-card__title"><Link href={link}>{card.title}</Link></h3>
        <div className="explore-market-card__date" title={date.full}>
          <Icon name="clock" size={17} />
          {date.date !== undefined ? <time dateTime={new Date(date.date).toISOString()}>{date.label}</time> : date.label}
        </div>
      </div>

      {card.teams ? (
        <div className="explore-market-card__types" role="group" aria-label={`Market types for ${card.title}`}>
          {card.sections.map(({ name }) => <button key={name} type="button" aria-pressed={section.name === name} onClick={() => { setGroup(name); setPicked(undefined); setExpanded(false); }}>{name}</button>)}
        </div>
      ) : null}

      <div className="explore-market-card__body" data-settled={settled}>
        <div className="explore-market-card__outcome-head">
          <strong>{prompts[section.name]}</strong>
          {settled ? <span>Resolved</span> : <><span title="Gemini YES reference ask">Yes ask</span><span title="Gemini NO reference ask">No ask</span></>}
        </div>
        <ul id={panelId} className="explore-market-card__outcomes" data-expanded={expanded}>
          {display.map((item) => {
            const key = selectionKey(item);
            const label = item.contract?.label || item.event.title;
            const variant = hasVariants
              ? item.event.title.split(":").slice(1).join(":").trim() : "";
            const prices = item.contract?.prices;
            const resolved = item.event.status === "settled" || item.contract?.status === "settled";
            const outcome = item.contract?.resolutionSide?.toUpperCase();
            const resolution = outcome === "YES" || outcome === "NO" ? outcome : null;
            return <li key={key}>
              <button type="button" className="explore-market-card__outcome" aria-pressed={selectionKey(selection) === key} onClick={() => setPicked(key)}>
                <span>{label}{variant && !label.toLowerCase().includes(variant.toLowerCase()) ? <small>{variant}</small> : null}</span>
                {resolved ? (
                  <strong className={`explore-market-card__resolution${resolution ? "" : " explore-market-card__unpriced"}`}>
                    {resolution ? <><span className="sr-only">Resolved </span>{resolution}</> : <><span className="sr-only">Resolution unavailable</span><span aria-hidden="true">—</span></>}
                  </strong>
                ) : ([
                  ["Yes", askLabel(prices?.buy?.yes) ?? askLabel(prices?.bestAsk)],
                  ["No", askLabel(prices?.buy?.no)],
                ] as const).map(([side, value]) => (
                  <strong key={side} className={!value ? "explore-market-card__unpriced" : undefined} title={!value ? `${side} ask unavailable` : undefined}>
                    <span className="sr-only">{side} ask{value ? " " : " unavailable"}</span>
                    {value ?? <span aria-hidden="true">—</span>}
                  </strong>
                ))}
              </button>
            </li>;
          })}
        </ul>
        <div className="explore-market-card__summary">
          <span>{card.contractCount ? `${card.contractCount} contract${card.contractCount === 1 ? "" : "s"}` : "Contracts unavailable"}</span>
          {section.selections.length > 2 ? <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer" : `View all ${section.selections.length}`} <Icon name={expanded ? "chevron-up" : "chevron-down"} size={15} />
          </button> : null}
        </div>
      </div>

      <footer className="explore-market-card__actions">
        <button type="button" className="explore-market-card__research" disabled={researchBusy} onClick={() => onResearch(selection)}>
          {researchBusy ? "Opening…" : "Research market"} <Icon name="external-link" size={16} />
        </button>
        <button type="button" className="explore-market-card__attach" onClick={() => onAttach(selection)}>
          <Icon name="plus" size={16} /> Add to thesis
        </button>
      </footer>
    </Card>
  );
}
