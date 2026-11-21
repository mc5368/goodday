import { describe, expect, it } from "vitest";
import { saveEntry } from "../src/routes/entries";
import { createDatabase, responseJson } from "./helpers";

describe("entry logging", () => {
  it("stores entries with missing nutrition as zero and normalizes text", async () => {
    const { db, calls } = createDatabase();
    const response = await saveEntry(db, {
      userId: "11111111-1111-4111-8111-111111111111",
      type: "meal",
      title: "  Blueberry oatmeal  ",
      detail: "  One bowl  ",
      protein: 12.5,
      muscleGroups: "  ",
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ ok: true });
    const insert = calls.find(({ sql }) => sql?.includes("INSERT INTO entries"));
    expect(insert?.values).toMatchObject([
      expect.any(String),
      "11111111-1111-4111-8111-111111111111",
      "meal",
      "Blueberry oatmeal",
      "One bowl",
      0,
      12.5,
      0,
      0,
      0,
      "",
    ]);
  });

  it("rejects invalid entry types, empty titles, and out-of-range values", async () => {
    const { db, calls } = createDatabase();
    const userId = "11111111-1111-4111-8111-111111111111";
    const invalidType = await saveEntry(db, { userId, type: "snack" as "meal", title: "Lunch" });
    const emptyTitle = await saveEntry(db, { userId, type: "meal", title: "   " });
    const invalidCalories = await saveEntry(db, { userId, type: "meal", title: "Lunch", calories: 10001 });

    expect(invalidType.status).toBe(400);
    expect(emptyTitle.status).toBe(400);
    expect(invalidCalories.status).toBe(400);
    expect(calls.some(({ sql }) => sql?.includes("INSERT INTO entries"))).toBe(false);
  });
});
