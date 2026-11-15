import { statusSnapshot } from "@/lib/capabilities";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(statusSnapshot());
}
