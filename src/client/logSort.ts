import { elements } from "./dom";

export type LogSortOrder = "newest" | "oldest";

const STORAGE_KEY = "goodday-log-sort-order";

export function logSortOrder(): LogSortOrder {
  return localStorage.getItem(STORAGE_KEY) === "oldest" ? "oldest" : "newest";
}

export function sortEntriesByTime<T extends { created_at: string }>(entries: T[]): T[] {
  const direction = logSortOrder() === "newest" ? -1 : 1;
  return [...entries].sort((first, second) => direction * first.created_at.localeCompare(second.created_at));
}

export function initializeLogSorting(): void {
  const controls = elements<HTMLElement>("[data-log-sort]");
  controls.forEach((item) => {
    if (!(item instanceof HTMLSelectElement)) throw new Error("A log time sort control is invalid.");
    const control = item;
    control.value = logSortOrder();
    control.addEventListener("change", () => {
      const selected = control.value === "oldest" ? "oldest" : "newest";
      localStorage.setItem(STORAGE_KEY, selected);
      controls.forEach((other) => {
        if (other instanceof HTMLSelectElement) other.value = selected;
      });
      window.dispatchEvent(new Event("goodday:log-sort-changed"));
    });
  });
}
