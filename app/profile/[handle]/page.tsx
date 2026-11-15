import { Card } from "@/components/ui";

export default function Profile({ params }: { params: { handle: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">@{params.handle}</h1>
      <Card>
        <p className="text-sm">Only opted-in snapshots appear here. Wallet P&L is not a public leaderboard.</p>
      </Card>
    </div>
  );
}
