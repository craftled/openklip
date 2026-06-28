/** Resolve any CSS color (including var()) to #rrggbb for WebGL/canvas consumers. */
export function cssColorToHex(color: string, fallback = "#000000"): string {
  if (typeof document === "undefined") {
    return fallback;
  }

  const probe = document.createElement("div");
  probe.style.color = color;
  probe.style.display = "none";
  document.documentElement.append(probe);

  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(computed);
  if (!match) {
    return fallback;
  }

  const [, r, g, b] = match;
  const toHex = (n: string) =>
    Number.parseInt(n, 10).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
