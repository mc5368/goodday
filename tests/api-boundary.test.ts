import { describe, expect, it } from "vitest";
import { handleApi } from "../src/routes";
import { handleAuth } from "../src/routes/auth";
import type { Env } from "../src/types";
import { createDatabase, createSessionToken, responseJson } from "./helpers";

describe("API request boundary", () => {
  it("rejects unsupported methods before accessing the database", async () => {
    const { db, calls } = createDatabase();
    const response = await handleApi(new Request("http://localhost/api/state", { method: "PUT" }), {
      DB: db,
    } as Env);

    expect(response.status).toBe(405);
    expect(await responseJson(response)).toEqual({ error: "Method not allowed." });
    expect(calls).toHaveLength(0);
  });

  it("rejects cross-origin writes and unauthenticated API reads", async () => {
    const { db, calls } = createDatabase();
    const crossOrigin = await handleApi(new Request("http://localhost/api/entries", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ type: "meal", title: "Lunch" }),
    }), { DB: db } as Env);
    const unauthenticated = await handleApi(new Request("http://localhost/api/state"), { DB: db } as Env);

    expect(crossOrigin.status).toBe(403);
    expect(await responseJson(crossOrigin)).toEqual({ error: "Request origin was not accepted." });
    expect(unauthenticated.status).toBe(401);
    expect(await responseJson(unauthenticated)).toEqual({ error: "Authentication required." });
    expect(calls).toHaveLength(0);
  });

  it("uses the authenticated identity instead of a client-supplied user ID", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const { db, calls } = createDatabase({
      first: (sql) => sql.includes("SELECT user_id FROM user_sessions") ? { user_id: userId } : null,
    });
    const response = await handleApi(new Request("http://localhost/api/entries", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        cookie: `__Host-goodday_session=${createSessionToken(9)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId: "22222222-2222-4222-8222-222222222222",
        type: "meal",
        title: "Lunch",
      }),
    }), { DB: db } as Env);

    expect(response.status).toBe(200);
    expect(calls.find(({ sql }) => sql?.includes("INSERT INTO entries"))?.values?.[1]).toBe(userId);
  });

  it("rejects auth writes from an untrusted origin", async () => {
    const { db, calls } = createDatabase();
    const response = await handleAuth(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "example-password" }),
    }), db, "/api/auth/login");

    expect(response?.status).toBe(403);
    expect(await responseJson(response!)).toEqual({ error: "Request origin was not accepted." });
    expect(calls).toHaveLength(0);
  });
});
