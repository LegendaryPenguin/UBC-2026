"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/thesis";
import { parseCapturedArticle, type ArticleResearch, type CapturedArticle } from "@/lib/article-research";
import { api } from "@/lib/client";

export default function ArticleResearchPage() {
  const [article, setArticle] = useState<CapturedArticle | null>(null);
  const [captureError, setCaptureError] = useState("");
  const [research, setResearch] = useState<ArticleResearch | null>(null);
  const [researchError, setResearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const { hash, pathname, search } = window.location;
    if (!hash.startsWith("#article=")) {
      setCaptureError("Open the Chrome extension on an article and choose Open research in Thesis.");
      return;
    }

    // The fragment keeps the article out of the navigation request. Clear it after the handoff.
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    try {
      const capture = hash.length <= 95_000 && parseCapturedArticle(JSON.parse(decodeURIComponent(hash.slice(9))));
      if (capture) {
        setArticle(capture);
        return;
      }
    } catch {
      // Show the same recovery path for malformed and incomplete captures.
    }
    setCaptureError("This capture could not be read. Reopen the article and try the Chrome extension again.");
  }, []);

  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();
    api<ArticleResearch>("/api/article-research", {
      method: "POST",
      body: JSON.stringify(article),
      signal: controller.signal,
    }).then(setResearch).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setResearchError(error instanceof Error ? error.message : "Research could not be loaded.");
      }
    });
    return () => controller.abort();
  }, [article, retry]);

  if (!article) {
    return (
      <section className="th-card mx-auto max-w-3xl">
        <h1>Article research</h1>
        {captureError ? <p>{captureError}</p> : <p role="status" className="th-muted">Opening article…</p>}
        {captureError && <Link href="/explore" className="th-button">Explore markets</Link>}
      </section>
    );
  }

  return (
    <div className="th-stack mx-auto max-w-4xl">
      <header className="th-card th-card--hero">
        <p className="th-label th-muted">Article research</p>
        <h1 className="break-words">{article.title}</h1>
        <a className="th-button" href={article.url} target="_blank" rel="noreferrer">
          {new URL(article.url).hostname} <Icon name="external-link" />
        </a>
      </header>

      <section className="th-card" aria-labelledby="article-summary">
        <h2 id="article-summary">{research?.provider === "grok" ? "Research brief" : "Article highlights"}</h2>
        {research && <p className="whitespace-pre-line break-words">{research.summary}</p>}
        {!research && !researchError && <p role="status" className="th-muted">Reading the captured text…</p>}
        {researchError && <>
          <p role="alert">{researchError}</p>
          <button className="th-button" onClick={() => { setResearchError(""); setRetry((attempt) => attempt + 1); }}>Try again</button>
        </>}
      </section>

      {!!research?.sources.length && (
        <section className="th-stack" aria-labelledby="related-research">
          <h2 id="related-research" className="!mb-0">Related research</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {research.sources.map((source) => (
              <a key={source.url} className="th-card th-card--interactive block no-underline" href={source.url} target="_blank" rel="noreferrer">
                <p className="th-label th-muted">{source.publisher}</p>
                <h3>{source.title} <Icon name="external-link" /></h3>
                <p className="th-muted !mb-0">{source.detail}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      <details className="th-card th-card--soft">
        <summary className="cursor-pointer font-bold">Captured article text</summary>
        <p className="!mb-0 !mt-4 whitespace-pre-wrap break-words">{article.text}</p>
      </details>
    </div>
  );
}
