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

export interface FitnessProfileInput {
  userId: string;
  fitnessGoal: unknown;
  goalDetails: unknown;
  age: unknown;
  genderIdentity: unknown;
  heightCm: unknown;
  weightKg: unknown;
  activityLevel: unknown;
  trainingExperience: unknown;
  targetEvent: unknown;
  targetEventDate: unknown;
  limitations: unknown;
  equipment: unknown;
  preferredActivities: unknown;
}

export interface FitnessProfile {
  fitnessGoal: string;
  goalDetails: string;
  age: number | null;
  genderIdentity: string;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string;
  trainingExperience: string;
  targetEvent: string;
  targetEventDate: string;
  limitations: string;
  equipment: string;
  preferredActivities: string;
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
