export const TEXT_SWAP_MS = 150;

export type TextSwapPhase = "idle" | "exit" | "enter-start";

export function textSwapClasses(phase: TextSwapPhase): string[] {
  const classes = ["t-text-swap"];
  if (phase === "exit") {
    classes.push("is-exit");
  }
  if (phase === "enter-start") {
    classes.push("is-enter-start");
  }
  return classes;
}

export function textSwapInitialPhase(): TextSwapPhase {
  return "enter-start";
}

export function textSwapPhaseAfterExit(): TextSwapPhase {
  return "enter-start";
}

export function textSwapPhaseAfterEnterStart(): TextSwapPhase {
  return "idle";
}

export function textSwapNeedsChange(display: string, next: string): boolean {
  return display !== next;
}
