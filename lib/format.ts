import { USDC_DECIMALS } from "@/lib/domain/types";

export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "000000").slice(0, USDC_DECIMALS);
  return BigInt(whole.replace(/[^0-9]/g, "") || "0") * 1_000_000n + BigInt(fracPadded || "0");
}

export function formatUsdc(value: bigint, opts?: { signed?: boolean }): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  const body = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  const prefix = neg ? "-" : opts?.signed ? "+" : "";
  return `${prefix}${body}`;
}

export function formatUsdcFixed(value: bigint): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString()} (${iso})`;
}

export function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
