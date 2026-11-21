import { describe, expect, it, vi } from "vitest";
import { estimateEntry } from "../src/routes/estimates";
import type { Env } from "../src/types";
import { responseJson } from "./helpers";

describe("AI estimates", () => {
  it("normalizes partial meal estimates and reports missing nutrients", async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({ calories: "350", protein: 14.5, notes: "One serving" }),
    });
    const response = await estimateEntry({
      AI: { run },
    } as unknown as Env, {
      userId: "11111111-1111-4111-8111-111111111111",
      type: "meal",
      title: "Oatmeal",
    });
    const body = await responseJson<{ estimate: Record<string, unknown> }>(response);

    expect(response.status).toBe(200);
    expect(body.estimate).toEqual({
      calories: 350,
      protein: 14.5,
      carbs: 0,
      fat: 0,
      fiber: 0,
      notes: "One serving No estimate was returned for carbs, fat, fiber; those fields are set to 0.",
    });
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.3-70b-instruct-fp8-fast", expect.objectContaining({
      response_format: { type: "json_object" },
    }));
  });

  it("normalizes exercise estimates and rejects invalid descriptions", async () => {
    const run = vi.fn().mockResolvedValue({
      response: { choices: [{ message: { content: JSON.stringify({ kcal: 215, muscles: "Legs, core" }) } }] },
    });
    const env = { AI: { run } } as unknown as Env;
    const valid = await estimateEntry(env, {
      userId: "11111111-1111-4111-8111-111111111111",
      type: "exercise",
      title: "Jogging",
      detail: "30 minutes",
    });
    const invalid = await estimateEntry(env, {
      userId: "11111111-1111-4111-8111-111111111111",
      type: "exercise",
      title: "Jogging",
      detail: "x".repeat(501),
    });

    expect(await responseJson(valid)).toEqual({
      estimate: { calories: 215, muscleGroups: "Legs, core", notes: "Portion and nutrient values are approximate." },
    });
    expect(invalid.status).toBe(400);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
