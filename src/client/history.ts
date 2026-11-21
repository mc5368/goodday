import { loadHistory } from "./api";
import { element, elements, escapeHtml } from "./dom";
import { notify } from "./notifications";
import { state, number } from "./state";
import { logSortOrder, sortEntriesByTime } from "./logSort";
import type { Entry } from "./types";

type MetricKey = "calories" | "protein" | "carbs" | "fat" | "fiber" | "movement" | "burned";

interface Metric {
  label: string;
  unit: string;
  entryType: Entry["type"];
  value: (entry: Entry) => number;
}

const metrics: Record<MetricKey, Metric> = {
  calories: { label: "Calories eaten", unit: "kcal", entryType: "meal", value: (entry) => number(entry.calories) },
  protein: { label: "Protein", unit: "g", entryType: "meal", value: (entry) => number(entry.protein) },
  carbs: { label: "Carbohydrates", unit: "g", entryType: "meal", value: (entry) => number(entry.carbs) },
  fat: { label: "Fat", unit: "g", entryType: "meal", value: (entry) => number(entry.fat) },
  fiber: { label: "Fiber", unit: "g", entryType: "meal", value: (entry) => number(entry.fiber) },
  movement: { label: "Movement sessions", unit: "sessions", entryType: "exercise", value: () => 1 },
  burned: { label: "Movement calories", unit: "kcal", entryType: "exercise", value: (entry) => number(entry.calories) },
};

const validRanges = [7, 30, 90, 365];
let activeRange = 7;
let requestVersion = 0;

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function historyDays(range: number): string[] {
  const today = new Date();
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    day.setUTCDate(day.getUTCDate() - (range - index - 1));
    return dateKey(day);
  });
}

function seriesFor(metric: Metric): { date: string; value: number }[] {
  const totals = new Map<string, number>();
  state.history.forEach((entry) => {
    if (entry.type !== metric.entryType) return;
    const date = entry.created_at.slice(0, 10);
    totals.set(date, (totals.get(date) ?? 0) + metric.value(entry));
  });
  return historyDays(activeRange).map((date) => ({ date, value: totals.get(date) ?? 0 }));
}

function formatAmount(value: number, metric: Metric): string {
  const amount = metric.unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
  const unit = metric.unit === "sessions" && amount === 1 ? "session" : metric.unit;
  return `${amount.toLocaleString()} ${unit}`;
}

function tickLabel(date: string, range: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  return range <= 7
    ? new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(value)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}

function renderChart(): void {
  const metricSelect = document.querySelector("#history-metric");
  if (!(metricSelect instanceof HTMLSelectElement)) throw new Error("The progress measure selector is missing.");
  const metricKey = metricSelect.value as MetricKey;
  const metric = metrics[metricKey] ?? metrics.calories;
  const data = seriesFor(metric);
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const average = data.length ? total / data.length : 0;
  const best = Math.max(...data.map((point) => point.value), 0);
  element<HTMLElement>("#history-chart-summary").innerHTML =
    `<span>Daily average <strong>${escapeHtml(formatAmount(average, metric))}</strong></span><span>Highest day <strong>${escapeHtml(formatAmount(best, metric))}</strong></span>`;

  const width = 760;
  const height = 260;
  const margin = { top: 16, right: 18, bottom: 40, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawMax = Math.max(...data.map((point) => point.value), 0);
  const max = rawMax > 0 ? rawMax * 1.15 : 1;
  const x = (index: number): number => margin.left + (data.length <= 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const y = (value: number): number => margin.top + plotHeight - value / max * plotHeight;
  const line = data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(margin.top + plotHeight).toFixed(1)} L${x(0).toFixed(1)},${(margin.top + plotHeight).toFixed(1)} Z`;
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = max * (4 - index) / 4;
    const position = y(value);
    const label = metric.unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
    return `<line class="chart-grid-line" x1="${margin.left}" y1="${position}" x2="${width - margin.right}" y2="${position}"></line><text class="chart-axis-label" x="${margin.left - 10}" y="${position + 4}" text-anchor="end">${label.toLocaleString()}</text>`;
  }).join("");
  const tickCount = Math.min(7, data.length);
  const tickIndexes = Array.from({ length: tickCount }, (_, index) => (
    Math.round(index * (data.length - 1) / Math.max(tickCount - 1, 1))
  ));
  const xLabels = tickIndexes.map((index) =>
    `<text class="chart-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(tickLabel(data[index].date, activeRange))}</text>`,
  ).join("");
  const points = data.map((point, index) =>
    `<circle class="chart-point" cx="${x(index)}" cy="${y(point.value)}" r="${activeRange <= 30 ? 3.5 : 2.2}"><title>${escapeHtml(formatHistoryDate(point.date))}: ${escapeHtml(formatAmount(point.value, metric))}</title></circle>`,
  ).join("");
  const chart = element<HTMLElement>("#history-chart");
  chart.setAttribute("aria-label", `Daily ${metric.label.toLowerCase()} over the last ${activeRange} days`);
  chart.innerHTML = `<svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)} for each day, last ${activeRange} days"><defs><linearGradient id="progress-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6f9672" stop-opacity=".24"></stop><stop offset="100%" stop-color="#6f9672" stop-opacity=".02"></stop></linearGradient></defs>${gridLines}<path class="chart-area" d="${area}"></path><path class="chart-line" d="${line}"></path>${points}${xLabels}</svg>`;
}

function renderHistory(): void {
  const visibleDates = new Set(historyDays(activeRange));
  const visibleEntries = state.history.filter((entry) => visibleDates.has(entry.created_at.slice(0, 10)));
  const visibleGroups = new Map<string, Entry[]>();
  visibleEntries.forEach((entry) => {
    const date = entry.created_at.slice(0, 10);
    if (!visibleGroups.has(date)) visibleGroups.set(date, []);
    visibleGroups.get(date)?.push(entry);
  });
  const meals = visibleEntries.filter((entry) => entry.type === "meal").length;
  const movement = visibleEntries.filter((entry) => entry.type === "exercise").length;
  element<HTMLElement>("#history-days").textContent = String(visibleGroups.size);
  element<HTMLElement>("#history-meals").textContent = String(meals);
  element<HTMLElement>("#history-movement").textContent = String(movement);
  element<HTMLElement>("#history-range-label").textContent = `Last ${activeRange} days`;

  const order = logSortOrder();
  const days = [...visibleGroups.entries()].sort(([first], [second]) =>
    order === "newest" ? second.localeCompare(first) : first.localeCompare(second),
  );
  if (!days.length) {
    element<HTMLElement>("#history-list").innerHTML =
      `<div class="empty-state"><span class="empty-icon">✳</span><strong>Your history will show up here</strong><p>Log a meal or movement to start building your timeline.</p></div>`;
  } else {
    element<HTMLElement>("#history-list").innerHTML = days.map(([date, entries]) => {
      const dayMeals = entries.filter((entry) => entry.type === "meal");
      const dayMovement = entries.filter((entry) => entry.type === "exercise");
      const calories = dayMeals.reduce((total, entry) => total + number(entry.calories), 0);
      const protein = dayMeals.reduce((total, entry) => total + number(entry.protein), 0);
      const rows = sortEntriesByTime(entries).map((entry) => {
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
  renderChart();
}

export function bindHistory(): void {
  window.addEventListener("goodday:log-sort-changed", renderHistory);
  elements<HTMLButtonElement>("[data-history-days]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = Number(button.dataset.historyDays);
      if (!validRanges.includes(range)) return;
      activeRange = range;
      elements<HTMLButtonElement>("[data-history-days]").forEach((option) => {
        const selected = Number(option.dataset.historyDays) === activeRange;
        option.classList.toggle("active", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      void refreshHistory();
    });
  });
  const metricSelect = document.querySelector("#history-metric");
  if (!(metricSelect instanceof HTMLSelectElement)) throw new Error("The progress measure selector is missing.");
  metricSelect.addEventListener("change", renderChart);
}

export async function refreshHistory(): Promise<void> {
  const version = ++requestVersion;
  try {
    const data = await loadHistory(activeRange);
    if (version !== requestVersion) return;
    state.history = data.entries;
    renderHistory();
  } catch (error) {
    if (version === requestVersion) {
      notify(`Couldn't load your history: ${error instanceof Error ? error.message : "Please try again."}`, true);
    }
  }
}
