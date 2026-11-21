import { describe, expect, it } from "vitest";
import { getState, readHistory } from "../src/routes/state";
import { createDatabase, responseJson } from "./helpers";

describe("state and history", () => {
  it("returns isolated user state with defaults and persisted records", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const { db, calls } = createDatabase({
      first: (sql) => sql.includes("SELECT calorie_goal")
        ? { calorie_goal: 2200, protein_goal: 140 }
        : null,
      all: (sql) => sql.includes("SELECT id, type, title")
        ? { results: [{ id: "entry-1", title: "Lunch" }] }
        : sql.includes("SELECT ingredient")
          ? { results: [{ ingredient: "Oats" }] }
          : { results: [] },
    });
    const response = await getState(db, userId);
    const body = await responseJson<{
      goals: { calories: number; protein: number };
      fitnessProfile: { fitnessGoal: string; age: number | null };
      entries: { id: string; title: string }[];
      pantry: string[];
      messages: unknown[];
    }>(response);

    expect(body).toMatchObject({
      goals: { calories: 2200, protein: 140 },
      fitnessProfile: { fitnessGoal: "general_fitness", age: null },
      entries: [{ id: "entry-1", title: "Lunch" }],
      pantry: ["Oats"],
      messages: [],
    });
    expect(calls.filter(({ kind }) => kind === "first" || kind === "all")
      .every(({ values }) => values?.[0] === userId)).toBe(true);
  });

  it("validates history range and returns the selected range", async () => {
    const { db, calls } = createDatabase({ all: () => ({ results: [{ id: "entry-1" }] }) });
    const invalid = await readHistory(new Request("http://localhost/api/history?days=14"), db, "user-id");
    const valid = await readHistory(new Request("http://localhost/api/history?days=7"), db, "user-id");

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(await responseJson(valid)).toEqual({ entries: [{ id: "entry-1" }], range: 7 });
    expect(calls.find(({ sql }) => sql?.includes("FROM entries"))?.values).toEqual(["user-id", 7]);
  });
});
