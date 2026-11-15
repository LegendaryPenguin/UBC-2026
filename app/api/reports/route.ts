import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ kind: string }>(req);
  const job = {
    id: uid("exp"),
    accountId: ctx.account.id,
    kind: body.kind,
    status: "ready" as const,
    createdAt: new Date().toISOString(),
    href: `/api/reports/${""}`,
  };
  mutate((s) => {
    const txs = s.transactions.filter((t) => t.accountId === ctx.account.id);
    job.href = `/api/reports/file?id=${job.id}`;
    s.exports.push(job);
    (job as { rows?: unknown }).rows = txs;
  });
  return ok({ job });
}

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ jobs: [] });
  return ok({ jobs: mutate((s) => s.exports.filter((e) => e.accountId === ctx.account.id)) });
}
