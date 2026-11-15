import { Button, Card } from "@/components/ui";

export default function Landing() {
  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="text-sm uppercase tracking-wide text-muted">Prediction research workspace</p>
        <h1 className="mt-2 font-serif text-4xl">Understand the view. Inspect the payoff. Then pay for that exposure.</h1>
        <p className="mt-4 text-muted">
          Thesis turns a researched opinion into an explicit, fully collateralized payoff on Arc, using Gemini markets as the reference catalog.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/explore">Start research</Button>
          <Button href="/home" kind="ghost">Resume</Button>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-serif text-xl">1. Read the rules</h2>
          <p className="mt-2 text-sm text-muted">Observation time, source, and listed thresholds before any chart.</p>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">2. Confirm a view</h2>
          <p className="mt-2 text-sm text-muted">A range is not a YES ticket. The mismatch is drawn, not implied.</p>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">3. Accept a funded quote</h2>
          <p className="mt-2 text-sm text-muted">No fabricated depth. If the maker cannot lock collateral, there is no trade.</p>
        </Card>
      </div>
    </div>
  );
}
