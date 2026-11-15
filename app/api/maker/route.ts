import { fail, ok, readJson } from "@/lib/server/http";
import { isOperatorRequest, operatorSecretConfigured } from "@/lib/server/operator";
import { mutate, readStore } from "@/lib/server/store";
import { privateKeyToAccount } from "viem/accounts";

export const dynamic = "force-dynamic";

function authorize(req: Request) {
  if (!operatorSecretConfigured()) return fail("UNAVAILABLE", "Operator access is not configured.", 503);
  if (!isOperatorRequest(req)) return fail("AUTH", "Operator access required.", 401);
  return null;
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  const store = readStore();
  let makerAddress: string | null = null;
  const makerKey = process.env.MAKER_PRIVATE_KEY as `0x${string}` | undefined;
  if (makerKey) {
    try {
      makerAddress = privateKeyToAccount(makerKey).address;
    } catch {
      return fail("CONFIG", "MAKER_PRIVATE_KEY is invalid.", 503);
    }
  }
  return ok({
    policy: store.maker,
    makerAddress,
    counts: {
      openPositions: store.positions.filter((position) => position.mode === "live" && position.status === "open").length,
      activeQuotes: store.quotes.filter((quote) => quote.status === "available" && quote.signature !== "0x").length,
    },
  });
}

export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  let body: { spreadBps?: unknown; paused?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide maker settings as JSON.");
  }
  if (!body || typeof body !== "object") return fail("INVALID", "Provide maker settings as a JSON object.");
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => key !== "spreadBps" && key !== "paused")) {
    return fail("INVALID", "Provide only spreadBps or paused.");
  }
  if (body.spreadBps !== undefined &&
    (typeof body.spreadBps !== "number" || !Number.isInteger(body.spreadBps) || body.spreadBps < 0 || body.spreadBps > 10_000)) {
    return fail("INVALID", "Spread must be a whole number from 0 to 10,000 basis points.");
  }
  if (body.paused !== undefined && typeof body.paused !== "boolean") return fail("INVALID", "paused must be true or false.");
  const policy = mutate((store) => {
    if (typeof body.spreadBps === "number") store.maker.spreadBps = body.spreadBps;
    if (typeof body.paused === "boolean") store.maker.paused = body.paused;
    return store.maker;
  });
  return ok({ policy });
}
