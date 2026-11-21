import { describe, expect, it } from "vitest";
import { saveFitnessProfile, saveGoals, savePantry } from "../src/routes/preferences";
import { createDatabase, responseJson, validFitnessProfile } from "./helpers";

describe("preferences", () => {
  it("deduplicates and persists pantry ingredients", async () => {
    let batchStatements: unknown[] = [];
    const { db } = createDatabase({
      batch: (statements) => {
        batchStatements = statements;
        return [];
      },
    });
    const response = await savePantry(db, {
      userId: "11111111-1111-4111-8111-111111111111",
      ingredients: [" Oats ", "Spinach", "Oats", null, 12, "  "],
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ ok: true, ingredients: ["Oats", "Spinach"] });
    expect(batchStatements).toHaveLength(3);
  });

  it("validates goal minimums and saves rounded values", async () => {
    const { db, calls } = createDatabase();
    const userId = "11111111-1111-4111-8111-111111111111";
    const invalid = await saveGoals(db, { userId, calories: 400, protein: 50 });
    const saved = await saveGoals(db, { userId, calories: 2000.4, protein: 120.6 });

    expect(invalid.status).toBe(400);
    expect(saved.status).toBe(200);
    expect(calls.find(({ sql }) => sql?.includes("UPDATE profiles"))?.values).toEqual([2000, 121, userId]);
  });

  it("rejects impossible event dates and stores a valid fitness profile", async () => {
    const { db, calls } = createDatabase();
    const invalid = await saveFitnessProfile(db, validFitnessProfile({ targetEventDate: "2026-02-30" }));
    const valid = await saveFitnessProfile(db, validFitnessProfile({ targetEventDate: "2026-11-21" }));

    expect(invalid.status).toBe(400);
    expect(await responseJson(invalid)).toEqual({ error: "Target event date must be a valid calendar date." });
    expect(valid.status).toBe(200);
    expect(calls.find(({ sql }) => sql?.includes("INSERT INTO fitness_profiles"))?.values).toContain("2026-11-21");
  });
});
