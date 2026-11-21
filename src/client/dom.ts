export function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Required page element was not found: ${selector}`);
  return found;
}

export function elements<T extends Element = HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
