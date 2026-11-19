"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { erc20Abi } from "@/lib/escrow/abi";
import { publicEscrow, publicUsdc, arcTestnet } from "@/lib/chain";
import { formatUsdc } from "@/lib/format";
import { Button, Card } from "@/components/ui";

export default function WalletPage() {
  const { address } = useAccount();
  const native = useBalance({ address, chainId: arcTestnet.id });
  const token = useReadContract({
    address: publicUsdc(),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });
  const allowance = useReadContract({
    address: publicUsdc(),
    abi: erc20Abi,
    functionName: "allowance",
    args: address && publicEscrow() ? [address, publicEscrow() as `0x${string}`] : undefined,
  });
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Wallet</h1>
      <Card>
        <p className="text-sm">Arc testnet balances. Native gas is USDC. Token line is the configured ERC-20 used by the escrow.</p>
        <ul className="mt-3 text-sm">
          <li>Address: {address || "not connected"}</li>
          <li>Native: {native.data ? native.data.formatted : "—"} {native.data?.symbol}</li>
          <li>Token: {typeof token.data === "bigint" ? `${formatUsdc(token.data)} USDC` : "—"}</li>
          <li>Escrow allowance: {typeof allowance.data === "bigint" ? formatUsdc(allowance.data) : "—"}</li>
        </ul>
      </Card>
      <Card><p className="text-sm text-muted">Balances are informational. Thesis does not initiate wallet transfers from this page. A wallet is not needed for research or saved theses.</p><Button href="/portfolio?view=activity" kind="ghost">Open Portfolio activity</Button></Card>
    </div>
  );
}
