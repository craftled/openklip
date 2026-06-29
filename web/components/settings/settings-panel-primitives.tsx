import type { ReactNode } from "react";
import { SIDEBAR_SECTION_LABEL_CLASS } from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

export const SETTINGS_CARD_CLASS =
  "overflow-hidden rounded-lg border border-border bg-transparent divide-y divide-border";

export const SETTINGS_CARD_ROW_CLASS = "px-3 py-2.5";

export const SETTINGS_CARD_ROW_TITLE_CLASS =
  "text-[12px] font-medium text-foreground";

export const SETTINGS_CARD_ROW_DESCRIPTION_CLASS =
  "text-[12px] text-tertiary leading-relaxed";

export const SETTINGS_PANEL_SECTION_CLASS =
  "flex flex-col gap-1.5 not-first:mt-4";

export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className={SETTINGS_CARD_CLASS}>{children}</div>;
}

export function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className={SETTINGS_PANEL_SECTION_CLASS}>
      <h2 className={cn("px-2 py-1", SIDEBAR_SECTION_LABEL_CLASS)}>{title}</h2>
      <SettingsCard>{children}</SettingsCard>
    </section>
  );
}

export function SettingsRow({
  children,
  control,
  description,
  title,
}: {
  children?: ReactNode;
  control?: ReactNode;
  description: string;
  title: ReactNode;
}) {
  return (
    <div className={SETTINGS_CARD_ROW_CLASS} data-slot="settings-row">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className={SETTINGS_CARD_ROW_TITLE_CLASS}>{title}</h3>
          <p className={SETTINGS_CARD_ROW_DESCRIPTION_CLASS}>{description}</p>
          {children}
        </div>
        {control ? (
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </div>
        ) : null}
      </div>
    </div>
  );
}
