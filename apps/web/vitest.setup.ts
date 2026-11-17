import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// React Flow measures its container and nodes; jsdom has no layout engine.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

if (!("matchMedia" in window)) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  );
}

// Give React Flow a non-zero viewport in jsdom.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 1200
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 800
});
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => ({ x: 0, y: 0, width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800, toJSON: () => ({}) })
});
