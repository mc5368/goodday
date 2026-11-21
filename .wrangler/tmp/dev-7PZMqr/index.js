var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/http.ts
var jsonHeaders = { "content-type": "application/json; charset=utf-8" };
function json(data, status = 200) {
  return Response.json(data, { status, headers: jsonHeaders });
}
__name(json, "json");
function validUserId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}
__name(validUserId, "validUserId");
function boundedNumber(value, name, maximum) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be between 0 and ${maximum}.`);
  }
  return parsed;
}
__name(boundedNumber, "boundedNumber");
async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
__name(bodyOf, "bodyOf");

// src/lib/profiles.ts
async function ensureProfile(db, userId) {
  await db.prepare("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)").bind(userId).run();
}
__name(ensureProfile, "ensureProfile");

// src/routes/entries.ts
async function saveEntry(db, input) {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (input.type !== "meal" && input.type !== "exercise") {
    return json({ error: "Entry type must be meal or exercise." }, 400);
  }
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 100) : "";
  if (!title) return json({ error: "A title is required." }, 400);
  const detail = typeof input.detail === "string" ? input.detail.trim().slice(0, 500) : "";
  const muscleGroups = typeof input.muscleGroups === "string" ? input.muscleGroups.trim().slice(0, 160) : "";
  let calories;
  let protein;
  let carbs;
  let fat;
  let fiber;
  try {
    calories = boundedNumber(input.calories, "Calories", 1e4);
    protein = boundedNumber(input.protein, "Protein", 1e3);
    carbs = boundedNumber(input.carbs, "Carbohydrates", 1e3);
    fat = boundedNumber(input.fat, "Fat", 1e3);
    fiber = boundedNumber(input.fiber, "Fiber", 1e3);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid nutrition values." }, 400);
  }
  await ensureProfile(db, input.userId);
  await db.prepare(
    `INSERT INTO entries
      (id, user_id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    muscleGroups
  ).run();
  return json({ ok: true });
}
__name(saveEntry, "saveEntry");

// src/routes/assistant.ts
var MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
async function generateAnswer(env, userId, message, mode) {
  const [recentEntries, pantryRows, priorMessages] = await Promise.all([
    env.DB.prepare(
      `SELECT type, title, calories, protein, carbs, fat
       FROM entries WHERE user_id = ? AND date(created_at) = date('now')
       ORDER BY created_at DESC LIMIT 12`
    ).bind(userId).all(),
    env.DB.prepare("SELECT ingredient FROM pantry WHERE user_id = ? ORDER BY ingredient").bind(userId).all(),
    mode === "chat" ? env.DB.prepare(
      "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 8"
    ).bind(userId).all() : Promise.resolve({ results: [] })
  ]);
  const mealEntries = recentEntries.results.filter((entry) => entry.type === "meal");
  const totals = mealEntries.reduce(
    (sum, entry) => ({
      calories: sum.calories + Number(entry.calories),
      protein: sum.protein + Number(entry.protein),
      carbs: sum.carbs + Number(entry.carbs),
      fat: sum.fat + Number(entry.fat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const context = [
    `Today's logged entries: ${JSON.stringify(recentEntries.results)}.`,
    `Pantry: ${pantryRows.results.map((row) => row.ingredient).join(", ") || "not provided"}.`,
    `Nutrition totals from logged meals: ${JSON.stringify(totals)}.`
  ].join("\n");
  const instructions = mode === "recipes" ? "Suggest 2 practical recipes using as many pantry ingredients as possible. For each, include a title, ingredients with amounts, short steps, estimated calories and protein per serving, and a short shopping list for missing items. Clearly label nutrition as estimates." : mode === "workout" ? "Recommend a balanced, beginner-friendly workout based on the user's request. Include exercises, sets or duration, primary muscle groups, a cautious calorie-burn range, and a recovery or safety note. Calorie burn is only an estimate." : "Be a supportive, practical food and fitness tracking assistant. Use the user's logged data when useful, avoid inventing logged facts, and keep estimates clearly labeled. Do not diagnose, prescribe restrictive diets, or present calorie needs as medical advice.";
  const messages = [
    {
      role: "system",
      content: `You are Goodday, a supportive diet and fitness assistant. ${instructions}
${context}
Provide concise, readable plain text. This is general wellness information, not medical advice.`
    },
    ...mode === "chat" ? priorMessages.results.reverse() : [],
    { role: "user", content: message }
  ];
  const result = await env.AI.run(MODEL, { messages });
  const answer = typeof result === "string" ? result : "response" in result && typeof result.response === "string" ? result.response : "";
  if (!answer.trim()) throw new Error("The AI assistant returned an empty response.");
  return answer;
}
__name(generateAnswer, "generateAnswer");
async function askAssistant(env, input) {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 2e3) {
    return json({ error: "Message must be 1\u20132,000 characters." }, 400);
  }
  const mode = input.mode ?? "chat";
  if (mode !== "chat" && mode !== "recipes" && mode !== "workout") {
    return json({ error: "Unsupported assistant mode." }, 400);
  }
  const userId = input.userId;
  const message = input.message.trim();
  await ensureProfile(env.DB, userId);
  const answer = await generateAnswer(env, userId, message, mode);
  if (mode === "chat") {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'user', ?)").bind(crypto.randomUUID(), userId, message),
      env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'assistant', ?)").bind(crypto.randomUUID(), userId, answer),
      env.DB.prepare(
        `DELETE FROM chat_history WHERE user_id = ? AND id NOT IN
         (SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 40)`
      ).bind(userId, userId)
    ]);
  }
  return json({ answer });
}
__name(askAssistant, "askAssistant");
async function handleAssistant(request, env) {
  const input = await bodyOf(request);
  return askAssistant(env, input);
}
__name(handleAssistant, "handleAssistant");

// src/routes/preferences.ts
async function savePantry(db, input) {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (!Array.isArray(input.ingredients) || input.ingredients.length > 50) {
    return json({ error: "Provide up to 50 pantry ingredients." }, 400);
  }
  const ingredients = [...new Set(input.ingredients.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean))];
  await ensureProfile(db, input.userId);
  const statements = [
    db.prepare("DELETE FROM pantry WHERE user_id = ?").bind(input.userId),
    ...ingredients.map((ingredient) => db.prepare("INSERT INTO pantry (user_id, ingredient) VALUES (?, ?)").bind(input.userId, ingredient))
  ];
  await db.batch(statements);
  return json({ ok: true, ingredients });
}
__name(savePantry, "savePantry");
async function saveGoals(db, input) {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  const calories = boundedNumber(input.calories, "Calorie goal", 1e4);
  const protein = boundedNumber(input.protein, "Protein goal", 1e3);
  if (calories < 500 || protein < 10) return json({ error: "Goals are below the allowed minimum." }, 400);
  await ensureProfile(db, input.userId);
  await db.prepare("UPDATE profiles SET calorie_goal = ?, protein_goal = ? WHERE user_id = ?").bind(Math.round(calories), Math.round(protein), input.userId).run();
  return json({ ok: true });
}
__name(saveGoals, "saveGoals");

// src/routes/state.ts
async function getState(db, userId) {
  await ensureProfile(db, userId);
  const [profile, entries, ingredients, messages] = await Promise.all([
    db.prepare("SELECT calorie_goal, protein_goal FROM profiles WHERE user_id = ?").bind(userId).first(),
    db.prepare(
      `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
       FROM entries WHERE user_id = ? AND date(created_at) = date('now')
       ORDER BY created_at DESC LIMIT 100`
    ).bind(userId).all(),
    db.prepare("SELECT ingredient FROM pantry WHERE user_id = ? ORDER BY ingredient").bind(userId).all(),
    db.prepare(
      `SELECT role, content FROM
       (SELECT role, content, created_at FROM chat_history WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20)
       ORDER BY created_at ASC`
    ).bind(userId).all()
  ]);
  return json({
    goals: { calories: profile?.calorie_goal ?? 2e3, protein: profile?.protein_goal ?? 120 },
    entries: entries.results,
    pantry: ingredients.results.map((row) => row.ingredient),
    messages: messages.results
  });
}
__name(getState, "getState");
async function getHistory(db, userId) {
  await ensureProfile(db, userId);
  const entries = await db.prepare(
    `SELECT id, type, title, detail, calories, protein, carbs, fat, fiber, muscle_groups, created_at
     FROM entries
     WHERE user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
     ORDER BY created_at DESC`
  ).bind(userId).all();
  return json({ entries: entries.results });
}
__name(getHistory, "getHistory");
async function readState(request, db) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
  return getState(db, userId);
}
__name(readState, "readState");
async function readHistory(request, db) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!validUserId(userId)) return json({ error: "A valid user ID is required." }, 400);
  return getHistory(db, userId);
}
__name(readHistory, "readHistory");

// src/routes/index.ts
async function handleApi(request, env) {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  try {
    if (request.method === "GET" && pathname === "/api/state") return readState(request, env.DB);
    if (request.method === "GET" && pathname === "/api/history") return readHistory(request, env.DB);
    if (request.method === "POST" && pathname === "/api/entries") {
      return saveEntry(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/pantry") {
      return savePantry(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/goals") {
      return saveGoals(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/assistant") {
      return handleAssistant(request, env);
    }
    return json({ error: "API route not found." }, 404);
  } catch (error) {
    console.error("API request failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message }, 500);
  }
}
__name(handleApi, "handleApi");

// src/index.ts
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return handleApi(request, env);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-FyUuMx/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-FyUuMx/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
