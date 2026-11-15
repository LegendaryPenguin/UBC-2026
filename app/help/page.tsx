import Link from "next/link";
import { Card } from "@/components/ui";

const ARTICLES = [
  ["quotes", "What a quote is"],
  ["families", "Compatible market families"],
  ["payout", "Payout vs profit"],
  ["voids", "Voids and refunds"],
  ["exits", "Exits and liquidity"],
  ["gas", "Arc gas and USDC"],
];

export default function Help() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Help</h1>
      {ARTICLES.map(([id, title]) => (
        <Card key={id}><Link href={`/help/${id}`}>{title}</Link></Card>
      ))}
    </div>
  );
}
