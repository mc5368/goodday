import { boundedNumber, json, validUserId } from "../lib/http";
import { ensureProfile } from "../lib/profiles";
import type { FitnessProfileInput, GoalsInput, PantryInput } from "../types";

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

const fitnessGoals = ["weight_loss", "build_muscle", "event_training", "maintain", "general_fitness"] as const;
const activityLevels = ["", "low", "light", "moderate", "high"] as const;
const trainingLevels = ["", "beginner", "intermediate", "advanced"] as const;

function boundedOptionalNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be ${integer ? "a whole number" : "a number"} between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function optionalText(value: unknown, name: string, maximum: number): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > maximum) {
    throw new Error(`${name} must be at most ${maximum} characters.`);
  }
  return value.trim();
}

export async function saveFitnessProfile(db: D1Database, input: FitnessProfileInput): Promise<Response> {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (typeof input.fitnessGoal !== "string" || !fitnessGoals.includes(input.fitnessGoal as (typeof fitnessGoals)[number])) {
    return json({ error: "Choose a valid fitness goal." }, 400);
  }
  if (typeof input.activityLevel !== "string" || !activityLevels.includes(input.activityLevel as (typeof activityLevels)[number])) {
    return json({ error: "Choose a valid activity level." }, 400);
  }
  if (typeof input.trainingExperience !== "string" || !trainingLevels.includes(input.trainingExperience as (typeof trainingLevels)[number])) {
    return json({ error: "Choose a valid training experience level." }, 400);
  }

  let age: number | null;
  let height: number | null;
  let weight: number | null;
  let goalDetails: string;
  let genderIdentity: string;
  let targetEvent: string;
  let targetEventDate: string;
  let limitations: string;
  let equipment: string;
  let preferredActivities: string;
  try {
    age = boundedOptionalNumber(input.age, "Age", 1, 120, true);
    height = boundedOptionalNumber(input.heightCm, "Height", 80, 250);
    weight = boundedOptionalNumber(input.weightKg, "Weight", 20, 400);
    goalDetails = optionalText(input.goalDetails, "Goal details", 300);
    genderIdentity = optionalText(input.genderIdentity, "Gender identity", 60);
    targetEvent = optionalText(input.targetEvent, "Target event", 100);
    targetEventDate = optionalText(input.targetEventDate, "Target event date", 10);
    limitations = optionalText(input.limitations, "Injuries or limitations", 500);
    equipment = optionalText(input.equipment, "Available equipment", 250);
    preferredActivities = optionalText(input.preferredActivities, "Preferred activities", 250);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Fitness profile contains invalid values." }, 400);
  }
  if (targetEventDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetEventDate)) {
    return json({ error: "Target event date must be a valid calendar date." }, 400);
  }
  if (targetEventDate) {
    const parsedDate = new Date(`${targetEventDate}T00:00:00Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== targetEventDate) {
      return json({ error: "Target event date must be a valid calendar date." }, 400);
    }
  }

  await ensureProfile(db, input.userId);
  await db.prepare(
    `INSERT INTO fitness_profiles (
      user_id, fitness_goal, goal_details, age, gender_identity, height_cm, weight_kg,
      activity_level, training_experience, target_event, target_event_date, limitations,
      equipment, preferred_activities, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      fitness_goal = excluded.fitness_goal,
      goal_details = excluded.goal_details,
      age = excluded.age,
      gender_identity = excluded.gender_identity,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      activity_level = excluded.activity_level,
      training_experience = excluded.training_experience,
      target_event = excluded.target_event,
      target_event_date = excluded.target_event_date,
      limitations = excluded.limitations,
      equipment = excluded.equipment,
      preferred_activities = excluded.preferred_activities,
      updated_at = excluded.updated_at`,
  ).bind(
    input.userId,
    input.fitnessGoal,
    goalDetails,
    age,
    genderIdentity,
    height,
    weight,
    input.activityLevel,
    input.trainingExperience,
    targetEvent,
    targetEventDate,
    limitations,
    equipment,
    preferredActivities,
  ).run();
  return json({ ok: true });
}
