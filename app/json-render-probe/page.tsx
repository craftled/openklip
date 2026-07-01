import {
  sampleProductAnnouncementSpec,
  validateProductAnnouncementSpec,
} from "@engine/product-announcement";
import { ProductAnnouncementFrame } from "@/components/product-announcement-frame";

const validation = validateProductAnnouncementSpec(
  sampleProductAnnouncementSpec
);
const specJson = JSON.stringify(sampleProductAnnouncementSpec, null, 2);

export default function JsonRenderProbePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-border border-b pb-4">
          <div>
            <p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.18em]">
              OpenKlip probe
            </p>
            <h1 className="mt-2 font-semibold text-3xl">
              json-render announcement frame
            </h1>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-1 font-medium text-sm">
            {validation.success ? "Valid spec" : "Invalid spec"}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="relative aspect-video min-w-0 overflow-hidden rounded-md border border-border bg-black">
            {validation.success && validation.spec ? (
              <div className="absolute top-0 left-0 origin-top-left scale-[0.4]">
                <ProductAnnouncementFrame spec={validation.spec} />
              </div>
            ) : (
              <div className="p-4 text-destructive">
                {validation.issues.join("\n")}
              </div>
            )}
          </div>

          <aside className="min-w-0 rounded-md border border-border bg-card p-4">
            <h2 className="font-semibold text-sm uppercase tracking-[0.14em]">
              Generated spec
            </h2>
            <pre className="mt-4 max-h-[34rem] overflow-auto rounded-md bg-black p-4 text-white text-xs leading-relaxed">
              {specJson}
            </pre>
          </aside>
        </section>
      </div>
    </main>
  );
}
