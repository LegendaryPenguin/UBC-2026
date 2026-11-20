export type CapturedArticle = { title: string; url: string; text: string };

export type ArticleResearchSource = {
  publisher: string;
  title: string;
  detail: string;
  url: string;
};

export type ArticleResearch = {
  summary: string;
  provider: "grok" | "extract";
  sources: ArticleResearchSource[];
};

export function parseCapturedArticle(value: unknown): CapturedArticle | null {
  if (!value || typeof value !== "object") return null;
  const { title, url, text } = value as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim() || title.length > 240
    || typeof url !== "string" || url.length > 2000
    || typeof text !== "string" || text.trim().length < 40 || text.length > 6500) return null;

  try {
    const source = new URL(url);
    if (!/^https?:$/.test(source.protocol) || source.username || source.password) return null;
    source.hash = "";
    return { title: title.trim(), url: source.href, text: text.trim() };
  } catch {
    return null;
  }
}
