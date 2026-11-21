import { element } from "./dom";

let timeout: ReturnType<typeof setTimeout> | undefined;

export function notify(message: string, error = false): void {
  const toast = element<HTMLDivElement>("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  if (timeout !== undefined) clearTimeout(timeout);
  timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}
