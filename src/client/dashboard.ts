import { element, escapeHtml } from "./dom";
import { state, number } from "./state";
import { sortEntriesByTime } from "./logSort";
import type { EntryType } from "./types";

function renderEntries(target: string, type: EntryType): void {
  const entries = sortEntriesByTime(state.entries.filter((entry) => entry.type === type));
  const container = element<HTMLDivElement>(target);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><strong>${type === "meal" ? "No meals logged yet" : "No movement logged yet"}</strong><p>${type === "meal" ? "Whenever you like, add something you enjoyed." : "A walk, a stretch, a dance — it all counts."}</p></div>`;
  } else {
    container.innerHTML = entries.map((entry) => {
      const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" · ");
      return `<div class="entry-item"><span class="entry-icon ${type === "exercise" ? "exercise" : ""}">${type === "meal" ? "◉" : "↗"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (type === "meal" ? "Meal or snack" : "Movement"))}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
    }).join("");
  }

  if (target === "#food-entries") {
    element<HTMLElement>("#food-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  }
  if (target === "#movement-entries") {
    element<HTMLElement>("#movement-total").textContent =
      `${entries.length} ${entries.length === 1 ? "session" : "sessions"}`;
  }
}

function renderTodayEntries(): void {
  const entries = sortEntriesByTime(state.entries);
  const container = element<HTMLDivElement>("#today-entries");
  if (!entries.length) {
    container.innerHTML =
      `<div class="empty-state"><span class="empty-icon">✳</span><strong>Your day is a blank canvas</strong><p>Add a meal or movement to get started.</p></div>`;
  } else {
    container.innerHTML = entries.map((entry) => {
      const isMeal = entry.type === "meal";
      const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" · ");
      const typeLabel = isMeal ? "Meal or snack" : "Movement";
      return `<div class="entry-item"><span class="entry-icon ${isMeal ? "" : "exercise"}">${isMeal ? "◉" : "↗"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || typeLabel)}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
    }).join("");
  }
  element<HTMLElement>("#movement-count").textContent =
    String(entries.filter((entry) => entry.type === "exercise").length);
}

function movementMuscleGroups(entries: typeof state.entries): string[] {
  const groups = new Map<string, string>();
  entries.forEach((entry) => {
    entry.muscle_groups.split(",").map((group) => group.trim()).filter(Boolean).forEach((group) => {
      const key = group.toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, group);
    });
  });
  return [...groups.values()];
}

function movementMuscleLabel(groups: string[], hasExercises: boolean): string {
  if (!groups.length) return hasExercises ? "Not specified" : "None yet";
  const muscles = groups;
  const visible = muscles.slice(0, 3).join(", ");
  return muscles.length > 3 ? `${visible} +${muscles.length - 3} more` : visible;
}

function macroTotals(): { calories: number; protein: number; carbs: number; fat: number } {
  return state.entries.filter((entry) => entry.type === "meal").reduce((totals, entry) => ({
    calories: totals.calories + number(entry.calories),
    protein: totals.protein + number(entry.protein),
    carbs: totals.carbs + number(entry.carbs),
    fat: totals.fat + number(entry.fat),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderDateLabels(): void {
  const now = new Date();
  element<HTMLElement>("#today-date").textContent =
    new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  element<HTMLElement>("#date-label").textContent =
    new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(now);
  const hour = now.getHours();
  element<HTMLElement>("#greeting").textContent =
    hour < 12 ? "A FRESH MORNING" : hour < 17 ? "A MOMENT FOR YOU" : "A GENTLE EVENING";
}

export function renderDashboard(): void {
  const totals = macroTotals();
  element<HTMLElement>("#calories-eaten").textContent = Math.round(totals.calories).toLocaleString();
  element<HTMLElement>("#calories-left").textContent =
    Math.max(0, state.goals.calories - Math.round(totals.calories)).toLocaleString();
  const burned = state.entries
    .filter((entry) => entry.type === "exercise")
    .reduce((sum, entry) => sum + number(entry.calories), 0);
  const exercises = state.entries.filter((entry) => entry.type === "exercise");
  const muscleGroups = movementMuscleGroups(exercises);
  element<HTMLElement>("#calories-burned").textContent = `${Math.round(burned).toLocaleString()} kcal`;
  element<HTMLElement>("#movement-card-calories").textContent = `${Math.round(burned).toLocaleString()} kcal`;
  const muscleLabel = movementMuscleLabel(muscleGroups, exercises.length > 0);
  element<HTMLElement>("#movement-card-muscles").textContent = muscleLabel;
  element<HTMLElement>("#movement-tab-muscles").textContent = muscleLabel;
  element<HTMLElement>("#calorie-goal-label").textContent = `${state.goals.calories.toLocaleString()} kcal`;

  const progress = Math.min(1, totals.calories / Math.max(1, state.goals.calories));
  element<HTMLElement>("#calorie-ring").style.background =
    `conic-gradient(#66836a ${progress * 360}deg, #edf0e9 ${progress * 360}deg)`;
  element<HTMLElement>("#protein-value").textContent = `${Math.round(totals.protein)}g`;
  element<HTMLElement>("#carbs-value").textContent = `${Math.round(totals.carbs)}g`;
  element<HTMLElement>("#fat-value").textContent = `${Math.round(totals.fat)}g`;
  element<HTMLElement>("#protein-goal").textContent = `of ${state.goals.protein}g`;
  element<HTMLElement>("#protein-bar").style.width =
    `${Math.min(100, totals.protein / state.goals.protein * 100)}%`;
  element<HTMLElement>("#carbs-bar").style.width = `${Math.min(100, totals.carbs / 250 * 100)}%`;
  element<HTMLElement>("#fat-bar").style.width = `${Math.min(100, totals.fat / 70 * 100)}%`;

  renderTodayEntries();
  if (element("#view-food").classList.contains("active")) renderEntries("#food-entries", "meal");
  if (element("#view-movement").classList.contains("active")) renderEntries("#movement-entries", "exercise");
  element<HTMLElement>("#pantry-chips").innerHTML =
    state.pantry.map((item) => `<span class="ingredient-chip">${escapeHtml(item)}</span>`).join("");
  element<HTMLTextAreaElement>("#pantry-form [name=ingredients]").value = state.pantry.join(", ");
  element<HTMLInputElement>("#goals-form [name=calories]").value = String(state.goals.calories);
  element<HTMLInputElement>("#goals-form [name=protein]").value = String(state.goals.protein);
  const profileForm = element<HTMLFormElement>("#fitness-profile-form");
  Object.entries(state.fitnessProfile).forEach(([name, value]) => {
    const field = profileForm.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = value === null ? "" : String(value);
    }
  });
}

export function initializeDashboard(): void {
  renderDateLabels();
  window.addEventListener("goodday:log-sort-changed", renderDashboard);
}

export function renderEntriesForView(type: EntryType): void {
  renderEntries(type === "meal" ? "#food-entries" : "#movement-entries", type);
}
