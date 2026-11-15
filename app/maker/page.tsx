"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/client";
import { arcTestnet, publicEscrow, publicUsdc } from "@/lib/chain";
import { erc20Abi, escrowAbi } from "@/lib/escrow/abi";
import { formatUsdc, parseUsdc } from "@/lib/format";

type MakerState = {
  makerAddress: `0x${string}` | null;
  policy: { paused: boolean; spreadBps: number };
  counts: { openPositions: number; activeQuotes: number };
};

export default function Maker() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const escrow = publicEscrow();
  const [secret, setSecret] = useState("");
  const [spread, setSpread] = useState("400");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<MakerState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const headers = { "x-operator": secret };
  const makerAddress = state?.makerAddress || undefined;
  const free = useReadContract({
    address: escrow || undefined,
    abi: escrowAbi,
    functionName: "freeCollateral",
    args: makerAddress ? [makerAddress] : undefined,
    query: { enabled: Boolean(escrow && makerAddress) },
  });
  const reserved = useReadContract({
    address: escrow || undefined,
    abi: escrowAbi,
    functionName: "reservedCollateral",
    args: makerAddress ? [makerAddress] : undefined,
    query: { enabled: Boolean(escrow && makerAddress) },
  });
  const tokenBalance = useReadContract({
    address: publicUsdc(),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: makerAddress ? [makerAddress] : undefined,
    query: { enabled: Boolean(makerAddress) },
  });
  const allowance = useReadContract({
    address: publicUsdc(),
    abi: erc20Abi,
    functionName: "allowance",
    args: makerAddress && escrow ? [makerAddress, escrow] : undefined,
    query: { enabled: Boolean(makerAddress && escrow) },
  });

  async function load() {
    setWorking(true);
    setError("");
    try {
      const result = await api<MakerState>("/api/maker", { headers });
      setState(result);
      setSpread(String(result.policy.spreadBps));
    } catch (err) {
      setState(null);
      setError(err instanceof Error ? err.message : "Maker access could not be opened.");
    } finally {
      setWorking(false);
    }
  }

  async function updatePolicy(change: { spreadBps?: number; paused?: boolean }) {
    setWorking(true);
    setError("");
    try {
      await api("/api/maker", { method: "POST", headers, body: JSON.stringify(change) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Maker settings could not be saved.");
      setWorking(false);
    }
  }

  async function changeCollateral(action: "deposit" | "withdraw") {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      if (!makerAddress || !address || address.toLowerCase() !== makerAddress.toLowerCase()) {
        throw new Error("Connect the wallet that matches the configured maker signer.");
      }
      if (!escrow) throw new Error("The Arc escrow address is not configured.");
      if (chainId !== arcTestnet.id) {
        await switchChainAsync({ chainId: arcTestnet.id });
        throw new Error("Arc testnet is selected. Review the amount and submit again.");
      }
      if (!publicClient) throw new Error("Arc RPC is unavailable in the connected wallet configuration.");
      const units = parseUsdc(amount);
      if (units <= 0n) throw new Error("Enter a positive USDC amount.");
      let hash: `0x${string}`;
      if (action === "deposit") {
        const currentAllowance = await publicClient.readContract({ address: publicUsdc(), abi: erc20Abi, functionName: "allowance", args: [address, escrow] });
        if (currentAllowance < units) {
          const approvalHash = await writeContractAsync({ address: publicUsdc(), abi: erc20Abi, functionName: "approve", args: [escrow, units], chainId: arcTestnet.id });
          const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== "success") throw new Error("USDC approval reverted. No collateral deposit was sent.");
          const updatedAllowance = await publicClient.readContract({ address: publicUsdc(), abi: erc20Abi, functionName: "allowance", args: [address, escrow] });
          if (updatedAllowance < units) throw new Error("Arc did not confirm the requested USDC allowance. No deposit was sent.");
        }
        hash = await writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "deposit", args: [units], chainId: arcTestnet.id });
      } else {
        hash = await writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "withdraw", args: [units], chainId: arcTestnet.id });
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Arc reverted the ${action}.`);
      setMessage(`${action === "deposit" ? "Collateral deposited" : "Free collateral withdrawn"} · ${hash}`);
      await Promise.all([free.refetch(), reserved.refetch(), tokenBalance.refetch(), allowance.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Collateral ${action} failed.`);
    } finally {
      setWorking(false);
    }
  }

  const walletMatches = Boolean(address && makerAddress && address.toLowerCase() === makerAddress.toLowerCase());
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Maker console</h1>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Operator access is required. The secret stays in this page's memory and is sent only in the request header.</p>
        <Field label="Operator secret">
          <input className={inputCls()} type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} />
        </Field>
        <Button onClick={() => void load()} disabled={!secret || working}>{working ? "Loading…" : "Open maker console"}</Button>
      </Card>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {message ? <p role="status" className="break-all text-sm text-muted">{message}</p> : null}
      {state ? (
        <>
          <Card className="space-y-3">
            <p className="text-sm">Paused: {String(state.policy.paused)} · spread {state.policy.spreadBps} bps</p>
            <p className="text-xs text-muted">{state.counts.openPositions} open live positions · {state.counts.activeQuotes} active signed quotes. Pausing does not revoke quotes already issued.</p>
            {makerAddress ? <p className="break-all text-xs text-muted">Quote signer: {makerAddress}</p> : <p className="text-xs text-bad">MAKER_PRIVATE_KEY is not configured; live quotes are unavailable.</p>}
            <Field label="Spread bps">
              <input className={inputCls()} inputMode="numeric" value={spread} onChange={(event) => setSpread(event.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void updatePolicy({ spreadBps: Number(spread) })} disabled={working || !/^\d+$/.test(spread)}>Set spread</Button>
              <Button kind="secondary" onClick={() => void updatePolicy({ paused: true })} disabled={working}>Pause new quotes</Button>
              <Button kind="ghost" onClick={() => void updatePolicy({ paused: false })} disabled={working}>Resume quotes</Button>
            </div>
          </Card>
          {makerAddress ? (
            <Card className="space-y-3">
              <h2 className="font-serif text-xl">Onchain collateral</h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">Free collateral</dt><dd>{typeof free.data === "bigint" ? `${formatUsdc(free.data)} USDC` : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Reserved collateral</dt><dd>{typeof reserved.data === "bigint" ? `${formatUsdc(reserved.data)} USDC` : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Maker token balance</dt><dd>{typeof tokenBalance.data === "bigint" ? `${formatUsdc(tokenBalance.data)} USDC` : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Escrow allowance</dt><dd>{typeof allowance.data === "bigint" ? `${formatUsdc(allowance.data)} USDC` : "—"}</dd></div>
              </dl>
              <p className="text-xs text-muted">Collateral must be deposited by the configured maker signer on Arc. Reserved collateral cannot be withdrawn while positions are open.</p>
              <p className="text-xs">Connected wallet: {walletMatches ? "matches maker signer" : "does not match maker signer"} · {chainId === arcTestnet.id ? "Arc testnet" : "switch to Arc testnet"}</p>
              <Field label="Collateral amount (USDC)">
                <input className={inputCls()} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void changeCollateral("deposit")} disabled={working || isPending || !walletMatches || !amount}>Approve and deposit</Button>
                <Button kind="secondary" onClick={() => void changeCollateral("withdraw")} disabled={working || isPending || !walletMatches || !amount}>Withdraw free collateral</Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
