"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, inputCls } from "@/components/ui";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ topics: { slug: string; title: string }[]; theses: { id: string; topicSlug: string }[] } | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Search</h1>
      <div className="flex gap-2">
        <input className={inputCls()} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topics, theses, help" />
        <Button onClick={async () => setData(await api(`/api/search?q=${encodeURIComponent(q)}`))}>Search</Button>
      </div>
      {data ? (
        <Card>
          <h2 className="font-medium">Topics</h2>
          {data.topics.map((t) => (
            <p key={t.slug}><Link href={`/topics/${t.slug}`}>{t.title}</Link></p>
          ))}
          <h2 className="mt-4 font-medium">My theses</h2>
          {data.theses.map((t) => (
            <p key={t.id}><Link href={`/theses/${t.id}`}>{t.topicSlug}</Link></p>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
