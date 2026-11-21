import { describe, expect, it } from "vitest";
import { authenticate } from "../src/routes/auth";
import { createDatabase, createSessionToken } from "./helpers";

describe("authentication", () => {
  it("authenticates using the hashed session token and rejects absent cookies", async () => {
    const { db, calls } = createDatabase({ first: () => ({ user_id: "11111111-1111-4111-8111-111111111111" }) });
    const request = new Request("http://localhost/api/state", {
      headers: { cookie: `__Host-goodday_session=${createSessionToken()}` },
    });

    await expect(authenticate(new Request("http://localhost/api/state"), db)).resolves.toBeNull();
    await expect(authenticate(request, db)).resolves.toBe("11111111-1111-4111-8111-111111111111");
    expect(calls[0].values?.[0]).not.toBe(createSessionToken());
    expect(calls[0].values?.[0]).toMatch(/^[a-f0-9]{64}$/);
  });
});
