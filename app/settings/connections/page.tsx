import { Banner, Card } from "@/components/ui";

export default function Connections() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Connections</h1>
      <Banner title="Gemini trading">Connect is blocked until qualification. Disconnecting would not cancel open venue orders.</Banner>
      <Card>
        <p className="text-sm">Wallet unlink cannot erase chain history. Approvals are managed from Wallet.</p>
      </Card>
    </div>
  );
}
