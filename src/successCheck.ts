/** Total path-draw animation (duration + delay), in ms. */
export const SUCCESS_CHECK_MS = 580;

/** Hold the success state before navigating away. */
export const SUCCESS_CHECK_HOLD_MS = 650;

export type SuccessCheckState = "out" | "in";

export function successCheckInitialState(): SuccessCheckState {
  return "out";
}

export function successCheckActiveState(): SuccessCheckState {
  return "in";
}
