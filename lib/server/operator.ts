import { timingSafeEqual } from "node:crypto";

export function operatorSecretConfigured(): boolean {
  return Boolean(process.env.OPERATOR_SECRET);
}

export function isOperatorRequest(req: Request): boolean {
  const expected = process.env.OPERATOR_SECRET;
  const provided = req.headers.get("x-operator");
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
