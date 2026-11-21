import { loadAuthSession, login, logout, register } from "./api";
import { element } from "./dom";
import { notify } from "./notifications";
import { state } from "./state";

type AuthAction = (username: string, password: string) => ReturnType<typeof login>;

function formValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) throw new Error(`Missing authentication field: ${name}`);
  return field.value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function initializeAuthentication(onAuthenticated: (username: string) => Promise<void>): Promise<void> {
  const screen = element<HTMLElement>("#auth-screen");
  const shell = element<HTMLElement>(".app-shell");
  const message = element<HTMLElement>("#auth-message");
  const loginForm = element<HTMLFormElement>("#login-form");
  const registerForm = element<HTMLFormElement>("#register-form");

  document.querySelectorAll<HTMLButtonElement>("[data-password-toggle]").forEach((button) => {
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

  const showScreen = (notice = ""): void => {
    shell.hidden = true;
    screen.hidden = false;
    loginForm.hidden = false;
    registerForm.hidden = true;
    message.textContent = notice;
    element<HTMLElement>("#account-name").textContent = "";
    element<HTMLElement>("#account-avatar").textContent = "";
    state.entries = [];
    state.history = [];
    state.pantry = [];
    state.messages = [];
  };

  const enterApp = async (username: string): Promise<void> => {
    screen.hidden = true;
    shell.hidden = false;
    element<HTMLElement>("#account-name").textContent = username;
    element<HTMLElement>("#account-avatar").textContent = username.slice(0, 1).toUpperCase();
    message.textContent = "";
    await onAuthenticated(username);
  };

  const bindAuthForm = (form: HTMLFormElement, action: AuthAction): void => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>("[type=submit]");
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

  element<HTMLButtonElement>("[data-auth-mode=register]").addEventListener("click", () => {
    loginForm.hidden = true;
    registerForm.hidden = false;
    message.textContent = "";
    formValueFocus(registerForm, "username");
  });
  element<HTMLButtonElement>("[data-auth-mode=login]").addEventListener("click", () => {
    registerForm.hidden = true;
    loginForm.hidden = false;
    message.textContent = "";
    formValueFocus(loginForm, "username");
  });

  element<HTMLButtonElement>("#logout-button").addEventListener("click", async () => {
    const button = element<HTMLButtonElement>("#logout-button");
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

function formValueFocus(form: HTMLFormElement, name: string): void {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLElement) field.focus();
}
