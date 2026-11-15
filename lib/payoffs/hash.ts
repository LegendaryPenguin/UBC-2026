import { encodeAbiParameters, keccak256, toHex } from "viem";

export function hashBytes(value: string): `0x${string}` {
  return keccak256(toHex(value));
}

export function payoffHash(payouts: bigint[]): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "uint256[]" }], [payouts]),
  );
}

export function familyHash(parts: {
  slug: string;
  version: string;
  contractIds: string[];
  scenarioLabels: string[];
  observationTime: string | null;
}): `0x${string}` {
  return hashBytes(
    JSON.stringify({
      slug: parts.slug,
      version: parts.version,
      contractIds: parts.contractIds,
      scenarioLabels: parts.scenarioLabels,
      observationTime: parts.observationTime,
    }),
  );
}
