export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(code: string, message: string, status = 400) {
  return Response.json({ error: { code, message } }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}
