import type {
  AssistantMode,
  AssistantResponse,
  EstimateResponse,
  EntryType,
  ExerciseEstimate,
  FitnessProfile,
  HistoryResponse,
  MealEstimate,
  PantryResponse,
  StateResponse,
} from "./types";
import { state } from "./state";

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
    body: JSON.stringify({ type: "meal", title, detail }),
  });
}

export function estimateExercise(title: string, detail: string): Promise<EstimateResponse<ExerciseEstimate>> {
  return request("/api/estimate", {
    method: "POST",
    body: JSON.stringify({ type: "exercise", title, detail }),
  });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json", ...options.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event("goodday:unauthorized"));
    }
    const message = typeof data === "object" && data !== null && "error" in data
      ? String(data.error)
      : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

export function loadState(): Promise<StateResponse> {
  return request("/api/state");
}

export function loadHistory(days = 30): Promise<HistoryResponse> {
  return request(`/api/history?days=${days}`);
}

export function createEntry(fields: EntryForm, type: EntryType): Promise<{ ok: boolean }> {
  return request("/api/entries", {
    method: "POST",
    body: JSON.stringify({ ...fields, type }),
  });
}

export function updatePantry(ingredients: string[]): Promise<PantryResponse> {
  return request("/api/pantry", {
    method: "POST",
    body: JSON.stringify({ ingredients }),
  });
}

export function updateGoals(goals: GoalsForm): Promise<{ ok: boolean }> {
  return request("/api/goals", {
    method: "POST",
    body: JSON.stringify(goals),
  });
}

export function updateFitnessProfile(profile: FitnessProfile): Promise<{ ok: boolean }> {
  return request("/api/fitness-profile", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export function sendAssistantMessage(message: string, mode: AssistantMode): Promise<AssistantResponse> {
  return request("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ message, mode }),
  });
}

export interface AuthSession {
  authenticated: boolean;
  username?: string;
}

export function loadAuthSession(): Promise<AuthSession> {
  return request("/api/auth/session");
}

export function login(username: string, password: string): Promise<AuthSession> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function register(username: string, password: string): Promise<AuthSession> {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<{ ok: boolean }> {
  return request("/api/auth/logout", { method: "POST", body: "{}" });
}

export function updateState(data: StateResponse): void {
  state.entries = data.entries;
  state.pantry = data.pantry;
  state.goals = data.goals;
  state.fitnessProfile = data.fitnessProfile;
  state.messages = data.messages;
}
