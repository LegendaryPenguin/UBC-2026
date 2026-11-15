import { listTopics } from "@/lib/gemini/catalog";
import { ok } from "@/lib/server/http";

export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "replay";
  const { families } = await listTopics(mode);
  const events = families.flatMap((f) => {
    const items = [];
    if (f.closeTime) items.push({ id: `${f.slug}-close`, title: `Trading cutoff · ${f.title}`, at: f.closeTime, href: `/topics/${f.slug}`, kind: "cutoff" });
    if (f.observationTime) items.push({ id: `${f.slug}-obs`, title: `Observation · ${f.title}`, at: f.observationTime, href: `/topics/${f.slug}`, kind: "observation" });
    if (f.longstopTime) items.push({ id: `${f.slug}-long`, title: `Longstop · ${f.title}`, at: f.longstopTime, href: `/topics/${f.slug}`, kind: "longstop" });
    return items;
  });
  return ok({ events });
}
