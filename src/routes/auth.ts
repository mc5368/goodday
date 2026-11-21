import { bodyOf, json, validUserId } from "../lib/http";

const PASSWORD_ITERATIONS = 600_000;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const SESSION_COOKIE = "__Host-goodday_session";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const DUMMY_SALT = new Uint8Array(16);

interface AccountRow {
  user_id: string;
  username: string;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function fromHex(value: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error("Stored authentication data is invalid.");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer(bytes)));
}

async function passwordHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: arrayBuffer(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function equalBytes(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }
  return difference === 0;
}

function cookieValue(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=");
  }
  return undefined;
}

function authCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function authJson(data: unknown, cookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(data), { headers });
}

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function rateLimitKey(scope: string, value: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${scope}:${value}`);
  return toHex(await digest(encoded));
}

async function consumeRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const row = await db.prepare(
    `INSERT INTO auth_rate_limits (bucket_key, hits, window_started_at)
     VALUES (?, 1, unixepoch())
     ON CONFLICT(bucket_key) DO UPDATE SET
       hits = CASE
         WHEN window_started_at <= unixepoch() - ? THEN 1
         ELSE hits + 1
       END,
       window_started_at = CASE
         WHEN window_started_at <= unixepoch() - ? THEN unixepoch()
         ELSE window_started_at
       END
     RETURNING hits`,
  ).bind(key, windowSeconds, windowSeconds).first<{ hits: number }>();
  return (row?.hits ?? limit + 1) <= limit;
}

async function removeExpiredRateLimits(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM auth_rate_limits WHERE window_started_at < unixepoch() - 86400").run();
}

async function createSession(db: D1Database, userId: string): Promise<Response> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = toHex(await digest(tokenBytes));
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, now, now + SESSION_SECONDS).run();
  await db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind(now).run();
  const account = await db.prepare("SELECT username FROM user_accounts WHERE user_id = ?")
    .bind(userId).first<{ username: string }>();
  if (!account) throw new Error("Could not load the signed-in account.");
  return authJson({ authenticated: true, username: account.username }, authCookie(token, SESSION_SECONDS));
}

async function register(db: D1Database, request: Request): Promise<Response> {
  if (!validOrigin(request)) return json({ error: "Request origin was not accepted." }, 403);
  const body: unknown = await bodyOf<unknown>(request);
  if (!isRecord(body)) return json({ error: "Username and password are required." }, 400);
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!USERNAME_PATTERN.test(username)) {
    return json({ error: "Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens." }, 400);
  }
  if (password.length < 12 || password.length > 128) {
    return json({ error: "Password must be between 12 and 128 characters." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const registerKey = await rateLimitKey("register", ip);
  if (!(await consumeRateLimit(db, registerKey, 10, 3600))) {
    return json({ error: "Too many account creation attempts. Try again later." }, 429);
  }

  const existing = await db.prepare("SELECT 1 AS found FROM user_accounts WHERE username = ?")
    .bind(username).first<{ found: number }>();
  if (existing) return json({ error: "That username is already in use." }, 409);

  const userId = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  try {
    await db.batch([
      db.prepare("INSERT INTO profiles (user_id) VALUES (?)").bind(userId),
      db.prepare("INSERT INTO fitness_profiles (user_id) VALUES (?)").bind(userId),
      db.prepare(
        `INSERT INTO user_accounts (user_id, username, password_salt, password_hash, password_iterations)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(userId, username, toHex(salt), toHex(hash), PASSWORD_ITERATIONS),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) {
      return json({ error: "That username is already in use." }, 409);
    }
    throw error;
  }
  await removeExpiredRateLimits(db);
  return createSession(db, userId);
}

async function login(db: D1Database, request: Request): Promise<Response> {
  if (!validOrigin(request)) return json({ error: "Request origin was not accepted." }, 403);
  const body: unknown = await bodyOf<unknown>(request);
  if (!isRecord(body)) return json({ error: "Username and password are required." }, 400);
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (username.length > 32 || password.length > 128) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const loginKey = await rateLimitKey("login", ip);
  const blocked = await db.prepare(
    "SELECT hits, window_started_at FROM auth_rate_limits WHERE bucket_key = ?",
  ).bind(loginKey).first<{ hits: number; window_started_at: number }>();
  if (blocked && blocked.hits >= 10 && blocked.window_started_at > Math.floor(Date.now() / 1000) - 900) {
    return json({ error: "Too many sign-in attempts. Try again in a few minutes." }, 429);
  }

  const account = await db.prepare(
    `SELECT user_id, username, password_salt, password_hash, password_iterations
     FROM user_accounts WHERE username = ?`,
  ).bind(username).first<AccountRow>();
  const salt = account ? fromHex(account.password_salt) : DUMMY_SALT;
  const computed = await passwordHash(password, salt);
  const expected = account && account.password_iterations === PASSWORD_ITERATIONS
    ? fromHex(account.password_hash)
    : new Uint8Array(32);
  if (!account || !equalBytes(computed, expected)) {
    await consumeRateLimit(db, loginKey, 10, 900);
    await removeExpiredRateLimits(db);
    return json({ error: "Invalid username or password." }, 401);
  }

  await db.prepare("DELETE FROM auth_rate_limits WHERE bucket_key = ?").bind(loginKey).run();
  return createSession(db, account.user_id);
}

async function session(request: Request, db: D1Database): Promise<Response> {
  const token = cookieValue(request);
  if (!token) return authJson({ authenticated: false });
  let tokenBytes: Uint8Array;
  try {
    tokenBytes = fromBase64Url(token);
  } catch {
    return authJson({ authenticated: false }, authCookie("", 0));
  }
  if (tokenBytes.length !== 32) return authJson({ authenticated: false }, authCookie("", 0));
  const tokenHash = toHex(await digest(tokenBytes));
  const account = await db.prepare(
    `SELECT a.username
     FROM user_sessions s JOIN user_accounts a ON a.user_id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > unixepoch()`,
  ).bind(tokenHash).first<{ username: string }>();
  return authJson(
    account ? { authenticated: true, username: account.username } : { authenticated: false },
    account ? undefined : authCookie("", 0),
  );
}

async function logout(request: Request, db: D1Database): Promise<Response> {
  if (!validOrigin(request)) return json({ error: "Request origin was not accepted." }, 403);
  const token = cookieValue(request);
  if (token) {
    let tokenBytes: Uint8Array;
    try {
      tokenBytes = fromBase64Url(token);
    } catch {
      return authJson({ ok: true }, authCookie("", 0));
    }
    if (tokenBytes.length === 32) {
      await db.prepare("DELETE FROM user_sessions WHERE token_hash = ?")
        .bind(toHex(await digest(tokenBytes))).run();
    }
  }
  return authJson({ ok: true }, authCookie("", 0));
}

export async function authenticate(request: Request, db: D1Database): Promise<string | null> {
  const token = cookieValue(request);
  if (!token) return null;
  let tokenBytes: Uint8Array;
  try {
    tokenBytes = fromBase64Url(token);
  } catch {
    return null;
  }
  if (tokenBytes.length !== 32) return null;
  const tokenHash = toHex(await digest(tokenBytes));
  const sessionRow = await db.prepare(
    "SELECT user_id FROM user_sessions WHERE token_hash = ? AND expires_at > unixepoch()",
  ).bind(tokenHash).first<{ user_id: string }>();
  return sessionRow && validUserId(sessionRow.user_id) ? sessionRow.user_id : null;
}

export async function handleAuth(
  request: Request,
  db: D1Database,
  pathname: string,
): Promise<Response | undefined> {
  if (request.method === "GET" && pathname === "/api/auth/session") return session(request, db);
  if (request.method !== "POST") return undefined;
  if (pathname === "/api/auth/register") return register(db, request);
  if (pathname === "/api/auth/login") return login(db, request);
  if (pathname === "/api/auth/logout") return logout(request, db);
  return undefined;
}
