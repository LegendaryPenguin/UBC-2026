"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { ARC_TESTNET_ID } from "@/lib/chain";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  if (!isConnected) {
    return (
      <button
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm"
        onClick={() => connectors[0] && connect({ connector: connectors[0] })}
        disabled={isPending}
      >
        Connect wallet
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {chainId !== ARC_TESTNET_ID ? (
        <button className="min-h-11 rounded-lg bg-bad px-3 text-sm text-white" onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}>
          Switch to Arc
        </button>
      ) : null}
      <span className="hidden text-xs text-muted sm:inline">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
      <button className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
