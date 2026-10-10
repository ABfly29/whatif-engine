import { warmCalculator } from "./api";

/**
 * Spread onto links to the calculator. Starts loading the engine as soon as
 * someone shows intent (hover, keyboard focus or touch), so it is often ready
 * by the time the calculator opens.
 */
export const warmOnIntent = {
  onPointerEnter: warmCalculator,
  onFocus: warmCalculator,
  onTouchStart: warmCalculator,
};
