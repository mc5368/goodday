import {
  createEntry,
  estimateExercise,
  estimateMeal,
  updateGoals,
  updatePantry,
  loadState,
  updateState,
} from "./api";
import { bindChat, renderChatHistory } from "./chat";
import { renderDashboard, renderEntriesForView } from "./dashboard";
import { refreshHistory } from "./history";
import { element, elements } from "./dom";
import { notify } from "./notifications";
import { state } from "./state";
import type { EntryType } from "./types";

async function refreshTracker(): Promise<void> {
  updateState(await loadState());
  renderDashboard();
  renderChatHistory();
}

function inputValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing form field: ${name}`);
  }
  return field.value;
}

async function submitEntry(form: HTMLFormElement, type: EntryType): Promise<void> {
  const estimateKey = JSON.stringify([inputValue(form, "title").trim(), inputValue(form, "detail").trim()]);
  const previousEstimateKey = form.dataset.aiEstimateKey;
  const requiredEstimateFields = type === "meal"
    ? ["calories", "protein", "carbs", "fat", "fiber"]
    : ["calories", "muscleGroups"];
  const hasCompleteValues = requiredEstimateFields.every((name) => inputValue(form, name).trim() !== "");

  if ((previousEstimateKey && previousEstimateKey !== estimateKey)
    || !hasCompleteValues) {
    const submitButton = form.querySelector<HTMLButtonElement>("[type=submit]");
    if (submitButton) submitButton.disabled = true;
    try {
      await estimateForm(form, type, Boolean(previousEstimateKey && previousEstimateKey !== estimateKey));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
    notify("AI filled in an estimate. Review or edit it, then add it to your day.");
    return;
  }

  const fields = {
    title: inputValue(form, "title"),
    detail: inputValue(form, "detail"),
    calories: Number(inputValue(form, "calories")),
    ...(type === "meal" ? {
      protein: Number(inputValue(form, "protein")),
      carbs: Number(inputValue(form, "carbs")),
      fat: Number(inputValue(form, "fat")),
      fiber: Number(inputValue(form, "fiber")),
    } : {
      muscleGroups: inputValue(form, "muscleGroups"),
    }),
  };
  await createEntry(fields, type);
  form.reset();
  delete form.dataset.aiEstimateKey;
  if (type === "meal") {
    ["calories", "protein", "carbs", "fat", "fiber"].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = "";
    });
  } else {
    const calories = form.elements.namedItem("calories");
    if (calories instanceof HTMLInputElement) calories.value = "";
  }
  element<HTMLElement>(type === "meal" ? "#meal-estimate-notes" : "#exercise-estimate-notes").textContent =
    type === "meal"
      ? "AI suggestions are approximate. Review and edit the values before logging."
      : "AI suggestions are approximate and can be edited before logging.";
  await refreshTracker();
  notify(type === "meal" ? "Added to your food log ✳" : "Movement added — nice work ✳");
}

async function estimateForm(form: HTMLFormElement, type: EntryType, overwrite = true): Promise<void> {
  const title = inputValue(form, "title").trim();
  const detail = inputValue(form, "detail").trim();
  const estimateKey = JSON.stringify([title, detail]);

  if (type === "meal") {
    const { estimate } = await estimateMeal(title, detail);
    for (const [name, value] of Object.entries(estimate)) {
      if (name === "notes") continue;
      const field = form.elements.namedItem(name) as HTMLInputElement;
      if (overwrite || !field.value.trim()) field.value = String(value);
    }
    element<HTMLElement>("#meal-estimate-notes").textContent =
      `AI estimate — review and edit before saving. ${estimate.notes}`;
  } else {
    const { estimate } = await estimateExercise(title, detail);
    const calories = form.elements.namedItem("calories") as HTMLInputElement;
    const muscleGroups = form.elements.namedItem("muscleGroups") as HTMLInputElement;
    if (overwrite || !calories.value.trim()) calories.value = String(estimate.calories);
    if (overwrite || !muscleGroups.value.trim()) muscleGroups.value = estimate.muscleGroups;
    element<HTMLElement>("#exercise-estimate-notes").textContent =
      `AI estimate — review and edit before saving. ${estimate.notes}`;
  }

  form.dataset.aiEstimateKey = estimateKey;
}

function handleFormError(error: unknown): void {
  notify(error instanceof Error ? error.message : "Something went wrong. Please try again.", true);
}

export function bindForms(): void {
  element<HTMLButtonElement>("#estimate-meal-button").addEventListener("click", async () => {
    const form = element<HTMLFormElement>("#meal-form");
    const button = element<HTMLButtonElement>("#estimate-meal-button");
    const submitButton = form.querySelector<HTMLButtonElement>("[type=submit]");
    try {
      button.disabled = true;
      if (submitButton) submitButton.disabled = true;
      button.textContent = "Estimating...";
      await estimateForm(form, "meal");
    } catch (error) {
      handleFormError(error);
    } finally {
      button.disabled = false;
      if (submitButton) submitButton.disabled = false;
      button.innerHTML = "Estimate nutrition with AI <span>✳</span>";
    }
  });

  element<HTMLButtonElement>("#estimate-exercise-button").addEventListener("click", async () => {
    const form = element<HTMLFormElement>("#exercise-form");
    const button = element<HTMLButtonElement>("#estimate-exercise-button");
    const submitButton = form.querySelector<HTMLButtonElement>("[type=submit]");
    try {
      button.disabled = true;
      if (submitButton) submitButton.disabled = true;
      button.textContent = "Estimating...";
      await estimateForm(form, "exercise");
    } catch (error) {
      handleFormError(error);
    } finally {
      button.disabled = false;
      if (submitButton) submitButton.disabled = false;
      button.innerHTML = "Estimate with AI <span>✳</span>";
    }
  });

  element<HTMLFormElement>("#meal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitEntry(event.currentTarget as HTMLFormElement, "meal");
    } catch (error) {
      handleFormError(error);
    }
  });

  element<HTMLFormElement>("#exercise-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitEntry(event.currentTarget as HTMLFormElement, "exercise");
    } catch (error) {
      handleFormError(error);
    }
  });

  element<HTMLFormElement>("#pantry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const ingredients = inputValue(form, "ingredients").split(",").map((item) => item.trim()).filter(Boolean);
    try {
      const data = await updatePantry(ingredients);
      state.pantry = data.ingredients;
      renderDashboard();
      notify("Pantry updated ✳");
    } catch (error) {
      handleFormError(error);
    }
  });

  element<HTMLFormElement>("#goals-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    try {
      await updateGoals({
        calories: Number(inputValue(form, "calories")),
        protein: Number(inputValue(form, "protein")),
      });
      await refreshTracker();
      showView("today");
      notify("Your guides are updated ✳");
    } catch (error) {
      handleFormError(error);
    }
  });
}

function showView(name: string): void {
  const view = document.querySelector<HTMLElement>(`#view-${name}`);
  if (!view) return;
  elements<HTMLElement>(".view-panel").forEach((panel) => panel.classList.toggle("active", panel === view));
  elements<HTMLButtonElement>(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });
  if (name === "food") {
    renderEntriesForView("meal");
  }
  if (name === "movement") {
    renderEntriesForView("exercise");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function bindNavigation(): void {
  elements<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.view;
      if (!name) return;
      showView(name);
      if (name === "history") void refreshHistory();
    });
  });
  elements<HTMLButtonElement>("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.open;
      if (name) showView(name);
    });
  });
}

export async function initializeApp(): Promise<void> {
  bindNavigation();
  bindForms();
  bindChat();
  try {
    await refreshTracker();
  } catch (error) {
    notify(`Couldn't load your tracker: ${error instanceof Error ? error.message : "Please try again."}`, true);
  }
}
