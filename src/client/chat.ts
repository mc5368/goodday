import { loadState, sendAssistantMessage, updateState } from "./api";
import { element, elements, escapeHtml } from "./dom";
import { notify } from "./notifications";
import { renderDashboard } from "./dashboard";
import { state } from "./state";
import type { AssistantMode, ChatMessage } from "./types";
import { speakResponse, startVoiceInput } from "./voice";

function addMessage(role: ChatMessage["role"], text: string): void {
  const item = document.createElement("div");
  item.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const avatar = role === "assistant" ? '<span class="message-avatar">✳</span>' : "";
  const label = role === "assistant" ? '<div class="message-actions"><small>YOUR WELLNESS COMPANION</small><button class="message-speak" type="button" aria-label="Listen to assistant response" title="Listen to response">◖))</button></div>' : "";
  item.innerHTML = `${avatar}<div class="message-bubble"><p>${escapeHtml(text)}</p>${label}</div>`;
  if (role === "assistant") {
    item.querySelector(".message-speak")?.addEventListener("click", () => speakResponse(text));
  }
  const messages = element<HTMLDivElement>("#chat-messages");
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

export function renderChatHistory(): void {
  if (!state.messages.length) return;
  const messages = element<HTMLDivElement>("#chat-messages");
  messages.replaceChildren();
  state.messages.forEach((message) => addMessage(message.role, message.content));
}

export async function askAssistant(
  message: string,
  mode: AssistantMode,
  output: HTMLElement | null,
): Promise<void> {
  if (!message.trim()) {
    notify("Add a little detail so your coach can help.", true);
    return;
  }

  const button = mode === "recipes"
    ? element<HTMLButtonElement>("#recipe-button")
    : mode === "workout"
      ? element<HTMLButtonElement>("#workout-button")
      : element<HTMLButtonElement>("#chat-form button");
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
    }
    else if (output) output.textContent = data.answer;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Please try again.";
    if (mode === "chat") addMessage("assistant", `I'm sorry — I couldn't reach the coach just now. ${messageText}`);
    else if (output) output.textContent = `Couldn't get ideas right now. ${messageText}`;
    notify("The assistant couldn't respond. Please try again.", true);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

export function bindChat(): void {
  element<HTMLButtonElement>("#chat-mic").addEventListener("click", () => {
    startVoiceInput(element<HTMLTextAreaElement>("#chat-input"), element<HTMLButtonElement>("#chat-mic"));
  });

  element<HTMLFormElement>("#chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = element<HTMLTextAreaElement>("#chat-input");
    const message = input.value.trim();
    if (!message) return;
    addMessage("user", message);
    input.value = "";
    await askAssistant(message, "chat", null);
  });

  elements<HTMLButtonElement>(".suggestion-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const input = element<HTMLTextAreaElement>("#chat-input");
      input.value = button.textContent ?? "";
      input.focus();
    });
  });

  element<HTMLButtonElement>("#recipe-button").addEventListener("click", () => {
    const prompt = element<HTMLInputElement>("#recipe-prompt").value
      || "Suggest recipes I can make with the ingredients in my pantry.";
    void askAssistant(prompt, "recipes", element<HTMLDivElement>("#recipe-output"));
  });

  element<HTMLButtonElement>("#workout-button").addEventListener("click", () => {
    const prompt = element<HTMLInputElement>("#workout-prompt").value
      || "Suggest a balanced beginner-friendly workout for today.";
    void askAssistant(prompt, "workout", element<HTMLDivElement>("#workout-output"));
  });
}
