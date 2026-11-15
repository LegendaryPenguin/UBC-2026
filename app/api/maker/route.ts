import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";

export async function GET() {
  const store = mutate((s) => s);
  return ok({
    policy: store.maker,
    quotes: store.quotes.slice(-20),
    positions: store.positions,
  });
}

export async function POST(req: Request) {
  const secret = process.env.OPERATOR_SECRET;
  if (secret && req.headers.get("x-operator") !== secret) return fail("AUTH", "Operator required", 401);
  const body = await readJson<{ spreadBps?: number; paused?: boolean }>(req);
  const policy = mutate((s) => {
    if (body.spreadBps != null) s.maker.spreadBps = body.spreadBps;
    if (body.paused != null) s.maker.paused = body.paused;
    return s.maker;
  });
  return ok({ policy });
}
