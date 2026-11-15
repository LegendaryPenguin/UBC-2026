import { Banner, Card } from "@/components/ui";

export default function Orders() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Native Gemini orders</h1>
      <Banner title="Trading unavailable">
        Native exchange orders stay gated until account eligibility, API scopes, and venue behavior are qualified. Market data on Explore still loads.
      </Banner>
      <Card>
        <p className="text-sm">Open / partial / completed / canceled tabs would appear here. Retrying a rejected order creates a fresh review, never a stale resubmit.</p>
      </Card>
    </div>
  );
}
