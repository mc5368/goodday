import { describe, expect, it, vi } from "vitest";
import { askAssistant } from "../src/routes/assistant";
import type { Env } from "../src/types";
import { createDatabase, responseJson } from "./helpers";

describe("AI assistant", () => {
  it.each([
    ["meal", "Please add a banana to my food log.", { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, notes: "One medium banana" }],
    ["exercise", "Please log a 20 minute walk.", { calories: 90, muscleGroups: "Legs", notes: "Easy pace" }],
  ])("logs an AI-estimated %s entry requested in chat", async (type, message, estimate) => {
    const { db, calls } = createDatabase();
    const run = vi.fn()
      .mockResolvedValueOnce({ response: "I will add that to your log." })
      .mockResolvedValueOnce({ response: JSON.stringify({ type, title: type === "meal" ? "Banana" : "Walk", detail: "20 minutes" }) })
      .mockResolvedValueOnce({ response: JSON.stringify(estimate) });
    const response = await askAssistant({
      DB: db,
      AI: { run },
    } as unknown as Env, {
      userId: "11111111-1111-4111-8111-111111111111",
      message,
    });
    const body = await responseJson<{ answer: string; loggedEntry: boolean }>(response);
    const insert = calls.find(({ sql }) => sql?.includes("INSERT INTO entries"));

    expect(response.status).toBe(200);
    expect(body.loggedEntry).toBe(true);
    expect(body.answer).toContain("Logged");
    expect(insert?.values).toContain("11111111-1111-4111-8111-111111111111");
    expect(insert?.values).toContain(type);
    expect(calls.some(({ kind }) => kind === "batch")).toBe(true);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each(["recipes", "workout"])("supports the %s assistant mode without logging chat history", async (mode) => {
    const { db, calls } = createDatabase();
    const run = vi.fn().mockResolvedValue({ response: "Here is a practical suggestion." });
    const response = await askAssistant({
      DB: db,
      AI: { run },
    } as unknown as Env, {
      userId: "11111111-1111-4111-8111-111111111111",
      message: "Give me a suggestion.",
      mode,
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      answer: "Here is a practical suggestion.",
      loggedEntry: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls.some(({ kind }) => kind === "batch")).toBe(false);
  });
});
