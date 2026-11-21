import { boundedNumber, json, validUserId } from "../lib/http";
import { ensureProfile } from "../lib/profiles";
import type { GoalsInput, PantryInput } from "../types";

export async function savePantry(db: D1Database, input: PantryInput): Promise<Response> {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (!Array.isArray(input.ingredients) || input.ingredients.length > 50) {
    return json({ error: "Provide up to 50 pantry ingredients." }, 400);
  }

  const ingredients = [...new Set(input.ingredients
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean))];
  await ensureProfile(db, input.userId);
  const statements = [
    db.prepare("DELETE FROM pantry WHERE user_id = ?").bind(input.userId),
    ...ingredients.map((ingredient) =>
      db.prepare("INSERT INTO pantry (user_id, ingredient) VALUES (?, ?)").bind(input.userId, ingredient)),
  ];
  await db.batch(statements);
  return json({ ok: true, ingredients });
}

export async function saveGoals(db: D1Database, input: GoalsInput): Promise<Response> {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  const calories = boundedNumber(input.calories, "Calorie goal", 10000);
  const protein = boundedNumber(input.protein, "Protein goal", 1000);
  if (calories < 500 || protein < 10) return json({ error: "Goals are below the allowed minimum." }, 400);

  await ensureProfile(db, input.userId);
  await db.prepare("UPDATE profiles SET calorie_goal = ?, protein_goal = ? WHERE user_id = ?")
    .bind(Math.round(calories), Math.round(protein), input.userId).run();
  return json({ ok: true });
}
