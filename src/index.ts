interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
}

interface EntryInput {
  userId: string;
  type: "meal" | "exercise";
  title: string;
  detail?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  muscleGroups?: string;
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: jsonHeaders });
}

function validUserId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function boundedNumber(value: unknown, name: string, maximum: number): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be between 0 and ${maximum}.`);
  }
  return parsed;
}

async function bodyOf<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function ensureProfile(db: D1Database, userId: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)").bind(userId).run();
}

async function state(db: D1Database, userId: string): Promise<Response> {
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

async function saveEntry(db: D1Database, input: EntryInput): Promise<Response> {
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
  ).bind(crypto.randomUUID(), input.userId, input.type, title, detail, Math.round(calories),
    protein, carbs, fat, fiber, muscleGroups).run();
  return json({ ok: true });
}

async function assistant(
  env: Env,
  userId: string,
  message: string,
  mode: "chat" | "recipes" | "workout",
): Promise<Response> {
  await ensureProfile(env.DB, userId);
  const [recentEntries, pantryRows, priorMessages] = await Promise.all([
    env.DB.prepare(
      `SELECT type, title, calories, protein, carbs, fat
       FROM entries WHERE user_id = ? AND date(created_at) = date('now')
       ORDER BY created_at DESC LIMIT 12`,
    ).bind(userId).all(),
    env.DB.prepare("SELECT ingredient FROM pantry WHERE user_id = ? ORDER BY ingredient").bind(userId).all<{
      ingredient: string;
    }>(),
    mode === "chat"
      ? env.DB.prepare(
          "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 8",
        ).bind(userId).all<{ role: "user" | "assistant"; content: string }>()
      : Promise.resolve({ results: [] as { role: "user" | "assistant"; content: string }[] }),
  ]);
  const foodEntries = recentEntries.results.filter((entry) => entry.type === "meal");
  const totals = foodEntries.reduce<{ calories: number; protein: number; carbs: number; fat: number }>(
    (sum, entry) => ({
      calories: sum.calories + Number(entry.calories),
      protein: sum.protein + Number(entry.protein),
      carbs: sum.carbs + Number(entry.carbs),
      fat: sum.fat + Number(entry.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const context = [
    `Today's logged entries: ${JSON.stringify(recentEntries.results)}.`,
    `Pantry: ${pantryRows.results.map((row) => row.ingredient).join(", ") || "not provided"}.`,
    `Nutrition totals from logged meals: ${JSON.stringify(totals)}.`,
  ].join("\n");
  const instructions = mode === "recipes"
    ? "Suggest 2 practical recipes using as many pantry ingredients as possible. For each, include a title, ingredients with amounts, short steps, estimated calories and protein per serving, and a short shopping list for missing items. Clearly label nutrition as estimates."
    : mode === "workout"
      ? "Recommend a balanced, beginner-friendly workout based on the user's request. Include exercises, sets or duration, primary muscle groups, a cautious calorie-burn range, and a recovery or safety note. Calorie burn is only an estimate."
      : "Be a supportive, practical food and fitness tracking assistant. Use the user's logged data when useful, avoid inventing logged facts, and keep estimates clearly labeled. Do not diagnose, prescribe restrictive diets, or present calorie needs as medical advice.";
  const messages = [
    { role: "system" as const, content: `You are Goodday, a supportive diet and fitness assistant. ${instructions}\n${context}\nProvide concise, readable plain text. This is general wellness information, not medical advice.` },
    ...(mode === "chat" ? priorMessages.results.reverse() : []),
    { role: "user" as const, content: message },
  ];
  const result = await env.AI.run(MODEL, { messages });
  const answer = typeof result === "string"
    ? result
    : "response" in result && typeof result.response === "string"
      ? result.response
      : "";
  if (!answer.trim()) throw new Error("The AI assistant returned an empty response.");
  if (mode === "chat") {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'user', ?)")
        .bind(crypto.randomUUID(), userId, message),
      env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'assistant', ?)")
        .bind(crypto.randomUUID(), userId, answer),
      env.DB.prepare(
        `DELETE FROM chat_history WHERE user_id = ? AND id NOT IN
         (SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 40)`,
      ).bind(userId, userId),
    ]);
  }
  return json({ answer });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/state") {
        const userId = url.searchParams.get("userId");
        if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
        return await state(env.DB, userId);
      }

      if (request.method === "GET" && url.pathname === "/api/history") {
        const userId = url.searchParams.get("userId");
        if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
        await ensureProfile(env.DB, userId);
        const entries = await env.DB.prepare(
          `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
           FROM entries
           WHERE user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
           ORDER BY created_at DESC`,
        ).bind(userId).all();
        return json({ entries: entries.results });
      }

      if (request.method === "POST" && url.pathname === "/api/entries") {
        return await saveEntry(env.DB, await bodyOf<EntryInput>(request));
      }

      if (request.method === "POST" && url.pathname === "/api/pantry") {
        const input = await bodyOf<{ userId: string; ingredients: unknown }>(request);
        if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
        if (!Array.isArray(input.ingredients) || input.ingredients.length > 50) {
          return json({ error: "Provide up to 50 pantry ingredients." }, 400);
        }
        const ingredients = [...new Set(input.ingredients
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 80))
          .filter(Boolean))];
        await ensureProfile(env.DB, input.userId);
        const statements = [
          env.DB.prepare("DELETE FROM pantry WHERE user_id = ?").bind(input.userId),
          ...ingredients.map((ingredient) =>
            env.DB.prepare("INSERT INTO pantry (user_id, ingredient) VALUES (?, ?)").bind(input.userId, ingredient)),
        ];
        await env.DB.batch(statements);
        return json({ ok: true, ingredients });
      }

      if (request.method === "POST" && url.pathname === "/api/goals") {
        const input = await bodyOf<{ userId: string; calories: unknown; protein: unknown }>(request);
        if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
        const calories = boundedNumber(input.calories, "Calorie goal", 10000);
        const protein = boundedNumber(input.protein, "Protein goal", 1000);
        if (calories < 500 || protein < 10) return json({ error: "Goals are below the allowed minimum." }, 400);
        await ensureProfile(env.DB, input.userId);
        await env.DB.prepare("UPDATE profiles SET calorie_goal = ?, protein_goal = ? WHERE user_id = ?")
          .bind(Math.round(calories), Math.round(protein), input.userId).run();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/assistant") {
        const input = await bodyOf<{ userId: string; message: string; mode?: string }>(request);
        if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
        if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) {
          return json({ error: "Message must be 1–2,000 characters." }, 400);
        }
        const mode = input.mode ?? "chat";
        if (mode !== "chat" && mode !== "recipes" && mode !== "workout") {
          return json({ error: "Unsupported assistant mode." }, 400);
        }
        return await assistant(env, input.userId, input.message.trim(), mode);
      }

      return json({ error: "API route not found." }, 404);
    } catch (error) {
      console.error("API request failed", error);
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
