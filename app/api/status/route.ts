import { statusSnapshot } from "@/lib/capabilities";
import { ok } from "@/lib/server/http";

export async function GET() {
  return ok(statusSnapshot());
}
