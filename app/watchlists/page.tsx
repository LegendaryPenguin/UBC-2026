"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, inputCls } from "@/components/ui";

export default function Watchlists() {
  const [lists, setLists] = useState<{ id: string; name: string; slugs: string[] }[]>([]);
  const [name, setName] = useState("Core");
  useEffect(() => {
    api<{ watchlists: typeof lists }>("/api/watchlists").then((r) => setLists(r.watchlists || []));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Watchlists</h1>
      <div className="flex gap-2">
        <input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            const res = await api<{ watchlist: { id: string; name: string; slugs: string[] } }>("/api/watchlists", {
              method: "POST",
              body: JSON.stringify({ name }),
            });
            setLists((s) => [res.watchlist, ...s]);
          }}
        >
          Create
        </Button>
      </div>
      {lists.map((l) => (
        <Card key={l.id}>
          <a href={`/watchlists/${l.id}`}>{l.name}</a>
          <p className="text-sm text-muted">{l.slugs.length} topics</p>
        </Card>
      ))}
    </div>
  );
}
