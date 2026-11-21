"use strict";
(() => {
  // src/client/dom.ts
  function element(selector) {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`Required page element was not found: ${selector}`);
    return found;
  }
  function elements(selector) {
    return [...document.querySelectorAll(selector)];
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character] ?? character);
  }

  // src/client/state.ts
  var emptyFitnessProfile = {
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
    preferredActivities: ""
  };
  var state = {
    entries: [],
    history: [],
    pantry: [],
    goals: { calories: 2e3, protein: 120 },
    fitnessProfile: { ...emptyFitnessProfile },
    messages: []
  };
  function number(value) {
    return Number(value || 0);
  }

  // src/client/logSort.ts
  var STORAGE_KEY = "goodday-log-sort-order";
  function logSortOrder() {
    return localStorage.getItem(STORAGE_KEY) === "oldest" ? "oldest" : "newest";
  }
  function sortEntriesByTime(entries) {
    const direction = logSortOrder() === "newest" ? -1 : 1;
    return [...entries].sort((first, second) => direction * first.created_at.localeCompare(second.created_at));
  }
  function initializeLogSorting() {
    const controls = elements("[data-log-sort]");
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

  // src/client/dashboard.ts
  function renderEntries(target, type) {
    const entries = sortEntriesByTime(state.entries.filter((entry) => entry.type === type));
    const container = element(target);
    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">\u2733</span><strong>${type === "meal" ? "No meals logged yet" : "No movement logged yet"}</strong><p>${type === "meal" ? "Whenever you like, add something you enjoyed." : "A walk, a stretch, a dance \u2014 it all counts."}</p></div>`;
    } else {
      container.innerHTML = entries.map((entry) => {
        const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" \xB7 ");
        return `<div class="entry-item"><span class="entry-icon ${type === "exercise" ? "exercise" : ""}">${type === "meal" ? "\u25C9" : "\u2197"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (type === "meal" ? "Meal or snack" : "Movement"))}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
      }).join("");
    }
    if (target === "#food-entries") {
      element("#food-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
    }
    if (target === "#movement-entries") {
      element("#movement-total").textContent = `${entries.length} ${entries.length === 1 ? "session" : "sessions"}`;
    }
  }
  function renderTodayEntries() {
    const entries = sortEntriesByTime(state.entries);
    const container = element("#today-entries");
    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">\u2733</span><strong>Your day is a blank canvas</strong><p>Add a meal or movement to get started.</p></div>`;
    } else {
      container.innerHTML = entries.map((entry) => {
        const isMeal = entry.type === "meal";
        const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" \xB7 ");
        const typeLabel = isMeal ? "Meal or snack" : "Movement";
        return `<div class="entry-item"><span class="entry-icon ${isMeal ? "" : "exercise"}">${isMeal ? "\u25C9" : "\u2197"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || typeLabel)}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
      }).join("");
    }
    element("#movement-count").textContent = String(entries.filter((entry) => entry.type === "exercise").length);
  }
  function movementMuscleGroups(entries) {
    const groups = /* @__PURE__ */ new Map();
    entries.forEach((entry) => {
      entry.muscle_groups.split(",").map((group) => group.trim()).filter(Boolean).forEach((group) => {
        const key = group.toLocaleLowerCase();
        if (!groups.has(key)) groups.set(key, group);
      });
    });
    return [...groups.values()];
  }
  function movementMuscleLabel(groups, hasExercises) {
    if (!groups.length) return hasExercises ? "Not specified" : "None yet";
    const muscles = groups;
    const visible = muscles.slice(0, 3).join(", ");
    return muscles.length > 3 ? `${visible} +${muscles.length - 3} more` : visible;
  }
  function macroTotals() {
    return state.entries.filter((entry) => entry.type === "meal").reduce((totals, entry) => ({
      calories: totals.calories + number(entry.calories),
      protein: totals.protein + number(entry.protein),
      carbs: totals.carbs + number(entry.carbs),
      fat: totals.fat + number(entry.fat)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }
  function renderDateLabels() {
    const now = /* @__PURE__ */ new Date();
    element("#today-date").textContent = new Intl.DateTimeFormat(void 0, { weekday: "long", month: "long", day: "numeric" }).format(now);
    element("#date-label").textContent = new Intl.DateTimeFormat(void 0, { month: "long", day: "numeric" }).format(now);
    const hour = now.getHours();
    element("#greeting").textContent = hour < 12 ? "A FRESH MORNING" : hour < 17 ? "A MOMENT FOR YOU" : "A GENTLE EVENING";
  }
  function renderDashboard() {
    const totals = macroTotals();
    element("#calories-eaten").textContent = Math.round(totals.calories).toLocaleString();
    element("#calories-left").textContent = Math.max(0, state.goals.calories - Math.round(totals.calories)).toLocaleString();
    const burned = state.entries.filter((entry) => entry.type === "exercise").reduce((sum, entry) => sum + number(entry.calories), 0);
    const exercises = state.entries.filter((entry) => entry.type === "exercise");
    const muscleGroups = movementMuscleGroups(exercises);
    element("#calories-burned").textContent = `${Math.round(burned).toLocaleString()} kcal`;
    element("#movement-card-calories").textContent = `${Math.round(burned).toLocaleString()} kcal`;
    const muscleLabel = movementMuscleLabel(muscleGroups, exercises.length > 0);
    element("#movement-card-muscles").textContent = muscleLabel;
    element("#movement-tab-muscles").textContent = muscleLabel;
    element("#calorie-goal-label").textContent = `${state.goals.calories.toLocaleString()} kcal`;
    const progress = Math.min(1, totals.calories / Math.max(1, state.goals.calories));
    element("#calorie-ring").style.background = `conic-gradient(#66836a ${progress * 360}deg, #edf0e9 ${progress * 360}deg)`;
    element("#protein-value").textContent = `${Math.round(totals.protein)}g`;
    element("#carbs-value").textContent = `${Math.round(totals.carbs)}g`;
    element("#fat-value").textContent = `${Math.round(totals.fat)}g`;
    element("#protein-goal").textContent = `of ${state.goals.protein}g`;
    element("#protein-bar").style.width = `${Math.min(100, totals.protein / state.goals.protein * 100)}%`;
    element("#carbs-bar").style.width = `${Math.min(100, totals.carbs / 250 * 100)}%`;
    element("#fat-bar").style.width = `${Math.min(100, totals.fat / 70 * 100)}%`;
    renderTodayEntries();
    if (element("#view-food").classList.contains("active")) renderEntries("#food-entries", "meal");
    if (element("#view-movement").classList.contains("active")) renderEntries("#movement-entries", "exercise");
    element("#pantry-chips").innerHTML = state.pantry.map((item) => `<span class="ingredient-chip">${escapeHtml(item)}</span>`).join("");
    element("#pantry-form [name=ingredients]").value = state.pantry.join(", ");
    element("#goals-form [name=calories]").value = String(state.goals.calories);
    element("#goals-form [name=protein]").value = String(state.goals.protein);
    const profileForm = element("#fitness-profile-form");
    Object.entries(state.fitnessProfile).forEach(([name, value]) => {
      const field = profileForm.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.value = value === null ? "" : String(value);
      }
    });
  }
  function initializeDashboard() {
    renderDateLabels();
    window.addEventListener("goodday:log-sort-changed", renderDashboard);
  }
  function renderEntriesForView(type) {
    renderEntries(type === "meal" ? "#food-entries" : "#movement-entries", type);
  }

  // src/client/api.ts
  function estimateMeal(title, detail) {
    return request("/api/estimate", {
      method: "POST",
      body: JSON.stringify({ type: "meal", title, detail })
    });
  }
  function estimateExercise(title, detail) {
    return request("/api/estimate", {
      method: "POST",
      body: JSON.stringify({ type: "exercise", title, detail })
    });
  }
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json", ...options.headers }
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/api/auth/")) {
        window.dispatchEvent(new Event("goodday:unauthorized"));
      }
      const message = typeof data === "object" && data !== null && "error" in data ? String(data.error) : "Something went wrong. Please try again.";
      throw new Error(message);
    }
    return data;
  }
  function loadState() {
    return request("/api/state");
  }
  function loadHistory(days = 30) {
    return request(`/api/history?days=${days}`);
  }
  function createEntry(fields, type) {
    return request("/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...fields, type })
    });
  }
  function updatePantry(ingredients) {
    return request("/api/pantry", {
      method: "POST",
      body: JSON.stringify({ ingredients })
    });
  }
  function updateGoals(goals) {
    return request("/api/goals", {
      method: "POST",
      body: JSON.stringify(goals)
    });
  }
  function updateFitnessProfile(profile) {
    return request("/api/fitness-profile", {
      method: "POST",
      body: JSON.stringify(profile)
    });
  }
  function sendAssistantMessage(message, mode) {
    return request("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ message, mode })
    });
  }
  function loadAuthSession() {
    return request("/api/auth/session");
  }
  function login(username, password) {
    return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  }
  function register(username, password) {
    return request("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
  }
  function logout() {
    return request("/api/auth/logout", { method: "POST", body: "{}" });
  }
  function updateState(data) {
    state.entries = data.entries;
    state.pantry = data.pantry;
    state.goals = data.goals;
    state.fitnessProfile = data.fitnessProfile;
    state.messages = data.messages;
  }

  // src/client/notifications.ts
  var timeout;
  function notify(message, error = false) {
    const toast = element("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    if (timeout !== void 0) clearTimeout(timeout);
    timeout = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  // src/client/voice.ts
  var recognition = null;
  var speaking = false;
  function startVoiceInput(input, button) {
    const speechWindow = window;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Voice input isn't supported in this browser. You can still type your message.", true);
      return;
    }
    if (recognition) {
      recognition.stop();
      return;
    }
    const control = Recognition ? new Recognition() : null;
    if (!control) return;
    recognition = control;
    const originalText = input.value;
    control.lang = navigator.language || "en-US";
    control.interimResults = true;
    control.continuous = false;
    button.classList.add("recording");
    button.setAttribute("aria-label", "Stop voice input");
    button.title = "Listening \u2014 click to stop";
    element("#voice-status").textContent = "Listening\u2026";
    control.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      if (transcript) {
        const separator = originalText && !originalText.endsWith(" ") ? " " : "";
        input.value = `${originalText}${separator}${transcript}`;
      }
    };
    control.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        notify(`Voice input couldn't start: ${event.error}. You can still type.`, true);
      }
    };
    control.onend = () => {
      recognition = null;
      button.classList.remove("recording");
      button.setAttribute("aria-label", "Start voice input");
      button.title = "Dictate a message";
      element("#voice-status").textContent = "";
      input.focus();
    };
    try {
      control.start();
    } catch (error) {
      recognition = null;
      button.classList.remove("recording");
      button.setAttribute("aria-label", "Start voice input");
      element("#voice-status").textContent = "";
      notify(error instanceof Error ? error.message : "Voice input couldn't start.", true);
    }
  }
  function speakResponse(text) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      notify("Spoken replies aren't supported in this browser.", true);
      return;
    }
    if (speaking) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      speaking = true;
    };
    utterance.onend = () => {
      speaking = false;
    };
    utterance.onerror = () => {
      speaking = false;
    };
    window.speechSynthesis.speak(utterance);
  }

  // src/client/chat.ts
  function addMessage(role, text) {
    const item = document.createElement("div");
    item.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
    const avatar = role === "assistant" ? '<span class="message-avatar">\u2733</span>' : "";
    const label = role === "assistant" ? '<div class="message-actions"><small>YOUR WELLNESS COMPANION</small><button class="message-speak" type="button" aria-label="Listen to assistant response" title="Listen to response">\u25D6))</button></div>' : "";
    item.innerHTML = `${avatar}<div class="message-bubble"><p>${escapeHtml(text)}</p>${label}</div>`;
    if (role === "assistant") {
      item.querySelector(".message-speak")?.addEventListener("click", () => speakResponse(text));
    }
    const messages = element("#chat-messages");
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }
  function renderChatHistory() {
    if (!state.messages.length) return;
    const messages = element("#chat-messages");
    messages.replaceChildren();
    state.messages.forEach((message) => addMessage(message.role, message.content));
  }
  async function askAssistant(message, mode, output) {
    if (!message.trim()) {
      notify("Add a little detail so your coach can help.", true);
      return;
    }
    const button = mode === "recipes" ? element("#recipe-button") : mode === "workout" ? element("#workout-button") : element("#chat-form button[type=submit]");
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "Thinking...";
    try {
      const data = await sendAssistantMessage(message, mode);
      if (mode === "chat") {
        addMessage("assistant", data.answer);
        if (data.loggedEntry) {
          try {
            updateState(await loadState());
            renderDashboard();
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Please refresh the page.";
            notify(`Your entry was logged, but the tracker couldn't refresh: ${reason}`, true);
          }
        }
      } else if (output) output.textContent = data.answer;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Please try again.";
      if (mode === "chat") addMessage("assistant", `I'm sorry \u2014 I couldn't reach the coach just now. ${messageText}`);
      else if (output) output.textContent = `Couldn't get ideas right now. ${messageText}`;
      notify("The assistant couldn't respond. Please try again.", true);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
  function bindChat() {
    const panel = element("#coach-panel");
    const launcher = element("#coach-launcher");
    const setCoachOpen = (open) => {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", String(!open));
      launcher.setAttribute("aria-expanded", String(open));
      launcher.setAttribute("aria-label", open ? "Close AI coach chat" : "Open AI coach chat");
      if (open) element("#chat-input").focus();
      else launcher.focus();
    };
    launcher.addEventListener("click", () => setCoachOpen(panel.hidden));
    element("#coach-close").addEventListener("click", () => setCoachOpen(false));
    elements("[data-chat-open]").forEach((button) => {
      button.addEventListener("click", () => setCoachOpen(true));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) setCoachOpen(false);
    });
    element("#chat-mic").addEventListener("click", () => {
      startVoiceInput(element("#chat-input"), element("#chat-mic"));
    });
    element("#chat-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = element("#chat-input");
      const message = input.value.trim();
      if (!message) return;
      addMessage("user", message);
      input.value = "";
      await askAssistant(message, "chat", null);
    });
    elements(".suggestion-chip").forEach((button) => {
      button.addEventListener("click", () => {
        const input = element("#chat-input");
        input.value = button.textContent ?? "";
        input.focus();
      });
    });
    element("#recipe-button").addEventListener("click", () => {
      const prompt = element("#recipe-prompt").value || "Suggest recipes I can make with the ingredients in my pantry.";
      void askAssistant(prompt, "recipes", element("#recipe-output"));
    });
    element("#workout-button").addEventListener("click", () => {
      const prompt = element("#workout-prompt").value || "Suggest a balanced beginner-friendly workout for today.";
      void askAssistant(prompt, "workout", element("#workout-output"));
    });
  }

  // src/client/history.ts
  var metrics = {
    calories: { label: "Calories eaten", unit: "kcal", entryType: "meal", value: (entry) => number(entry.calories) },
    protein: { label: "Protein", unit: "g", entryType: "meal", value: (entry) => number(entry.protein) },
    carbs: { label: "Carbohydrates", unit: "g", entryType: "meal", value: (entry) => number(entry.carbs) },
    fat: { label: "Fat", unit: "g", entryType: "meal", value: (entry) => number(entry.fat) },
    fiber: { label: "Fiber", unit: "g", entryType: "meal", value: (entry) => number(entry.fiber) },
    movement: { label: "Movement sessions", unit: "sessions", entryType: "exercise", value: () => 1 },
    burned: { label: "Movement calories", unit: "kcal", entryType: "exercise", value: (entry) => number(entry.calories) }
  };
  var validRanges = [7, 30, 90, 365];
  var activeRange = 7;
  var requestVersion = 0;
  function formatHistoryDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(void 0, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
  }
  function dateKey(date) {
    return date.toISOString().slice(0, 10);
  }
  function historyDays(range) {
    const today = /* @__PURE__ */ new Date();
    return Array.from({ length: range }, (_, index) => {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      day.setUTCDate(day.getUTCDate() - (range - index - 1));
      return dateKey(day);
    });
  }
  function seriesFor(metric) {
    const totals = /* @__PURE__ */ new Map();
    state.history.forEach((entry) => {
      if (entry.type !== metric.entryType) return;
      const date = entry.created_at.slice(0, 10);
      totals.set(date, (totals.get(date) ?? 0) + metric.value(entry));
    });
    return historyDays(activeRange).map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }
  function formatAmount(value, metric) {
    const amount = metric.unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
    const unit = metric.unit === "sessions" && amount === 1 ? "session" : metric.unit;
    return `${amount.toLocaleString()} ${unit}`;
  }
  function tickLabel(date, range) {
    const [year, month, day] = date.split("-").map(Number);
    const value = new Date(year, month - 1, day);
    return range <= 7 ? new Intl.DateTimeFormat(void 0, { weekday: "short" }).format(value) : new Intl.DateTimeFormat(void 0, { month: "short", day: "numeric" }).format(value);
  }
  function renderChart() {
    const metricSelect = document.querySelector("#history-metric");
    if (!(metricSelect instanceof HTMLSelectElement)) throw new Error("The progress measure selector is missing.");
    const metricKey = metricSelect.value;
    const metric = metrics[metricKey] ?? metrics.calories;
    const data = seriesFor(metric);
    const total = data.reduce((sum, point) => sum + point.value, 0);
    const average = data.length ? total / data.length : 0;
    const best = Math.max(...data.map((point) => point.value), 0);
    element("#history-chart-summary").innerHTML = `<span>Daily average <strong>${escapeHtml(formatAmount(average, metric))}</strong></span><span>Highest day <strong>${escapeHtml(formatAmount(best, metric))}</strong></span>`;
    const width = 760;
    const height = 260;
    const margin = { top: 16, right: 18, bottom: 40, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const rawMax = Math.max(...data.map((point) => point.value), 0);
    const max = rawMax > 0 ? rawMax * 1.15 : 1;
    const x = (index) => margin.left + (data.length <= 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
    const y = (value) => margin.top + plotHeight - value / max * plotHeight;
    const line = data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(data.length - 1).toFixed(1)},${(margin.top + plotHeight).toFixed(1)} L${x(0).toFixed(1)},${(margin.top + plotHeight).toFixed(1)} Z`;
    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const value = max * (4 - index) / 4;
      const position = y(value);
      const label = metric.unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
      return `<line class="chart-grid-line" x1="${margin.left}" y1="${position}" x2="${width - margin.right}" y2="${position}"></line><text class="chart-axis-label" x="${margin.left - 10}" y="${position + 4}" text-anchor="end">${label.toLocaleString()}</text>`;
    }).join("");
    const tickCount = Math.min(7, data.length);
    const tickIndexes = Array.from({ length: tickCount }, (_, index) => Math.round(index * (data.length - 1) / Math.max(tickCount - 1, 1)));
    const xLabels = tickIndexes.map(
      (index) => `<text class="chart-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(tickLabel(data[index].date, activeRange))}</text>`
    ).join("");
    const points = data.map(
      (point, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(point.value)}" r="${activeRange <= 30 ? 3.5 : 2.2}"><title>${escapeHtml(formatHistoryDate(point.date))}: ${escapeHtml(formatAmount(point.value, metric))}</title></circle>`
    ).join("");
    const chart = element("#history-chart");
    chart.setAttribute("aria-label", `Daily ${metric.label.toLowerCase()} over the last ${activeRange} days`);
    chart.innerHTML = `<svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)} for each day, last ${activeRange} days"><defs><linearGradient id="progress-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6f9672" stop-opacity=".24"></stop><stop offset="100%" stop-color="#6f9672" stop-opacity=".02"></stop></linearGradient></defs>${gridLines}<path class="chart-area" d="${area}"></path><path class="chart-line" d="${line}"></path>${points}${xLabels}</svg>`;
  }
  function renderHistory() {
    const visibleDates = new Set(historyDays(activeRange));
    const visibleEntries = state.history.filter((entry) => visibleDates.has(entry.created_at.slice(0, 10)));
    const visibleGroups = /* @__PURE__ */ new Map();
    visibleEntries.forEach((entry) => {
      const date = entry.created_at.slice(0, 10);
      if (!visibleGroups.has(date)) visibleGroups.set(date, []);
      visibleGroups.get(date)?.push(entry);
    });
    const meals = visibleEntries.filter((entry) => entry.type === "meal").length;
    const movement = visibleEntries.filter((entry) => entry.type === "exercise").length;
    element("#history-days").textContent = String(visibleGroups.size);
    element("#history-meals").textContent = String(meals);
    element("#history-movement").textContent = String(movement);
    element("#history-range-label").textContent = `Last ${activeRange} days`;
    const order = logSortOrder();
    const days = [...visibleGroups.entries()].sort(
      ([first], [second]) => order === "newest" ? second.localeCompare(first) : first.localeCompare(second)
    );
    if (!days.length) {
      element("#history-list").innerHTML = `<div class="empty-state"><span class="empty-icon">\u2733</span><strong>Your history will show up here</strong><p>Log a meal or movement to start building your timeline.</p></div>`;
    } else {
      element("#history-list").innerHTML = days.map(([date, entries]) => {
        const dayMeals = entries.filter((entry) => entry.type === "meal");
        const dayMovement = entries.filter((entry) => entry.type === "exercise");
        const calories = dayMeals.reduce((total, entry) => total + number(entry.calories), 0);
        const protein = dayMeals.reduce((total, entry) => total + number(entry.protein), 0);
        const rows = sortEntriesByTime(entries).map((entry) => {
          const isMeal = entry.type === "meal";
          const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" \xB7 ");
          const time = new Date(entry.created_at).toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
          return `<div class="history-entry"><span class="entry-icon ${isMeal ? "" : "exercise"}">${isMeal ? "\u25C9" : "\u2197"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (isMeal ? "Meal or snack" : "Movement"))} \xB7 ${time}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
        }).join("");
        const mealLabel = `${dayMeals.length} ${dayMeals.length === 1 ? "meal" : "meals"}`;
        const movementLabel = `${dayMovement.length} ${dayMovement.length === 1 ? "session" : "sessions"}`;
        return `<article class="history-day"><header class="history-day-heading"><div><h3>${formatHistoryDate(date)}</h3><span>${entries.length} ${entries.length === 1 ? "entry" : "entries"}</span></div><div class="history-day-totals"><span>${mealLabel}</span><strong>${Math.round(calories).toLocaleString()} kcal</strong><span>${Math.round(protein)}g protein</span><span>${movementLabel}</span></div></header><div class="history-entries">${rows}</div></article>`;
      }).join("");
    }
    renderChart();
  }
  function bindHistory() {
    window.addEventListener("goodday:log-sort-changed", renderHistory);
    elements("[data-history-days]").forEach((button) => {
      button.addEventListener("click", () => {
        const range = Number(button.dataset.historyDays);
        if (!validRanges.includes(range)) return;
        activeRange = range;
        elements("[data-history-days]").forEach((option) => {
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
  async function refreshHistory() {
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

  // src/client/authentication.ts
  function formValue(form, name) {
    const field = form.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement)) throw new Error(`Missing authentication field: ${name}`);
    return field.value;
  }
  function errorText(error) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
  async function initializeAuthentication(onAuthenticated) {
    const screen = element("#auth-screen");
    const shell = element(".app-shell");
    const message = element("#auth-message");
    const loginForm = element("#login-form");
    const registerForm = element("#register-form");
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      const inputId = button.dataset.passwordToggle;
      const input = inputId ? document.getElementById(inputId) : null;
      if (!(input instanceof HTMLInputElement)) throw new Error("The password visibility input is missing.");
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const visible = input.type === "password";
        input.type = visible ? "text" : "password";
        button.textContent = visible ? "Hide" : "Show";
        button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
        button.setAttribute("aria-pressed", String(visible));
      });
    });
    const showScreen = (notice = "") => {
      shell.hidden = true;
      screen.hidden = false;
      loginForm.hidden = false;
      registerForm.hidden = true;
      message.textContent = notice;
      element("#account-name").textContent = "";
      element("#account-avatar").textContent = "";
      state.entries = [];
      state.history = [];
      state.pantry = [];
      state.messages = [];
    };
    const enterApp = async (username) => {
      screen.hidden = true;
      shell.hidden = false;
      element("#account-name").textContent = username;
      element("#account-avatar").textContent = username.slice(0, 1).toUpperCase();
      message.textContent = "";
      await onAuthenticated(username);
    };
    const bindAuthForm = (form, action) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("[type=submit]");
        if (button) button.disabled = true;
        message.textContent = "";
        try {
          const username = formValue(form, "username").trim().toLowerCase();
          const response = await action(username, formValue(form, "password"));
          if (!response.authenticated || !response.username) throw new Error("The server did not start a sign-in session.");
          form.reset();
          await enterApp(response.username);
        } catch (error) {
          message.textContent = errorText(error);
        } finally {
          if (button) button.disabled = false;
        }
      });
    };
    bindAuthForm(loginForm, login);
    bindAuthForm(registerForm, register);
    element("[data-auth-mode=register]").addEventListener("click", () => {
      loginForm.hidden = true;
      registerForm.hidden = false;
      message.textContent = "";
      formValueFocus(registerForm, "username");
    });
    element("[data-auth-mode=login]").addEventListener("click", () => {
      registerForm.hidden = true;
      loginForm.hidden = false;
      message.textContent = "";
      formValueFocus(loginForm, "username");
    });
    element("#logout-button").addEventListener("click", async () => {
      const button = element("#logout-button");
      button.disabled = true;
      try {
        await logout();
        showScreen("You have been signed out.");
      } catch (error) {
        notify(errorText(error), true);
      } finally {
        button.disabled = false;
      }
    });
    window.addEventListener("goodday:unauthorized", () => {
      showScreen("Your session has ended. Please sign in again.");
    });
    try {
      const current = await loadAuthSession();
      if (current.authenticated && current.username) {
        await enterApp(current.username);
      } else {
        showScreen();
      }
    } catch (error) {
      showScreen(`Couldn't check your sign-in: ${errorText(error)}`);
    }
  }
  function formValueFocus(form, name) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLElement) field.focus();
  }

  // src/client/forms.ts
  async function refreshTracker() {
    updateState(await loadState());
    renderDashboard();
    renderChatHistory();
  }
  function inputValue(form, name) {
    const field = form.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
      throw new Error(`Missing form field: ${name}`);
    }
    return field.value;
  }
  async function submitEntry(form, type) {
    const estimateKey = JSON.stringify([inputValue(form, "title").trim(), inputValue(form, "detail").trim()]);
    const previousEstimateKey = form.dataset.aiEstimateKey;
    const requiredEstimateFields = type === "meal" ? ["calories", "protein", "carbs", "fat", "fiber"] : ["calories", "muscleGroups"];
    const hasCompleteValues = requiredEstimateFields.every((name) => inputValue(form, name).trim() !== "");
    if (previousEstimateKey && previousEstimateKey !== estimateKey || !hasCompleteValues) {
      const submitButton = form.querySelector("[type=submit]");
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
      ...type === "meal" ? {
        protein: Number(inputValue(form, "protein")),
        carbs: Number(inputValue(form, "carbs")),
        fat: Number(inputValue(form, "fat")),
        fiber: Number(inputValue(form, "fiber"))
      } : {
        muscleGroups: inputValue(form, "muscleGroups")
      }
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
    element(type === "meal" ? "#meal-estimate-notes" : "#exercise-estimate-notes").textContent = type === "meal" ? "AI suggestions are approximate. Review and edit the values before logging." : "AI suggestions are approximate and can be edited before logging.";
    await refreshTracker();
    notify(type === "meal" ? "Added to your food log \u2733" : "Movement added \u2014 nice work \u2733");
  }
  async function estimateForm(form, type, overwrite = true) {
    const title = inputValue(form, "title").trim();
    const detail = inputValue(form, "detail").trim();
    const estimateKey = JSON.stringify([title, detail]);
    if (type === "meal") {
      const { estimate } = await estimateMeal(title, detail);
      for (const [name, value] of Object.entries(estimate)) {
        if (name === "notes") continue;
        const field = form.elements.namedItem(name);
        if (overwrite || !field.value.trim()) field.value = String(value);
      }
      element("#meal-estimate-notes").textContent = `AI estimate \u2014 review and edit before saving. ${estimate.notes}`;
    } else {
      const { estimate } = await estimateExercise(title, detail);
      const calories = form.elements.namedItem("calories");
      const muscleGroups = form.elements.namedItem("muscleGroups");
      if (overwrite || !calories.value.trim()) calories.value = String(estimate.calories);
      if (overwrite || !muscleGroups.value.trim()) muscleGroups.value = estimate.muscleGroups;
      element("#exercise-estimate-notes").textContent = `AI estimate \u2014 review and edit before saving. ${estimate.notes}`;
    }
    form.dataset.aiEstimateKey = estimateKey;
  }
  function handleFormError(error) {
    notify(error instanceof Error ? error.message : "Something went wrong. Please try again.", true);
  }
  function bindForms() {
    element("#estimate-meal-button").addEventListener("click", async () => {
      const form = element("#meal-form");
      const button = element("#estimate-meal-button");
      const submitButton = form.querySelector("[type=submit]");
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
        button.innerHTML = "Estimate nutrition with AI <span>\u2733</span>";
      }
    });
    element("#estimate-exercise-button").addEventListener("click", async () => {
      const form = element("#exercise-form");
      const button = element("#estimate-exercise-button");
      const submitButton = form.querySelector("[type=submit]");
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
        button.innerHTML = "Estimate with AI <span>\u2733</span>";
      }
    });
    element("#meal-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await submitEntry(event.currentTarget, "meal");
      } catch (error) {
        handleFormError(error);
      }
    });
    element("#exercise-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await submitEntry(event.currentTarget, "exercise");
      } catch (error) {
        handleFormError(error);
      }
    });
    element("#pantry-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const ingredients = inputValue(form, "ingredients").split(",").map((item) => item.trim()).filter(Boolean);
      try {
        const data = await updatePantry(ingredients);
        state.pantry = data.ingredients;
        renderDashboard();
        notify("Pantry updated \u2733");
      } catch (error) {
        handleFormError(error);
      }
    });
    element("#goals-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await updateGoals({
          calories: Number(inputValue(form, "calories")),
          protein: Number(inputValue(form, "protein"))
        });
        await refreshTracker();
        showView("today");
        notify("Your guides are updated \u2733");
      } catch (error) {
        handleFormError(error);
      }
    });
    element("#fitness-profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const optionalNumber = (name) => {
        const value = inputValue(form, name).trim();
        return value ? Number(value) : null;
      };
      try {
        await updateFitnessProfile({
          fitnessGoal: inputValue(form, "fitnessGoal"),
          goalDetails: inputValue(form, "goalDetails"),
          age: optionalNumber("age"),
          genderIdentity: inputValue(form, "genderIdentity"),
          heightCm: optionalNumber("heightCm"),
          weightKg: optionalNumber("weightKg"),
          activityLevel: inputValue(form, "activityLevel"),
          trainingExperience: inputValue(form, "trainingExperience"),
          targetEvent: inputValue(form, "targetEvent"),
          targetEventDate: inputValue(form, "targetEventDate"),
          limitations: inputValue(form, "limitations"),
          equipment: inputValue(form, "equipment"),
          preferredActivities: inputValue(form, "preferredActivities")
        });
        await refreshTracker();
        notify("Your fitness profile is updated \u2733");
      } catch (error) {
        handleFormError(error);
      }
    });
  }
  function showView(name) {
    const view = document.querySelector(`#view-${name}`);
    if (!view) return;
    elements(".view-panel").forEach((panel) => panel.classList.toggle("active", panel === view));
    elements(".nav-item").forEach((item) => {
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
  function bindNavigation() {
    elements("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.view;
        if (!name) return;
        showView(name);
        if (name === "history") void refreshHistory();
      });
    });
    elements("[data-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.open;
        if (name) showView(name);
      });
    });
  }
  async function initializeApp() {
    bindNavigation();
    bindForms();
    bindChat();
    bindHistory();
    await initializeAuthentication(async () => {
      try {
        await refreshTracker();
      } catch (error) {
        notify(`Couldn't load your tracker: ${error instanceof Error ? error.message : "Please try again."}`, true);
      }
    });
  }

  // src/client/main.ts
  initializeDashboard();
  initializeLogSorting();
  void initializeApp();
})();
