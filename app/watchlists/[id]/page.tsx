"use client";

import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export default function WatchlistDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Watchlist</h1>
      <Card>
        <p className="text-sm">Deleting a list never sells positions. Removing a topic asks whether list-specific alerts should remain.</p>
        <div className="mt-3 flex gap-2">
          <Button href="/explore">Add topic</Button>
          <Button
            kind="danger"
            onClick={async () => {
              if (!confirm("Delete this list metadata?")) return;
              await api(`/api/watchlists/${id}`, { method: "PATCH", body: JSON.stringify({ action: "delete" }) });
              window.location.href = "/watchlists";
            }}
          >
            Delete list
          </Button>
        </div>
      </Card>
    </div>
  );
}
