export function shouldAutoOpenConfig(input: {
  hasOverlayInspector: boolean;
  selRange: readonly [number, number] | null;
}): boolean {
  return input.hasOverlayInspector || input.selRange !== null;
}
