const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: jsonHeaders });
}

export function validUserId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

export function boundedNumber(value: unknown, name: string, maximum: number): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be between 0 and ${maximum}.`);
  }
  return parsed;
}

export async function bodyOf<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
