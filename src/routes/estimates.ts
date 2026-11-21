import { bodyOf, boundedNumber, json, validUserId } from "../lib/http";
import type {
  Env,
  EstimateInput,
  ExerciseEstimate,
  MealEstimate,
} from "../types";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_DESCRIPTION_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responsePayload(result: unknown): unknown {
  if (typeof result === "string") return result;
  if (!isRecord(result)) return undefined;
  if (typeof result.response === "string" && result.response.trim()) return result.response;
  const completion = isRecord(result.response) ? result.response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : undefined;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : undefined;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  if (firstChoice && typeof firstChoice.text === "string" && firstChoice.text.trim()) return firstChoice.text;

  const toolCalls = Array.isArray(result.tool_calls)
    ? result.tool_calls
    : Array.isArray(completion.tool_calls)
      ? completion.tool_calls
      : message && Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];
  const toolCall = isRecord(toolCalls[0]) ? toolCalls[0] : undefined;
  if (toolCall) {
    if (toolCall.arguments !== undefined) return toolCall.arguments;
    if (isRecord(toolCall.function)) return toolCall.function.arguments;
  }
  return isRecord(result.response) ? result.response : undefined;
}

function responseDiagnostics(result: unknown): Record<string, unknown> {
  if (typeof result === "string") return { kind: "string", length: result.length };
  if (!isRecord(result)) return { kind: result === null ? "null" : typeof result };
  const response = result.response;
  const completion = isRecord(response) ? response : result;
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : undefined;
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : undefined;
  return {
    kind: "object",
    keys: Object.keys(result),
    responseType: typeof response,
    responseLength: typeof response === "string" ? response.length : undefined,
    responseKeys: isRecord(response) ? Object.keys(response) : undefined,
    choiceCount: choices.length,
    choiceFinishReason: firstChoice && typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : undefined,
    messageKeys: message ? Object.keys(message) : undefined,
    contentType: message ? typeof message.content : undefined,
    contentLength: message && typeof message.content === "string" ? message.content.length : undefined,
    toolCallCount: Array.isArray(result.tool_calls)
      ? result.tool_calls.length
      : Array.isArray(completion.tool_calls)
        ? completion.tool_calls.length
        : message && Array.isArray(message.tool_calls)
          ? message.tool_calls.length
          : 0,
  };
}

function parseEstimate<T>(response: unknown): T {
  if (isRecord(response)) return response as T;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("The AI estimator returned an empty response.");
  }
  const text = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("Estimate must be a JSON object.");
    return parsed as T;
  } catch (error) {
    console.error("AI estimate response was not valid JSON", error);
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        const parsed: unknown = JSON.parse(text.slice(objectStart, objectEnd + 1));
        if (isRecord(parsed)) return parsed as T;
      } catch {
        throw new Error("The AI estimator returned data that could not be read. Please try again.");
      }
    }
    throw new Error("The AI estimator returned data that could not be read. Please try again.");
  }
}

function field(value: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (value[name] !== undefined && value[name] !== null && value[name] !== "") return value[name];
  }
  return undefined;
}

function estimateNumber(value: unknown, name: string, maximum: number): number | undefined {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.replace(/,/g, ""))
      : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  try {
    return Math.round(boundedNumber(parsed, name, maximum) * 10) / 10;
  } catch {
    return undefined;
  }
}

function estimateNotes(value: unknown, missing: string[]): string {
  const notes = typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : "Portion and nutrient values are approximate.";
  return missing.length ? `${notes} No estimate was returned for ${missing.join(", ")}; those fields are set to 0.` : notes;
}

function validateMealEstimate(value: MealEstimate): MealEstimate {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.toLowerCase().replace(/[^a-z]/g, ""), item]),
  );
  const specs = [
    { key: "calories", aliases: ["calories", "calorie", "kcal"], maximum: 10000 },
    { key: "protein", aliases: ["protein", "proteing", "proteingrams"], maximum: 1000 },
    { key: "carbs", aliases: ["carbs", "carbohydrates", "carbohydrate", "carbsg"], maximum: 1000 },
    { key: "fat", aliases: ["fat", "totalfat", "fatg"], maximum: 1000 },
    { key: "fiber", aliases: ["fiber", "fibre", "fiberg", "fibreg"], maximum: 1000 },
  ] as const;
  const values = Object.fromEntries(specs.map(({ key, aliases, maximum }) => [
    key,
    estimateNumber(field(normalized, ...aliases), key, maximum),
  ])) as Record<(typeof specs)[number]["key"], number | undefined>;
  const missing = specs.filter(({ key }) => values[key] === undefined).map(({ key }) => key);
  const note = field(normalized, "notes", "assumptions");
  return {
    calories: Math.round(values.calories ?? 0),
    protein: values.protein ?? 0,
    carbs: values.carbs ?? 0,
    fat: values.fat ?? 0,
    fiber: values.fiber ?? 0,
    notes: estimateNotes(note, missing),
  };
}

function validateExerciseEstimate(value: ExerciseEstimate): ExerciseEstimate {
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.toLowerCase().replace(/[^a-z]/g, ""), item]),
  );
  const calories = estimateNumber(field(normalized, "calories", "calorie", "kcal"), "calories", 10000);
  const muscleGroups = field(normalized, "musclegroups", "muscles", "areas");
  const missing = [
    ...(calories === undefined ? ["calories"] : []),
    ...(typeof muscleGroups !== "string" || !muscleGroups.trim() ? ["muscle groups"] : []),
  ];
  return {
    calories: Math.round(calories ?? 0),
    muscleGroups: typeof muscleGroups === "string" ? muscleGroups.trim().slice(0, 160) : "",
    notes: estimateNotes(field(normalized, "notes", "assumptions"), missing),
  };
}

async function estimateMeal(env: Env, title: string, detail: string): Promise<MealEstimate> {
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: "Estimate nutrition for the food and portion. Treat stated quantities as authoritative; if absent, use one typical serving and explain the assumption. Return a JSON object with numeric calories, protein, carbs, fat, fiber (grams except calories), and notes. Include all five fields even if a value is 0. Estimates are approximate, not medical advice.",
      },
      { role: "user", content: `Food: ${title}\nPortion or ingredients: ${detail || "not specified; estimate one typical serving"}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 250,
  });
  const payload = responsePayload(result);
  if (payload === undefined || payload === "") {
    console.error("Workers AI returned no meal estimate payload", responseDiagnostics(result));
  }
  return validateMealEstimate(parseEstimate<MealEstimate>(payload));
}

async function estimateExercise(env: Env, title: string, detail: string): Promise<ExerciseEstimate> {
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: "Estimate calories burned and primary muscle groups or areas for the activity. Treat provided duration and intensity as authoritative; if duration is absent assume a typical 30-minute session and state that. Do not invent body weight or other personal data. Return only a JSON object with numeric calories in kcal, muscleGroups as a short string, and notes. These are approximate estimates.",
      },
      { role: "user", content: `Activity: ${title}\nDuration or intensity: ${detail || "not specified; estimate a typical 30-minute session"}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 150,
  });
  const payload = responsePayload(result);
  if (payload === undefined || payload === "") {
    console.error("Workers AI returned no exercise estimate payload", responseDiagnostics(result));
  }
  return validateExerciseEstimate(parseEstimate<ExerciseEstimate>(payload));
}

export async function estimateEntryValues(
  env: Env,
  type: "meal" | "exercise",
  title: string,
  detail: string,
): Promise<MealEstimate | ExerciseEstimate> {
  return type === "meal"
    ? estimateMeal(env, title, detail)
    : estimateExercise(env, title, detail);
}

export async function estimateEntry(env: Env, input: EstimateInput): Promise<Response> {
  if (!validUserId(input.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (input.type !== "meal" && input.type !== "exercise") return json({ error: "Entry type must be meal or exercise." }, 400);
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 100) {
    return json({ error: "A food or activity name of 1–100 characters is required." }, 400);
  }
  if (input.detail !== undefined && (typeof input.detail !== "string" || input.detail.length > MAX_DESCRIPTION_LENGTH)) {
    return json({ error: "Portion or activity details must be at most 500 characters." }, 400);
  }
  const title = input.title.trim();
  const detail = typeof input.detail === "string" ? input.detail.trim() : "";
  let estimate: MealEstimate | ExerciseEstimate;
  try {
    estimate = await estimateEntryValues(env, input.type, title, detail);
  } catch (error) {
    console.error("Workers AI estimate failed", {
      model: MODEL,
      type: input.type,
      error: error instanceof Error ? error.message : "Unknown AI error",
    });
    throw error;
  }
  return json({ estimate });
}

export async function handleEstimate(request: Request, env: Env): Promise<Response> {
  return estimateEntry(env, await bodyOf<EstimateInput>(request));
}
