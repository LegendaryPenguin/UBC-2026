import { Card } from "@/components/ui";

const COPY: Record<string, { title: string; body: string }> = {
  quotes: {
    title: "What a quote is",
    body: "A firm quote is a signed maker offer with a deadline, premium, fee, and finite payout table. Gemini bids are reference prices, not this offer. Expired quotes cannot be accepted.",
  },
  families: {
    title: "Compatible market families",
    body: "A family is a set of ordered thresholds on the same observable, time, and source. Titles that look similar are not enough. Incompatible combinations are rejected.",
  },
  payout: {
    title: "Payout vs profit",
    body: "Payout is the USDC the contract sends in a scenario. Profit is payout minus premium and fees. Maximum loss on a long custom payoff is the amount you pay now.",
  },
  voids: {
    title: "Voids and refunds",
    body: "If the source cannot resolve by the longstop, the position can be voided. The buyer receives the premium back. The maker receives locked collateral back.",
  },
  exits: {
    title: "Exits and liquidity",
    body: "Early exit needs a funded buyback. If no maker quotes, you keep the position until settlement. Exit anytime is not advertised.",
  },
  gas: {
    title: "Arc gas and USDC",
    body: "Arc uses USDC as native gas. The escrow still holds the configured ERC-20 collateral token. Those balances are shown separately in Wallet.",
  },
};

export default function Article({ params }: { params: { article: string } }) {
  const item = COPY[params.article] || { title: params.article, body: "This article explains a Thesis mechanic using the same rules as the app." };
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">{item.title}</h1>
      <Card><p className="text-sm leading-6">{item.body}</p></Card>
    </div>
  );
}
