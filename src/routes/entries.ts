import { boundedNumber, json, validUserId } from "../lib/http";
import { ensureProfile } from "../lib/profiles";
import type { EntryInput } from "../types";

export async function saveEntry(db: D1Database, input: EntryInput): Promise<Response> {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (input.type !== "meal" && input.type !== "exercise") {
    return json({ error: "Entry type must be meal or exercise." }, 400);
  }
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 100) : "";
  if (!title) return json({ error: "A title is required." }, 400);
  const detail = typeof input.detail === "string" ? input.detail.trim().slice(0, 500) : "";
  const muscleGroups = typeof input.muscleGroups === "string" ? input.muscleGroups.trim().slice(0, 160) : "";
  let calories: number;
  let protein: number;
  let carbs: number;
  let fat: number;
  let fiber: number;
  try {
    calories = boundedNumber(input.calories, "Calories", 10000);
    protein = boundedNumber(input.protein, "Protein", 1000);
    carbs = boundedNumber(input.carbs, "Carbohydrates", 1000);
    fat = boundedNumber(input.fat, "Fat", 1000);
    fiber = boundedNumber(input.fiber, "Fiber", 1000);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid nutrition values." }, 400);
  }

  await ensureProfile(db, input.userId);
  await db.prepare(
    `INSERT INTO entries
      (id, user_id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.userId,
    input.type,
    title,
    detail,
    Math.round(calories),
    protein,
    carbs,
    fat,
    fiber,
    muscleGroups,
  ).run();
  return json({ ok: true });
}
