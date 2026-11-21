import { ensureProfile } from "../lib/profiles";
import { json, validUserId } from "../lib/http";

export async function getState(db: D1Database, userId: string): Promise<Response> {
  await ensureProfile(db, userId);
  const [profile, entries, ingredients, messages] = await Promise.all([
    db.prepare("SELECT calorie_goal, protein_goal FROM profiles WHERE user_id = ?").bind(userId).first<{
      calorie_goal: number;
      protein_goal: number;
    }>(),
    db.prepare(
      `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
       FROM entries WHERE user_id = ? AND date(created_at) = date('now')
       ORDER BY created_at DESC LIMIT 100`,
    ).bind(userId).all(),
    db.prepare("SELECT ingredient FROM pantry WHERE user_id = ? ORDER BY ingredient").bind(userId).all<{
      ingredient: string;
    }>(),
    db.prepare(
      `SELECT role, content FROM
       (SELECT role, content, created_at FROM chat_history WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20)
       ORDER BY created_at ASC`,
    ).bind(userId).all<{ role: "user" | "assistant"; content: string }>(),
  ]);
  return json({
    goals: { calories: profile?.calorie_goal ?? 2000, protein: profile?.protein_goal ?? 120 },
    entries: entries.results,
    pantry: ingredients.results.map((row) => row.ingredient),
    messages: messages.results,
  });
}

export async function getHistory(db: D1Database, userId: string): Promise<Response> {
  await ensureProfile(db, userId);
  const entries = await db.prepare(
    `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
     FROM entries
     WHERE user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
     ORDER BY created_at DESC`,
  ).bind(userId).all();
  return json({ entries: entries.results });
}

export async function readState(request: Request, db: D1Database): Promise<Response> {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
  return getState(db, userId);
}

export async function readHistory(request: Request, db: D1Database): Promise<Response> {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
  return getHistory(db, userId);
}
