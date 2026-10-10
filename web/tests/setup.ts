import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Some test files run in the node environment (no DOM); skip browser shims there.
if (typeof window !== "undefined") {
  afterEach(() => cleanup());
  installBrowserShims();
}

function installBrowserShims() {
  // Recharts measures its container with ResizeObserver.
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom has no matchMedia; components use it for reduced-motion checks.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  // jsdom does not implement canvas; report "no WebGL" so the hero uses its
  // static fallback instead of logging "not implemented" errors.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

  // jsdom does not implement scrolling.
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = (() => {}) as typeof Element.prototype.scrollIntoView;
}
