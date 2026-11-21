import type {
  AssistantMode,
  AssistantResponse,
  EstimateResponse,
  EntryType,
  ExerciseEstimate,
  HistoryResponse,
  MealEstimate,
  PantryResponse,
  StateResponse,
} from "./types";
import { state } from "./state";
import { userId } from "./user";

interface EntryForm {
  title: string;
  detail: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  muscleGroups?: string;
}

interface GoalsForm {
  calories: number;
  protein: number;
}

export function estimateMeal(title: string, detail: string): Promise<EstimateResponse<MealEstimate>> {
  return request("/api/estimate", {
    method: "POST",
    body: JSON.stringify({ userId, type: "meal", title, detail }),
  });
}

export function estimateExercise(title: string, detail: string): Promise<EstimateResponse<ExerciseEstimate>> {
  return request("/api/estimate", {
    method: "POST",
    body: JSON.stringify({ userId, type: "exercise", title, detail }),
  });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data
      ? String(data.error)
      : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

export function loadState(): Promise<StateResponse> {
  return request(`/api/state?userId=${encodeURIComponent(userId)}`);
}

export function loadHistory(): Promise<HistoryResponse> {
  return request(`/api/history?userId=${encodeURIComponent(userId)}`);
}

export function createEntry(fields: EntryForm, type: EntryType): Promise<{ ok: boolean }> {
  return request("/api/entries", {
    method: "POST",
    body: JSON.stringify({ ...fields, userId, type }),
  });
}

export function updatePantry(ingredients: string[]): Promise<PantryResponse> {
  return request("/api/pantry", {
    method: "POST",
    body: JSON.stringify({ userId, ingredients }),
  });
}

export function updateGoals(goals: GoalsForm): Promise<{ ok: boolean }> {
  return request("/api/goals", {
    method: "POST",
    body: JSON.stringify({ userId, ...goals }),
  });
}

export function sendAssistantMessage(message: string, mode: AssistantMode): Promise<AssistantResponse> {
  return request("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ userId, message, mode }),
  });
}

export function updateState(data: StateResponse): void {
  state.entries = data.entries;
  state.pantry = data.pantry;
  state.goals = data.goals;
  state.messages = data.messages;
}
