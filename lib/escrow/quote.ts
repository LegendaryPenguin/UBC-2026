import { privateKeyToAccount } from "viem/accounts";
import { hashTypedData } from "viem";
import { publicChainId, publicEscrow, publicUsdc } from "@/lib/chain";
import { quoteTypes } from "@/lib/escrow/abi";
import type { SignedQuote } from "@/lib/domain/types";

export function quoteDomain(escrow: `0x${string}`) {
  return {
    name: "ThesisEscrow",
    version: "1",
    chainId: publicChainId(),
    verifyingContract: escrow,
  } as const;
}

export async function signQuote(params: {
  makerKey: `0x${string}`;
  taker: `0x${string}`;
  familyHash: `0x${string}`;
  payoffHash: `0x${string}`;
  maxPayout: bigint;
  premium: bigint;
  fee: bigint;
  nonce: bigint;
  payouts: bigint[];
  scenarioLabels: string[];
}): Promise<SignedQuote> {
  const escrow = publicEscrow();
  if (!escrow) {
    throw Object.assign(new Error("Escrow is not deployed"), { code: "UNAVAILABLE" });
  }
  const account = privateKeyToAccount(params.makerKey);
  const issuedAt = Math.floor(Date.now() / 1000);
  const deadline = issuedAt + 10 * 60;
  const message = {
    maker: account.address,
    taker: params.taker,
    escrow,
    token: publicUsdc(),
    familyHash: params.familyHash,
    payoffHash: params.payoffHash,
    maxPayout: params.maxPayout,
    premium: params.premium,
    fee: params.fee,
    nonce: params.nonce,
    issuedAt: BigInt(issuedAt),
    deadline: BigInt(deadline),
    chainId: BigInt(publicChainId()),
  };
  const signature = await account.signTypedData({
    domain: quoteDomain(escrow),
    types: quoteTypes,
    primaryType: "Quote",
    message,
  });
  hashTypedData({
    domain: quoteDomain(escrow),
    types: quoteTypes,
    primaryType: "Quote",
    message,
  });
  return {
    id: `q_${params.nonce}`,
    status: "available",
    maker: account.address,
    taker: params.taker,
    escrow,
    token: publicUsdc(),
    familyHash: params.familyHash,
    payoffHash: params.payoffHash,
    maxPayout: params.maxPayout.toString(),
    premium: params.premium.toString(),
    fee: params.fee.toString(),
    nonce: params.nonce.toString(),
    issuedAt,
    deadline,
    chainId: publicChainId(),
    signature,
    payouts: params.payouts.map((p) => p.toString()),
    scenarioLabels: params.scenarioLabels,
  };
}

export function quoteExpired(quote: SignedQuote): boolean {
  return quote.deadline * 1000 < Date.now();
}
