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

// src/routes/estimates.ts
var MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var MAX_DESCRIPTION_LENGTH = 500;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord, "isRecord");
function responsePayload(result) {
  if (typeof result === "string") return result;
  if (!isRecord(result)) return void 0;
  if (typeof result.response === "string" && result.response.trim()) return result.response;
  const completion = isRecord(result.response) ? result.response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : void 0;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : void 0;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  if (firstChoice && typeof firstChoice.text === "string" && firstChoice.text.trim()) return firstChoice.text;
  const toolCalls2 = Array.isArray(result.tool_calls) ? result.tool_calls : Array.isArray(completion.tool_calls) ? completion.tool_calls : message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCall = isRecord(toolCalls2[0]) ? toolCalls2[0] : void 0;
  if (toolCall) {
    if (toolCall.arguments !== void 0) return toolCall.arguments;
    if (isRecord(toolCall.function)) return toolCall.function.arguments;
  }
  return isRecord(result.response) ? result.response : void 0;
}
__name(responsePayload, "responsePayload");
function responseDiagnostics(result) {
  if (typeof result === "string") return { kind: "string", length: result.length };
  if (!isRecord(result)) return { kind: result === null ? "null" : typeof result };
  const response = result.response;
  const completion = isRecord(response) ? response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : void 0;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : void 0;
  return {
    kind: "object",
    keys: Object.keys(result),
    responseType: typeof response,
    responseLength: typeof response === "string" ? response.length : void 0,
    responseKeys: isRecord(response) ? Object.keys(response) : void 0,
    choiceCount: choices.length,
    choiceFinishReason: firstChoice && typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : void 0,
    messageKeys: message ? Object.keys(message) : void 0,
    contentType: message ? typeof message.content : void 0,
    contentLength: message && typeof message.content === "string" ? message.content.length : void 0,
    toolCallCount: Array.isArray(result.tool_calls) ? result.tool_calls.length : Array.isArray(completion.tool_calls) ? completion.tool_calls.length : message && Array.isArray(message.tool_calls) ? message.tool_calls.length : 0
  };
}
__name(responseDiagnostics, "responseDiagnostics");
function parseEstimate(response) {
  if (isRecord(response)) return response;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("The AI estimator returned an empty response.");
  }
  const text = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("Estimate must be a JSON object.");
    return parsed;
  } catch (error) {
    console.error("AI estimate response was not valid JSON", error);
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        const parsed = JSON.parse(text.slice(objectStart, objectEnd + 1));
        if (isRecord(parsed)) return parsed;
      } catch {
        throw new Error("The AI estimator returned data that could not be read. Please try again.");
      }
    }
    throw new Error("The AI estimator returned data that could not be read. Please try again.");
  }
}
__name(parseEstimate, "parseEstimate");
function field(value, ...names) {
  for (const name of names) {
    if (value[name] !== void 0 && value[name] !== null && value[name] !== "") return value[name];
  }
  return void 0;
}
__name(field, "field");
function estimateNumber(value, name, maximum) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(/,/g, "")) : Number.NaN;
  if (!Number.isFinite(parsed)) return void 0;
  try {
    return Math.round(boundedNumber(parsed, name, maximum) * 10) / 10;
  } catch {
    return void 0;
  }
}
__name(estimateNumber, "estimateNumber");
function estimateNotes(value, missing) {
  const notes = typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : "Portion and nutrient values are approximate.";
  return missing.length ? `${notes} No estimate was returned for ${missing.join(", ")}; those fields are set to 0.` : notes;
}
__name(estimateNotes, "estimateNotes");
function validateMealEstimate(value) {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.toLowerCase().replace(/[^a-z]/g, ""), item])
  );
  const specs = [
    { key: "calories", aliases: ["calories", "calorie", "kcal"], maximum: 1e4 },
    { key: "protein", aliases: ["protein", "proteing", "proteingrams"], maximum: 1e3 },
    { key: "carbs", aliases: ["carbs", "carbohydrates", "carbohydrate", "carbsg"], maximum: 1e3 },
    { key: "fat", aliases: ["fat", "totalfat", "fatg"], maximum: 1e3 },
    { key: "fiber", aliases: ["fiber", "fibre", "fiberg", "fibreg"], maximum: 1e3 }
  ];
  const values = Object.fromEntries(specs.map(({ key, aliases, maximum }) => [
    key,
    estimateNumber(field(normalized, ...aliases), key, maximum)
  ]));
  const missing = specs.filter(({ key }) => values[key] === void 0).map(({ key }) => key);
  const note = field(normalized, "notes", "assumptions");
  return {
    calories: Math.round(values.calories ?? 0),
    protein: values.protein ?? 0,
    carbs: values.carbs ?? 0,
    fat: values.fat ?? 0,
    fiber: values.fiber ?? 0,
    notes: estimateNotes(note, missing)
  };
}
__name(validateMealEstimate, "validateMealEstimate");
function validateExerciseEstimate(value) {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.toLowerCase().replace(/[^a-z]/g, ""), item])
  );
  const calories = estimateNumber(field(normalized, "calories", "calorie", "kcal"), "calories", 1e4);
  const muscleGroups = field(normalized, "musclegroups", "muscles", "areas");
  const missing = [
    ...calories === void 0 ? ["calories"] : [],
    ...typeof muscleGroups !== "string" || !muscleGroups.trim() ? ["muscle groups"] : []
  ];
  return {
    calories: Math.round(calories ?? 0),
    muscleGroups: typeof muscleGroups === "string" ? muscleGroups.trim().slice(0, 160) : "",
    notes: estimateNotes(field(normalized, "notes", "assumptions"), missing)
  };
}
__name(validateExerciseEstimate, "validateExerciseEstimate");
async function estimateMeal(env, title, detail) {
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: "Estimate nutrition for the food and portion. Treat stated quantities as authoritative; if absent, use one typical serving and explain the assumption. Return a JSON object with numeric calories, protein, carbs, fat, fiber (grams except calories), and notes. Include all five fields even if a value is 0. Estimates are approximate, not medical advice."
      },
      { role: "user", content: `Food: ${title}
Portion or ingredients: ${detail || "not specified; estimate one typical serving"}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 250
  });
  const payload = responsePayload(result);
  if (payload === void 0 || payload === "") {
    console.error("Workers AI returned no meal estimate payload", responseDiagnostics(result));
  }
  return validateMealEstimate(parseEstimate(payload));
}
__name(estimateMeal, "estimateMeal");
async function estimateExercise(env, title, detail) {
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: "Estimate calories burned and primary muscle groups or areas for the activity. Treat provided duration and intensity as authoritative; if duration is absent assume a typical 30-minute session and state that. Do not invent body weight or other personal data. Return only a JSON object with numeric calories in kcal, muscleGroups as a short string, and notes. These are approximate estimates."
      },
      { role: "user", content: `Activity: ${title}
Duration or intensity: ${detail || "not specified; estimate a typical 30-minute session"}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 150
  });
  const payload = responsePayload(result);
  if (payload === void 0 || payload === "") {
    console.error("Workers AI returned no exercise estimate payload", responseDiagnostics(result));
  }
  return validateExerciseEstimate(parseEstimate(payload));
}
__name(estimateExercise, "estimateExercise");
async function estimateEntryValues(env, type, title, detail) {
  return type === "meal" ? estimateMeal(env, title, detail) : estimateExercise(env, title, detail);
}
__name(estimateEntryValues, "estimateEntryValues");
async function estimateEntry(env, input) {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (input.type !== "meal" && input.type !== "exercise") return json({ error: "Entry type must be meal or exercise." }, 400);
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 100) {
    return json({ error: "A food or activity name of 1\u2013100 characters is required." }, 400);
  }
  if (input.detail !== void 0 && (typeof input.detail !== "string" || input.detail.length > MAX_DESCRIPTION_LENGTH)) {
    return json({ error: "Portion or activity details must be at most 500 characters." }, 400);
  }
  const title = input.title.trim();
  const detail = typeof input.detail === "string" ? input.detail.trim() : "";
  let estimate;
  try {
    estimate = await estimateEntryValues(env, input.type, title, detail);
  } catch (error) {
    console.error("Workers AI estimate failed", {
      model: MODEL,
      type: input.type,
      error: error instanceof Error ? error.message : "Unknown AI error"
    });
    throw error;
  }
  return json({ estimate });
}
__name(estimateEntry, "estimateEntry");
async function handleEstimate(request, env) {
  return estimateEntry(env, await bodyOf(request));
}
__name(handleEstimate, "handleEstimate");

// src/routes/assistant.ts
var MODEL2 = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var LOG_ENTRY_TOOL = {
  name: "log_entry",
  description: "Save one food or exercise session to the user's log. Use only when the user explicitly asks to add, log, track, or record it. The title must name the specific food or activity, not a generic label such as 'snack' or 'workout'. Put portion, ingredients, duration, or intensity in detail.",
  parameters: {
    type: "object",
    required: ["type", "title"],
    properties: {
      type: { type: "string", enum: ["meal", "exercise"], description: "Use meal for food or exercise for an activity." },
      title: { type: "string", description: "Short name for the meal, snack, or activity." },
      detail: { type: "string", description: "Meal ingredients and portion, or exercise duration and intensity, if provided by the user." }
    }
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord2, "isRecord");
function responseText(result) {
  if (typeof result === "string") return result;
  if (!isRecord2(result)) return "";
  if (typeof result.response === "string") return result.response;
  const completion = isRecord2(result.response) ? result.response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const choice = isRecord2(choices[0]) ? choices[0] : void 0;
  const message = choice && isRecord2(choice.message) ? choice.message : void 0;
  if (message && typeof message.content === "string") return message.content;
  return choice && typeof choice.text === "string" ? choice.text : "";
}
__name(responseText, "responseText");
function requestsEntryLogging(message) {
  return /\b(?:can|could|would)\s+you\b.*\b(?:log|add|track|record|save)\b/i.test(message) || /\bplease\b.*\b(?:log|add|track|record|save)\b/i.test(message) || /\b(?:log|add|track|record|save)\s+(?:a|an|the|this|that|it|my|one|some)\b/i.test(message) || /\bi\s+(?:want|need|would like)\s+to\s+(?:log|add|track|record|save)\b/i.test(message) || /\b(?:put|save)\b.*\b(?:in|to)\s+my\s+(?:food|meal|movement|exercise)?\s*log\b/i.test(message) || /\bi\s+(?:ate|had|did|completed)\b.*\b(?:please|can you|could you|log|add|track|record|save)\b/i.test(message);
}
__name(requestsEntryLogging, "requestsEntryLogging");
function toolCalls(result) {
  if (!isRecord2(result)) return [];
  const completion = isRecord2(result.response) ? result.response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const choice = isRecord2(choices[0]) ? choices[0] : void 0;
  const message = choice && isRecord2(choice.message) ? choice.message : void 0;
  const calls = Array.isArray(result.tool_calls) ? result.tool_calls : Array.isArray(completion.tool_calls) ? completion.tool_calls : message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return calls.filter(isRecord2).flatMap((call) => {
    const fn = isRecord2(call.function) ? call.function : call;
    const name = typeof call.name === "string" ? call.name : fn.name;
    const args = call.arguments !== void 0 ? call.arguments : fn.arguments;
    return typeof name === "string" && args !== void 0 ? [{ name, arguments: args }] : [];
  });
}
__name(toolCalls, "toolCalls");
function toolArguments(value) {
  if (isRecord2(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (isRecord2(parsed)) return parsed;
    } catch {
      throw new Error("The assistant returned invalid log-entry arguments.");
    }
  }
  throw new Error("The assistant did not provide valid log-entry arguments.");
}
__name(toolArguments, "toolArguments");
function responseObject(result) {
  if (!isRecord2(result)) return void 0;
  if (isRecord2(result.response)) return result.response;
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const choice = isRecord2(choices[0]) ? choices[0] : void 0;
  const message = choice && isRecord2(choice.message) ? choice.message : void 0;
  const content = message?.content ?? choice?.text;
  if (isRecord2(content)) return content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return isRecord2(parsed) ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  if (typeof result.response === "string") {
    try {
      const parsed = JSON.parse(result.response);
      return isRecord2(parsed) ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  return void 0;
}
__name(responseObject, "responseObject");
async function extractLogEntry(env, message) {
  const result = await env.AI.run(MODEL2, {
    messages: [
      {
        role: "system",
        content: "Extract exactly one food or exercise entry that the user explicitly asked to log. Return a JSON object with type ('meal' or 'exercise'), title (the specific food or activity, never a generic category such as 'snack' or 'workout'), and detail (only portion, ingredients, duration, or intensity the user actually provided; otherwise an empty string). Do not invent missing details. If the user did not name a specific food or activity, return empty title."
      },
      { role: "user", content: message }
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 160
  });
  const extracted = responseObject(result);
  if (!extracted || extracted.type !== "meal" && extracted.type !== "exercise") {
    throw new Error("The coach couldn't identify whether to log a meal or an exercise. Please specify what you ate or did.");
  }
  const title = typeof extracted.title === "string" ? extracted.title.trim() : "";
  const detail = typeof extracted.detail === "string" ? extracted.detail.trim() : "";
  if (!title || /^(meal|food|snack|breakfast|lunch|dinner|exercise|workout|activity|movement)$/i.test(title)) {
    throw new Error("The coach needs the specific food or activity before it can log the entry.");
  }
  return { type: extracted.type, title, detail };
}
__name(extractLogEntry, "extractLogEntry");
async function saveChatTurn(env, userId, userMessage, assistantMessage) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'user', ?)").bind(crypto.randomUUID(), userId, userMessage),
    env.DB.prepare("INSERT INTO chat_history (id, user_id, role, content) VALUES (?, ?, 'assistant', ?)").bind(crypto.randomUUID(), userId, assistantMessage),
    env.DB.prepare(
      `DELETE FROM chat_history WHERE user_id = ? AND id NOT IN
       (SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 40)`
    ).bind(userId, userId)
  ]);
}
__name(saveChatTurn, "saveChatTurn");
async function executeLogEntry(env, userId, args) {
  const parsed = toolArguments(args);
  if (parsed.type !== "meal" && parsed.type !== "exercise") {
    throw new Error("The assistant chose an invalid log type. Nothing was saved.");
  }
  if (typeof parsed.title !== "string" || !parsed.title.trim() || parsed.title.length > 100) {
    throw new Error("The assistant did not provide a valid entry title. Nothing was saved.");
  }
  if (parsed.detail !== void 0 && (typeof parsed.detail !== "string" || parsed.detail.length > 500)) {
    throw new Error("The assistant returned invalid entry details. Nothing was saved.");
  }
  const type = parsed.type;
  const title = parsed.title.trim();
  const detail = typeof parsed.detail === "string" ? parsed.detail.trim() : "";
  const estimate = await estimateEntryValues(env, type, title, detail);
  const input = { userId, type, title, detail, ...estimate };
  const saved = await saveEntry(env.DB, input);
  if (!saved.ok) {
    const result = await saved.json();
    throw new Error(result.error ?? "The entry could not be saved.");
  }
  return "protein" in estimate ? `Logged ${title} in your food log with AI-estimated nutrition: ${estimate.calories} kcal, ${estimate.protein}g protein, ${estimate.carbs}g carbs, ${estimate.fat}g fat, and ${estimate.fiber}g fiber. These are approximate; you can review or edit the entry in your food log.` : `Logged ${title} in your movement log: about ${estimate.calories} kcal and ${estimate.muscleGroups || "no muscle groups identified"}. This is an approximate estimate.`;
}
__name(executeLogEntry, "executeLogEntry");
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
When the user explicitly asks to log or add a meal, snack, or exercise, call log_entry. For the title, use the specific food or activity the user named (for example, 'medium banana' or 'brisk walk'), not a generic category such as 'snack' or 'workout'; preserve portions, duration, and intensity in detail. Never claim an entry was saved unless the server confirms the tool completed. Never claim to have changed data without a successful tool call. If no logging tool is called, do not imply that anything was saved. Nutrition and activity estimates are approximate, not medical advice.`
    },
    ...mode === "chat" ? priorMessages.results.reverse() : [],
    { role: "user", content: message }
  ];
  const result = await env.AI.run(MODEL2, {
    messages,
    ...mode === "chat" ? { tools: [LOG_ENTRY_TOOL] } : {},
    temperature: 0.3,
    max_tokens: 512
  });
  const calls = mode === "chat" ? toolCalls(result) : [];
  if (calls.length > 1) throw new Error("Please ask the coach to log one entry at a time.");
  if (calls.length === 1) {
    const [call] = calls;
    if (call.name !== LOG_ENTRY_TOOL.name) {
      throw new Error(`The assistant requested an unsupported action: ${call.name}. Nothing was saved.`);
    }
    return { answer: await executeLogEntry(env, userId, call.arguments), loggedEntry: true };
  }
  if (mode === "chat" && requestsEntryLogging(message)) {
    const extracted = await extractLogEntry(env, message);
    return { answer: await executeLogEntry(env, userId, extracted), loggedEntry: true };
  }
  const answer = responseText(result);
  if (!answer.trim()) throw new Error("The AI assistant returned no text or supported action.");
  return { answer, loggedEntry: false };
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
  const result = await generateAnswer(env, userId, message, mode);
  if (mode === "chat") {
    try {
      await saveChatTurn(env, userId, message, result.answer);
    } catch (error) {
      console.error("Could not save chat history after completing the response", error);
    }
  }
  return json({ answer: result.answer, loggedEntry: result.loggedEntry });
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
    if (request.method === "GET" && pathname === "/api/state") return await readState(request, env.DB);
    if (request.method === "GET" && pathname === "/api/history") return await readHistory(request, env.DB);
    if (request.method === "POST" && pathname === "/api/entries") {
      return await saveEntry(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/pantry") {
      return await savePantry(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/goals") {
      return await saveGoals(env.DB, await bodyOf(request));
    }
    if (request.method === "POST" && pathname === "/api/assistant") {
      return await handleAssistant(request, env);
    }
    if (request.method === "POST" && pathname === "/api/estimate") {
      return await handleEstimate(request, env);
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

// .wrangler/tmp/bundle-BeqRba/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-BeqRba/middleware-loader.entry.ts
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
