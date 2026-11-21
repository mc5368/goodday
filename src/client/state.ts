import type { TrackerState } from "./types";

export const state: TrackerState = {
  entries: [],
  history: [],
  pantry: [],
  goals: { calories: 2000, protein: 120 },
  messages: [],
};

export function number(value: number | string | null | undefined): number {
  return Number(value || 0);
}
