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
  var state = {
    entries: [],
    history: [],
    pantry: [],
    goals: { calories: 2e3, protein: 120 },
    messages: []
  };
  function number(value) {
    return Number(value || 0);
  }

  // src/client/dashboard.ts
  function renderEntries(target, type) {
    const entries = state.entries.filter((entry) => entry.type === type);
    const container = element(target);
    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">\u2733</span><strong>${type === "meal" ? "No meals logged yet" : "No movement logged yet"}</strong><p>${type === "meal" ? "Whenever you like, add something you enjoyed." : "A walk, a stretch, a dance \u2014 it all counts."}</p></div>`;
    } else {
      container.innerHTML = entries.map((entry) => {
        const details = [entry.detail, entry.muscle_groups].filter(Boolean).join(" \xB7 ");
        return `<div class="entry-item"><span class="entry-icon ${type === "exercise" ? "exercise" : ""}">${type === "meal" ? "\u25C9" : "\u2197"}</span><div class="entry-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(details || (type === "meal" ? "Meal or snack" : "Movement"))}</span></div><span class="entry-calories">${number(entry.calories).toLocaleString()} kcal</span></div>`;
      }).join("");
    }
    if (target === "#today-entries") {
      element("#movement-count").textContent = String(state.entries.filter((entry) => entry.type === "exercise").length);
    }
    if (target === "#food-entries") {
      element("#food-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
    }
    if (target === "#movement-entries") {
      element("#movement-total").textContent = `${entries.length} ${entries.length === 1 ? "session" : "sessions"}`;
    }
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
    element("#calories-burned").textContent = `${Math.round(burned).toLocaleString()} kcal`;
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
    renderEntries("#today-entries", "meal");
    if (element("#view-food").classList.contains("active")) renderEntries("#food-entries", "meal");
    if (element("#view-movement").classList.contains("active")) renderEntries("#movement-entries", "exercise");
    element("#pantry-chips").innerHTML = state.pantry.map((item) => `<span class="ingredient-chip">${escapeHtml(item)}</span>`).join("");
    element("#pantry-form [name=ingredients]").value = state.pantry.join(", ");
    element("#goals-form [name=calories]").value = String(state.goals.calories);
    element("#goals-form [name=protein]").value = String(state.goals.protein);
  }
  function initializeDashboard() {
    renderDateLabels();
  }
  function renderEntriesForView(type) {
    renderEntries(type === "meal" ? "#food-entries" : "#movement-entries", type);
  }

  // src/client/demoUsers.ts
  var STORAGE_KEY = "goodday-user-id";
  var demoUsers = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Demo profile 1" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Demo profile 2" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Demo profile 3" }
  ];
  function isLocalDevelopment() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  }
  function initializeDemoUserSelector() {
    if (!isLocalDevelopment()) return;
    const selector = document.querySelector("#demo-user-select");
    if (!(selector instanceof HTMLSelectElement)) {
      throw new Error("The local demo profile selector is missing.");
    }
    selector.hidden = false;
    selector.value = userId;
    selector.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEY, selector.value);
      window.location.reload();
    });
  }
  var savedUserId = localStorage.getItem(STORAGE_KEY);
  var localHostname = isLocalDevelopment();
  var savedDemoUser = demoUsers.find((user) => user.id === savedUserId);
  var userId = localHostname ? savedDemoUser?.id ?? demoUsers[0].id : savedUserId || crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, userId);

  // src/client/api.ts
  function estimateMeal(title, detail) {
    return request("/api/estimate", {
      method: "POST",
      body: JSON.stringify({ userId, type: "meal", title, detail })
    });
  }
  function estimateExercise(title, detail) {
    return request("/api/estimate", {
      method: "POST",
      body: JSON.stringify({ userId, type: "exercise", title, detail })
    });
  }
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers }
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }
    if (!response.ok) {
      const message = typeof data === "object" && data !== null && "error" in data ? String(data.error) : "Something went wrong. Please try again.";
      throw new Error(message);
    }
    return data;
  }
  function loadState() {
    return request(`/api/state?userId=${encodeURIComponent(userId)}`);
  }
  function loadHistory() {
    return request(`/api/history?userId=${encodeURIComponent(userId)}`);
  }
  function createEntry(fields, type) {
    return request("/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...fields, userId, type })
    });
  }
  function updatePantry(ingredients) {
    return request("/api/pantry", {
      method: "POST",
      body: JSON.stringify({ userId, ingredients })
    });
  }
  function updateGoals(goals) {
    return request("/api/goals", {
      method: "POST",
      body: JSON.stringify({ userId, ...goals })
    });
  }
  function sendAssistantMessage(message, mode) {
    return request("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ userId, message, mode })
    });
  }
  function updateState(data) {
    state.entries = data.entries;
    state.pantry = data.pantry;
    state.goals = data.goals;
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
    const button = mode === "recipes" ? element("#recipe-button") : mode === "workout" ? element("#workout-button") : element("#chat-form button");
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
  function formatHistoryDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(void 0, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
  }
  function renderHistory() {
    const groups = /* @__PURE__ */ new Map();
    state.history.forEach((entry) => {
      const date = entry.created_at.slice(0, 10);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)?.push(entry);
    });
    const meals = state.history.filter((entry) => entry.type === "meal").length;
    const movement = state.history.filter((entry) => entry.type === "exercise").length;
    element("#history-days").textContent = String(groups.size);
    element("#history-meals").textContent = String(meals);
    element("#history-movement").textContent = String(movement);
    const days = [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
    if (!days.length) {
      element("#history-list").innerHTML = `<div class="empty-state"><span class="empty-icon">\u2733</span><strong>Your history will show up here</strong><p>Log a meal or movement to start building your timeline.</p></div>`;
      return;
    }
    element("#history-list").innerHTML = days.map(([date, entries]) => {
      const dayMeals = entries.filter((entry) => entry.type === "meal");
      const dayMovement = entries.filter((entry) => entry.type === "exercise");
      const calories = dayMeals.reduce((total, entry) => total + number(entry.calories), 0);
      const protein = dayMeals.reduce((total, entry) => total + number(entry.protein), 0);
      const rows = entries.map((entry) => {
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
  async function refreshHistory() {
    try {
      const data = await loadHistory();
      state.history = data.entries;
      renderHistory();
    } catch (error) {
      notify(`Couldn't load your history: ${error instanceof Error ? error.message : "Please try again."}`, true);
    }
  }

  // src/client/forms.ts
  async function refreshTracker() {
    updateState(await loadState());
    renderDashboard();
    renderChatHistory();
  }
  function inputValue(form, name) {
    const field = form.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
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
    try {
      await refreshTracker();
    } catch (error) {
      notify(`Couldn't load your tracker: ${error instanceof Error ? error.message : "Please try again."}`, true);
    }
  }

  // src/client/main.ts
  initializeDashboard();
  initializeDemoUserSelector();
  void initializeApp();
})();
