const STORAGE_KEY = "goodday-user-id";
const userId = localStorage.getItem(STORAGE_KEY) || crypto.randomUUID();
localStorage.setItem(STORAGE_KEY, userId);

const state = { entries: [], history: [], pantry: [], goals: { calories: 2000, protein: 120 }, messages: [] };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const number = (value) => Number(value || 0);

function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function dateLabels() {
  const now = new Date();
  $("#today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  $("#date-label").textContent = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(now);
  const hour = now.getHours();
  $("#greeting").textContent = hour < 12 ? "A FRESH MORNING" : hour < 17 ? "A MOMENT FOR YOU" : "A GENTLE EVENING";
}

function setView(name) {
  const view = $(`#view-${name}`);
  if (!view) return;
  $$(".view-panel").forEach((panel) => panel.classList.toggle("active", panel === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  if (name === "food") renderEntries("#food-entries", "meal");
  if (name === "movement") renderEntries("#movement-entries", "exercise");
  if (name === "history") loadHistory().catch((error) => notify(`Couldn't load your history: ${error.message}`, true));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function macroTotals() {
  return state.entries.filter((entry) => entry.type === "meal").reduce((totals, entry) => ({
    calories: totals.calories + number(entry.calories),
    protein: totals.protein + number(entry.protein),
    carbs: totals.carbs + number(entry.carbs),
    fat: totals.fat + number(entry.fat),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderEntries(target, type) {
  const entries = state.entries.filter((entry) => entry.type === type);
  const container = $(target);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><strong>${type === "meal" ? "No meals logged yet" : "No movement logged yet"}</strong><p>${type === "meal" ? "Whenever you like, add something you enjoyed." : "A walk, a stretch, a dance — it all counts."}</p></div>`;
  } else {
    container.innerHTML = entries.map((entry) => {
      const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" · ");
      const amount = type === "meal" ? `${number(entry.calories).toLocaleString()} kcal` : `${number(entry.calories).toLocaleString()} kcal`;
      return `<div class="entry-item"><span class="entry-icon ${type === "exercise" ? "exercise" : ""}">${type === "meal" ? "◉" : "↗"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (type === "meal" ? "Meal or snack" : "Movement"))}</span></div><span class="entry-calories">${amount}</span></div>`;
    }).join("");
  }
  if (target === "#today-entries") {
    const count = entries.length;
    const containerCount = $("#movement-count");
    containerCount.textContent = String(state.entries.filter((entry) => entry.type === "exercise").length);
  }
  if (target === "#food-entries") $("#food-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  if (target === "#movement-entries") $("#movement-total").textContent = `${entries.length} ${entries.length === 1 ? "session" : "sessions"}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatHistoryDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function renderHistory() {
  const groups = new Map();
  state.history.forEach((entry) => {
    const date = entry.created_at.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(entry);
  });
  const meals = state.history.filter((entry) => entry.type === "meal").length;
  const movement = state.history.filter((entry) => entry.type === "exercise").length;
  $("#history-days").textContent = String(groups.size);
  $("#history-meals").textContent = String(meals);
  $("#history-movement").textContent = String(movement);

  const days = [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
  if (!days.length) {
    $("#history-list").innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><strong>Your history will show up here</strong><p>Log a meal or movement to start building your timeline.</p></div>`;
    return;
  }
  $("#history-list").innerHTML = days.map(([date, entries]) => {
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

async function loadHistory() {
  const data = await api(`/api/history?userId=${encodeURIComponent(userId)}`);
  state.history = data.entries;
  renderHistory();
}

function render() {
  const totals = macroTotals();
  $("#calories-eaten").textContent = Math.round(totals.calories).toLocaleString();
  $("#calories-left").textContent = Math.max(0, state.goals.calories - Math.round(totals.calories)).toLocaleString();
  $("#calories-burned").textContent = `${Math.round(state.entries.filter((entry) => entry.type === "exercise").reduce((sum, entry) => sum + number(entry.calories), 0)).toLocaleString()} kcal`;
  $("#calorie-goal-label").textContent = `${state.goals.calories.toLocaleString()} kcal`;
  const progress = Math.min(1, totals.calories / Math.max(1, state.goals.calories));
  $("#calorie-ring").style.background = `conic-gradient(#66836a ${progress * 360}deg, #edf0e9 ${progress * 360}deg)`;
  $("#protein-value").textContent = `${Math.round(totals.protein)}g`;
  $("#carbs-value").textContent = `${Math.round(totals.carbs)}g`;
  $("#fat-value").textContent = `${Math.round(totals.fat)}g`;
  $("#protein-goal").textContent = `of ${state.goals.protein}g`;
  $("#protein-bar").style.width = `${Math.min(100, totals.protein / state.goals.protein * 100)}%`;
  $("#carbs-bar").style.width = `${Math.min(100, totals.carbs / 250 * 100)}%`;
  $("#fat-bar").style.width = `${Math.min(100, totals.fat / 70 * 100)}%`;
  renderEntries("#today-entries", "meal");
  if ($("#view-food").classList.contains("active")) renderEntries("#food-entries", "meal");
  if ($("#view-movement").classList.contains("active")) renderEntries("#movement-entries", "exercise");
  $("#pantry-chips").innerHTML = state.pantry.map((item) => `<span class="ingredient-chip">${escapeHtml(item)}</span>`).join("");
  $("#pantry-form [name=ingredients]").value = state.pantry.join(", ");
  $("#goals-form [name=calories]").value = state.goals.calories;
  $("#goals-form [name=protein]").value = state.goals.protein;
  if (state.messages.length) {
    $("#chat-messages").replaceChildren();
    state.messages.forEach((message) => addMessage(message.role, message.content));
  }
}

async function refresh() {
  const data = await api(`/api/state?userId=${encodeURIComponent(userId)}`);
  state.entries = data.entries;
  state.pantry = data.pantry;
  state.goals = data.goals;
  state.messages = data.messages;
  render();
}

async function submitEntry(form, type) {
  const fields = Object.fromEntries(new FormData(form));
  await api("/api/entries", {
    method: "POST",
    body: JSON.stringify({ ...fields, userId, type }),
  });
  form.reset();
  if (type === "meal") {
    form.elements.calories.value = 0;
    form.elements.protein.value = 0;
    form.elements.carbs.value = 0;
    form.elements.fat.value = 0;
    form.elements.fiber.value = 0;
  } else {
    form.elements.calories.value = 0;
  }
  await refresh();
  notify(type === "meal" ? "Added to your food log ✳" : "Movement added — nice work ✳");
}

function addMessage(role, text) {
  const item = document.createElement("div");
  item.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const avatar = role === "assistant" ? '<span class="message-avatar">✳</span>' : "";
  const label = role === "assistant" ? "<small>YOUR WELLNESS COMPANION</small>" : "";
  item.innerHTML = `${avatar}<div class="message-bubble"><p>${escapeHtml(text)}</p>${label}</div>`;
  $("#chat-messages").append(item);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
}

async function askAssistant(message, mode, output) {
  if (!message.trim()) {
    notify("Add a little detail so your coach can help.", true);
    return;
  }
  const button = mode === "recipes" ? $("#recipe-button") : mode === "workout" ? $("#workout-button") : $("#chat-form button");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Thinking...";
  try {
    const data = await api("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ userId, message, mode }),
    });
    if (mode === "chat") addMessage("assistant", data.answer);
    else output.textContent = data.answer;
  } catch (error) {
    if (mode === "chat") addMessage("assistant", `I'm sorry — I couldn't reach the coach just now. ${error.message}`);
    else output.textContent = `Couldn't get ideas right now. ${error.message}`;
    notify("The assistant couldn't respond. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-view]").filter((button) => !button.classList.contains("nav-item")).forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-open]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.open)));

$("#meal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitEntry(event.currentTarget, "meal");
  } catch (error) {
    notify(error.message, true);
  }
});
$("#exercise-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitEntry(event.currentTarget, "exercise");
  } catch (error) {
    notify(error.message, true);
  }
});
$("#pantry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const ingredients = event.currentTarget.elements.ingredients.value.split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const data = await api("/api/pantry", { method: "POST", body: JSON.stringify({ userId, ingredients }) });
    state.pantry = data.ingredients;
    render();
    notify("Pantry updated ✳");
  } catch (error) {
    notify(error.message, true);
  }
});
$("#goals-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/goals", { method: "POST", body: JSON.stringify({ userId, ...values }) });
    await refresh();
    setView("today");
    notify("Your guides are updated ✳");
  } catch (error) {
    notify(error.message, true);
  }
});
$("#recipe-button").addEventListener("click", () => askAssistant(
  $("#recipe-prompt").value || "Suggest recipes I can make with the ingredients in my pantry.",
  "recipes",
  $("#recipe-output"),
));
$("#workout-button").addEventListener("click", () => askAssistant(
  $("#workout-prompt").value || "Suggest a balanced beginner-friendly workout for today.",
  "workout",
  $("#workout-output"),
));
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chat-input");
  const message = input.value.trim();
  if (!message) return;
  addMessage("user", message);
  input.value = "";
  await askAssistant(message, "chat", null);
});
$$(".suggestion-chip").forEach((button) => button.addEventListener("click", () => {
  const input = $("#chat-input");
  input.value = button.textContent;
  input.focus();
}));

dateLabels();
refresh().catch((error) => notify(`Couldn't load your tracker: ${error.message}`, true));
