"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/thesis";
import { api, setDataContext } from "@/lib/client";
import { parseCapturedArticle, type ArticleResearch, type ArticleMarketMatch, type CapturedArticle } from "@/lib/article-research";

function marketPrice(value: string | null | undefined) {
  if (value == null || value.trim() === "") return "Unavailable";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? `${(parsed * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}¢` : "Unavailable";
}

function settlementTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Settlement time not supplied";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function marketRelevance(article: CapturedArticle, market: ArticleMarketMatch) {
  const articleHorizon = /\b(?:5[- ]year|five[- ]year|long[- ]term|2031)\b/i.test(`${article.title} ${article.text}`);
  const observation = market.observationTime ? Date.parse(market.observationTime) : NaN;
  const withinYear = Number.isFinite(observation) && observation - Date.now() < 366 * 24 * 60 * 60 * 1000;
  return articleHorizon && withinYear
    ? "Same Bitcoin subject, with a nearer listed settlement than the article’s five-year outlook."
    : "Same underlying asset. Check this contract’s settlement time against the question you want to explore.";
}

export default function ArticleResearchPage() {
  const router = useRouter();
  const [article, setArticle] = useState<CapturedArticle | null>(null);
  const [captureError, setCaptureError] = useState("");
  const [research, setResearch] = useState<ArticleResearch | null>(null);
  const [researchError, setResearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState("");
  const [openError, setOpenError] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const { hash, pathname, search } = window.location;
    if (!hash.startsWith("#article=")) {
      setCaptureError("Open a web article in Chrome, then choose Open research in Thesis from the extension.");
      return;
    }
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    try {
      if (hash.length > 95_000) throw new Error("The captured article is too long.");
      const capture = parseCapturedArticle(JSON.parse(decodeURIComponent(hash.slice(9))));
      if (capture) {
        setArticle(capture);
        return;
      }
    } catch {
      // Malformed captures use the same recovery path as incomplete ones.
    }
    setCaptureError("This capture could not be read. Reopen the article and try the extension again.");
  }, []);

  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();
    setResearch(null);
    setResearchError("");
    api<ArticleResearch>("/api/article-research", {
      method: "POST",
      body: JSON.stringify(article),
      signal: controller.signal,
    }).then(setResearch).catch((error: unknown) => {
      if (!controller.signal.aborted) setResearchError(error instanceof Error ? error.message : "Article research could not be loaded.");
    });
    return () => controller.abort();
  }, [article, retry]);

  async function openMarket(market: ArticleMarketMatch) {
    if (!article || opening) return;
    setOpening(market.slug);
    setOpenError("");
    try {
      const host = new URL(article.url).hostname.replace(/^www\./, "");
      const articleSource = {
        title: article.title.slice(0, 240),
        url: article.url,
        publisher: host,
        excerpt: article.text.slice(0, 240),
      };
      const title = /bitcoin/i.test(article.title) ? "Bitcoin: a measured rise" : article.title.slice(0, 100);
      const { thesis } = await api<{ thesis: { id: string } }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          title,
          topicSlug: market.slug,
          familyId: market.id,
          familyVersion: market.version,
          mode: "live",
          rationale: "Exploring this article’s Bitcoin outlook alongside the listed settlement.",
          articleSource,
        }),
      });
      setDataContext("live");
      router.push(`/theses/${thesis.id}`);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "The market could not be opened. Try again.");
      setOpening("");
    }
  }

  if (!article) return <section className="th-card mx-auto max-w-3xl">
    <h1>Article research</h1>
    {captureError ? <p role="alert">{captureError}</p> : <p role="status" className="th-muted">Opening article…</p>}
    {captureError ? <a href="/explore" className="th-button mt-4">Explore markets</a> : null}
  </section>;

  const host = new URL(article.url).hostname.replace(/^www\./, "");
  const longArticle = /\b(?:5[- ]year|five[- ]year|long[- ]term|2031)\b/i.test(`${article.title} ${article.text}`);

  return <main className="demo-article th-stack mx-auto">
    <header className="demo-article-header">
      <p className="th-label th-muted">From article to market</p>
      <h1>From an article to a question</h1><p className="th-muted">Your question, evidence, and position — together.</p>
      <a className="th-button mt-3" href={article.url} target="_blank" rel="noreferrer noopener">
        {host} <Icon name="external-link" /> <span className="sr-only">opens in a new tab</span>
      </a>
    </header>

    <div className="demo-article-columns"><div><section className="th-card demo-original-article"><p className="demo-eyebrow">{host} · Captured source</p><h2>{article.title}</h2><p className="th-muted">The article is a starting point for your own research.</p><a href={article.url} target="_blank" rel="noreferrer noopener">Open original article ↗</a></section>
      <section className="th-card" aria-labelledby="article-brief-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="source-pill">Article context</p><h2 id="article-brief-title" className="mt-2">What the article argues</h2></div>
          <span className="status-pill">{host}</span>
        </div>
        {research?.summary ? <p className="mt-4 whitespace-pre-line">{research.summary}</p> : null}
        {!research && !researchError ? <p role="status" className="mt-4 th-muted">Reading the article and checking Gemini’s live catalog…</p> : null}
        {researchError ? <div className="mt-4" role="alert"><p>{researchError}</p><button className="th-button mt-3" onClick={() => { setResearchError(""); setRetry((attempt) => attempt + 1); }}>Try again</button></div> : null}
        <details className="mt-4 rounded-xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Captured article text</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm th-muted">{article.text}</p>
        </details>
      </section>

      </div><section className="th-card" aria-labelledby="gemini-match-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="source-pill">Live Gemini catalog</p><h2 id="gemini-match-title" className="mt-2">Markets related to this article</h2></div>
          <span className="text-xs th-muted">Prices are references, not certainty.</span>
        </div>
        {longArticle ? <p className="mt-3 rounded-lg border border-line bg-[#F7F8FF] p-3 text-sm">This article looks five years ahead. The listed Gemini contracts below settle sooner, so their horizon is shown separately.</p> : null}
        {research?.markets.length ? <div className="mt-4 grid gap-3">
          {research.markets.map((market) => <article key={market.slug} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Bitcoin · Gemini market</p><h3 className="mt-1 font-serif text-xl font-bold">{market.title}</h3></div>
              <span className="status-pill">{market.freshness === "fresh" ? "Live quote" : "Quote status: " + market.freshness}</span>
            </div>
            <p className="mt-2 text-sm">{market.question}</p>
            <p className="mt-2 text-sm th-muted">Settles {settlementTime(market.observationTime)}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {market.contracts.map((contract) => <div key={contract.id} className="rounded-lg bg-[#F4F6FF] p-3">
                <p className="text-sm font-semibold">{contract.label}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <p>YES ask <strong className="ml-1">{marketPrice(contract.ask)}</strong></p>
                  <p>NO ask <strong className="ml-1">{marketPrice(contract.noAsk)}</strong></p>
                </div>
              </div>)}
            </div>
            <p className="mt-3 border-t border-line pt-3 text-sm th-muted">{marketRelevance(article, market)}</p>
            <button type="button" className="th-button th-button--primary mt-3 w-full" disabled={Boolean(opening)} onClick={() => void openMarket(market)}>
              {opening === market.slug ? "Opening research…" : "Open this market in Research"} <Icon name="arrow-right" />
            </button>
          </article>)}
        </div> : null}
        {research && !research.markets.length ? <div className="mt-4 rounded-xl border border-line bg-[#F7F8FF] p-4">
          <p>{research.marketUnavailable ? "Gemini’s live catalog could not be reached just now." : "No closely related live Gemini market was found for this article."}</p>
          <a href="/explore" className="th-button mt-3">Search Explore</a>
        </div> : null}
        {openError ? <p role="alert" className="mt-3 text-sm text-bad">{openError}</p> : null}
      </section>
    </div>
  </main>;
}
