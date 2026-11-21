import type { AssistantMode, EntryType } from "../types";

export type { AssistantMode, EntryType };

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  detail: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  muscle_groups: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TrackerState {
  entries: Entry[];
  history: Entry[];
  pantry: string[];
  goals: { calories: number; protein: number };
  messages: ChatMessage[];
}

export interface StateResponse {
  entries: Entry[];
  pantry: string[];
  goals: TrackerState["goals"];
  messages: ChatMessage[];
}

export interface HistoryResponse {
  entries: Entry[];
}

export interface AssistantResponse {
  answer: string;
  loggedEntry?: boolean;
}

export interface PantryResponse {
  ok: boolean;
  ingredients: string[];
}

export interface EstimateResponse<T> {
  estimate: T;
}

export interface MealEstimate {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  notes: string;
}

export interface ExerciseEstimate {
  calories: number;
  muscleGroups: string;
  notes: string;
}
