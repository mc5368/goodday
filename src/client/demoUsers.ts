const STORAGE_KEY = "goodday-user-id";

export const demoUsers = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Demo profile 1" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Demo profile 2" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Demo profile 3" },
] as const;

export function isLocalDevelopment(): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function initializeDemoUserSelector(): void {
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

const savedUserId = localStorage.getItem(STORAGE_KEY);
const localHostname = isLocalDevelopment();
const savedDemoUser = demoUsers.find((user) => user.id === savedUserId);
export const userId = localHostname
  ? savedDemoUser?.id ?? demoUsers[0].id
  : savedUserId || crypto.randomUUID();

localStorage.setItem(STORAGE_KEY, userId);
