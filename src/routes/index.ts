import { bodyOf, json } from "../lib/http";
import { saveEntry } from "./entries";
import { handleAssistant } from "./assistant";
import { handleEstimate } from "./estimates";
import { saveGoals, savePantry } from "./preferences";
import { readHistory, readState } from "./state";
import type { Env, EntryInput, GoalsInput, PantryInput } from "../types";

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    if (request.method === "GET" && pathname === "/api/state") return await readState(request, env.DB);
    if (request.method === "GET" && pathname === "/api/history") return await readHistory(request, env.DB);
    if (request.method === "POST" && pathname === "/api/entries") {
      return await saveEntry(env.DB, await bodyOf<EntryInput>(request));
    }
    if (request.method === "POST" && pathname === "/api/pantry") {
      return await savePantry(env.DB, await bodyOf<PantryInput>(request));
    }
    if (request.method === "POST" && pathname === "/api/goals") {
      return await saveGoals(env.DB, await bodyOf<GoalsInput>(request));
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
