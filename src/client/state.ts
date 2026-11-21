import type { FitnessProfile, TrackerState } from "./types";

const emptyFitnessProfile: FitnessProfile = {
  fitnessGoal: "general_fitness",
  goalDetails: "",
  age: null,
  genderIdentity: "",
  heightCm: null,
  weightKg: null,
  activityLevel: "",
  trainingExperience: "",
  targetEvent: "",
  targetEventDate: "",
  limitations: "",
  equipment: "",
  preferredActivities: "",
};

export const state: TrackerState = {
  entries: [],
  history: [],
  pantry: [],
  goals: { calories: 2000, protein: 120 },
  fitnessProfile: { ...emptyFitnessProfile },
  messages: [],
};

export function number(value: number | string | null | undefined): number {
  return Number(value || 0);
}
