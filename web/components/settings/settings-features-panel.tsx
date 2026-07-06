"use client";

import {
  SETTINGS_CARD_CLASS,
  SETTINGS_CARD_ROW_CLASS,
  SETTINGS_CARD_ROW_DESCRIPTION_CLASS,
  SETTINGS_CARD_ROW_TITLE_CLASS,
  SETTINGS_PANEL_SECTION_CLASS,
} from "@/components/settings/settings-panel-primitives";
import { OPENKLIP_FEATURE_GROUPS } from "@/lib/openklip-features";
import { SIDEBAR_SECTION_LABEL_CLASS } from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

export function SettingsFeaturesPanel() {
  return (
    <div className="flex flex-col gap-1">
      {OPENKLIP_FEATURE_GROUPS.map((group) => (
        <section className={SETTINGS_PANEL_SECTION_CLASS} key={group.id}>
          <h2 className={cn("px-2 py-1", SIDEBAR_SECTION_LABEL_CLASS)}>
            {group.title}
          </h2>
          <div className={SETTINGS_CARD_CLASS}>
            {group.features.map((feature) => (
              <div className={SETTINGS_CARD_ROW_CLASS} key={feature.title}>
                <h3 className={SETTINGS_CARD_ROW_TITLE_CLASS}>
                  {feature.title}
                </h3>
                <p className={SETTINGS_CARD_ROW_DESCRIPTION_CLASS}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
