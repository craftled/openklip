// Browser-safe graphic template kind lookup. Avoids importing graphics.ts
// (node:fs) from client components such as web/app.tsx via cut-transition-gate.

const TEXT_GRAPHIC_TEMPLATES = new Set(["lower-third", "kinetic-caption"]);

/** True when the template renders through headless Chrome (rich path). */
export function graphicTemplateIsRich(template: string): boolean {
  return !TEXT_GRAPHIC_TEMPLATES.has(template);
}
