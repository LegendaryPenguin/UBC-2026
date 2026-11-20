// Chrome runs this serialized function in the active tab. Keep its dependencies local.
export function extractArticle() {
  const selection = window.getSelection()?.toString().trim();
  const root = document.querySelector(".mw-parser-output, [data-testid='article-body'], [data-testid='article-content'], [data-test-locator='article-content']")
    || document.querySelector("main article, article, main [role='main'], main, [role='main']");
  const ignored = "nav, aside, footer, header, table, figure, [hidden], [aria-hidden='true'], [data-testid*='ad-'], [data-testid*='inarticle-ad'], [data-testid*='sponsor'], [data-testid*='related'], .hatnote, .mw-editsection, .infobox, .navbox, .reflist";
  const clean = (text) => text.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  const paragraphs = [];
  let length = 0;

  for (const element of root?.querySelectorAll("h2, p") || []) {
    if (element.closest(ignored) || !element.getClientRects().length) continue;
    const text = clean(element.innerText);
    if (/\(\s*sponsor(?:ed)?\s*\)|\bpromotional offer\b/i.test(text)) continue;
    if (element.tagName === "H2" && /^(references|notes|see also|external links|further reading|bibliography)\b/i.test(text)) break;
    if (element.tagName !== "P" || text.length < 40) continue;
    paragraphs.push(text);
    length += text.length;
    if (length >= 6500) break;
  }

  const title = document.querySelector("#firstHeading, h1[data-testid='headline'], main h1, article h1")?.innerText || document.title;
  let url = new URL(location.href);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const candidate = URL.parse(canonical.href);
    if (candidate?.origin === url.origin) url = candidate;
  }
  url.hash = "";
  url.username = "";
  url.password = "";

  return {
    title: clean(title).slice(0, 240),
    url: url.href,
    text: selection ? clean(selection).slice(0, 6500) : paragraphs.join("\n\n").slice(0, 6500).trim(),
  };
}
