import { bodyOf, json } from "../lib/http";
import { saveEntry } from "./entries";
import { handleAssistant } from "./assistant";
import { handleEstimate } from "./estimates";
import { saveFitnessProfile, saveGoals, savePantry } from "./preferences";
import { getState, readHistory } from "./state";
import { authenticate, handleAuth } from "./auth";
import type { Env, EntryInput, FitnessProfileInput, GoalsInput, PantryInput } from "../types";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    if (pathname.startsWith("/api/auth/")) {
      const response = await handleAuth(request, env.DB, pathname);
      if (response) return response;
      return json({ error: "API route not found." }, 404);
    }

    if (request.method === "POST") {
      if (!sameOrigin(request)) {
        return json({ error: "Request origin was not accepted." }, 403);
      }
    }
    const userId = await authenticate(request, env.DB);
    if (!userId) return json({ error: "Authentication required." }, 401);

    if (request.method === "GET" && pathname === "/api/state") return await getState(env.DB, userId);
    if (request.method === "GET" && pathname === "/api/history") return await readHistory(request, env.DB, userId);
    if (request.method === "POST" && pathname === "/api/entries") {
      return await saveEntry(env.DB, { ...await bodyOf<EntryInput>(request), userId });
    }
    if (request.method === "POST" && pathname === "/api/pantry") {
      return await savePantry(env.DB, { ...await bodyOf<PantryInput>(request), userId });
    }
    if (request.method === "POST" && pathname === "/api/goals") {
      return await saveGoals(env.DB, { ...await bodyOf<GoalsInput>(request), userId });
    }
    if (request.method === "POST" && pathname === "/api/fitness-profile") {
      return await saveFitnessProfile(env.DB, { ...await bodyOf<FitnessProfileInput>(request), userId });
    }
    if (request.method === "POST" && pathname === "/api/assistant") {
      return await handleAssistant(request, env, userId);
    }
    if (request.method === "POST" && pathname === "/api/estimate") {
      return await handleEstimate(request, env, userId);
    }
    return json({ error: "API route not found." }, 404);
  } catch (error) {
    console.error("API request failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message }, 500);
  }
}
