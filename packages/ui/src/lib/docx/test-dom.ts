import { JSDOM } from "jsdom";

/**
 * The splitter parses with the platform `DOMParser`, and TipTap's `generateHTML` /
 * `generateJSON` reach for a global `document`. Bun provides neither, so tests
 * install jsdom's before importing anything that uses them.
 */
export function installTestDom(): void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const globals = globalThis as unknown as Record<string, unknown>;

  const names = [
    "window",
    "document",
    "DOMParser",
    "Node",
    "Element",
    "HTMLElement",
    "DocumentFragment",
    "XMLSerializer",
    "NodeFilter",
  ] as const;

  globals.window ??= dom.window;
  for (const name of names) {
    globals[name] ??= (dom.window as unknown as Record<string, unknown>)[name];
  }
}
