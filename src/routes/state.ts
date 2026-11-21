import { ensureProfile } from "../lib/profiles";
import { json } from "../lib/http";

export async function getState(db: D1Database, userId: string): Promise<Response> {
  await ensureProfile(db, userId);
  const [profile, fitnessProfile, entries, ingredients, messages] = await Promise.all([
    db.prepare("SELECT calorie_goal, protein_goal FROM profiles WHERE user_id = ?").bind(userId).first<{
      calorie_goal: number;
      protein_goal: number;
    }>(),
    db.prepare(
      `SELECT fitness_goal, goal_details, age, gender_identity, height_cm, weight_kg,
       activity_level, training_experience, target_event, target_event_date, limitations,
       equipment, preferred_activities
       FROM fitness_profiles WHERE user_id = ?`,
    ).bind(userId).first<{
      fitness_goal: string;
      goal_details: string;
      age: number | null;
      gender_identity: string;
      height_cm: number | null;
      weight_kg: number | null;
      activity_level: string;
      training_experience: string;
      target_event: string;
      target_event_date: string;
      limitations: string;
      equipment: string;
      preferred_activities: string;
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
    fitnessProfile: {
      fitnessGoal: fitnessProfile?.fitness_goal ?? "general_fitness",
      goalDetails: fitnessProfile?.goal_details ?? "",
      age: fitnessProfile?.age ?? null,
      genderIdentity: fitnessProfile?.gender_identity ?? "",
      heightCm: fitnessProfile?.height_cm ?? null,
      weightKg: fitnessProfile?.weight_kg ?? null,
      activityLevel: fitnessProfile?.activity_level ?? "",
      trainingExperience: fitnessProfile?.training_experience ?? "",
      targetEvent: fitnessProfile?.target_event ?? "",
      targetEventDate: fitnessProfile?.target_event_date ?? "",
      limitations: fitnessProfile?.limitations ?? "",
      equipment: fitnessProfile?.equipment ?? "",
      preferredActivities: fitnessProfile?.preferred_activities ?? "",
    },
    entries: entries.results,
    pantry: ingredients.results.map((row) => row.ingredient),
    messages: messages.results,
  });
}

const HISTORY_RANGES = [7, 30, 90, 365] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

export async function getHistory(db: D1Database, userId: string, range: HistoryRange = 30): Promise<Response> {
  await ensureProfile(db, userId);
  const entries = await db.prepare(
    `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
     FROM entries
     WHERE user_id = ? AND created_at >= strftime(
       '%Y-%m-%dT%H:%M:%fZ', 'now', 'start of day', '-' || (? - 1) || ' days'
     )
     ORDER BY created_at DESC`,
  ).bind(userId, range).all();
  return json({ entries: entries.results, range });
}

export async function readHistory(request: Request, db: D1Database, userId: string): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const requestedRange = params.get("days");
  const range = requestedRange === null ? 30 : Number(requestedRange);
  if (!HISTORY_RANGES.includes(range as HistoryRange)) {
    return json({ error: `History range must be one of: ${HISTORY_RANGES.join(", ")} days.` }, 400);
  }
  return getHistory(db, userId, range as HistoryRange);
}
