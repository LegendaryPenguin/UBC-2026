"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatTime } from "@/lib/format";
import { Card } from "@/components/ui";

export default function CalendarPage() {
  const [events, setEvents] = useState<{ id: string; title: string; at: string; href: string; kind: string }[]>([]);
  useEffect(() => {
    api<{ events: typeof events }>("/api/calendar").then((r) => setEvents(r.events || []));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Calendar</h1>
      <p className="text-sm text-muted">Cutoff, observation, and longstop are different event types.</p>
      {events.map((e) => (
        <Card key={e.id}>
          <p className="text-xs uppercase text-muted">{e.kind}</p>
          <Link href={e.href}>{e.title}</Link>
          <p className="text-sm text-muted">{formatTime(e.at)}</p>
        </Card>
      ))}
    </div>
  );
}
