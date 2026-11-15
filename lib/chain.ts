import { defineChain } from "viem";

export const ARC_TESTNET_ID = 5042002;
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: process.env.NEXT_PUBLIC_EXPLORER || "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export function publicUsdc(): `0x${string}` {
  return (process.env.NEXT_PUBLIC_USDC as `0x${string}`) || ARC_USDC;
}

export function publicEscrow(): `0x${string}` | null {
  const value = process.env.NEXT_PUBLIC_ESCROW;
  return value ? (value as `0x${string}`) : null;
}

export function publicChainId(): number {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID || ARC_TESTNET_ID);
}
