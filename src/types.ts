export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
}

export type EntryType = "meal" | "exercise";
export type AssistantMode = "chat" | "recipes" | "workout";

export interface EntryInput {
  userId: string;
  type: EntryType;
  title: string;
  detail?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  muscleGroups?: string;
}

export interface GoalsInput {
  userId: string;
  calories: unknown;
  protein: unknown;
}

export interface PantryInput {
  userId: string;
  ingredients: unknown;
}

export interface AssistantInput {
  userId: string;
  message: string;
  mode?: string;
}

export interface EstimateInput {
  userId: string;
  type: EntryType;
  title: string;
  detail?: string;
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
