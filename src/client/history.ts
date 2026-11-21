import { loadHistory } from "./api";
import { element, escapeHtml } from "./dom";
import { notify } from "./notifications";
import { state, number } from "./state";

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function renderHistory(): void {
  const groups = new Map<string, typeof state.history>();
  state.history.forEach((entry) => {
    const date = entry.created_at.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)?.push(entry);
  });

  const meals = state.history.filter((entry) => entry.type === "meal").length;
  const movement = state.history.filter((entry) => entry.type === "exercise").length;
  element<HTMLElement>("#history-days").textContent = String(groups.size);
  element<HTMLElement>("#history-meals").textContent = String(meals);
  element<HTMLElement>("#history-movement").textContent = String(movement);

  const days = [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
  if (!days.length) {
    element<HTMLElement>("#history-list").innerHTML =
      `<div class="empty-state"><span class="empty-icon">✳</span><strong>Your history will show up here</strong><p>Log a meal or movement to start building your timeline.</p></div>`;
    return;
  }

  element<HTMLElement>("#history-list").innerHTML = days.map(([date, entries]) => {
    const dayMeals = entries.filter((entry) => entry.type === "meal");
    const dayMovement = entries.filter((entry) => entry.type === "exercise");
    const calories = dayMeals.reduce((total, entry) => total + number(entry.calories), 0);
    const protein = dayMeals.reduce((total, entry) => total + number(entry.protein), 0);
    const rows = entries.map((entry) => {
      const isMeal = entry.type === "meal";
      const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" · ");
      const time = new Date(entry.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return `<div class="history-entry"><span class="entry-icon ${isMeal ? "" : "exercise"}">${isMeal ? "◉" : "↗"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (isMeal ? "Meal or snack" : "Movement"))} · ${time}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
    }).join("");
    const mealLabel = `${dayMeals.length} ${dayMeals.length === 1 ? "meal" : "meals"}`;
    const movementLabel = `${dayMovement.length} ${dayMovement.length === 1 ? "session" : "sessions"}`;
    return `<article class="history-day"><header class="history-day-heading"><div><h3>${formatHistoryDate(date)}</h3><span>${entries.length} ${entries.length === 1 ? "entry" : "entries"}</span></div><div class="history-day-totals"><span>${mealLabel}</span><strong>${Math.round(calories).toLocaleString()} kcal</strong><span>${Math.round(protein)}g protein</span><span>${movementLabel}</span></div></header><div class="history-entries">${rows}</div></article>`;
  }).join("");
}

export async function refreshHistory(): Promise<void> {
  try {
    const data = await loadHistory();
    state.history = data.entries;
    renderHistory();
  } catch (error) {
    notify(`Couldn't load your history: ${error instanceof Error ? error.message : "Please try again."}`, true);
  }
}
