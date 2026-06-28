"use client";

import type { SidebarContextProps } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { useEditorSidebarShortcuts } from "@/hooks/use-editor-sidebar-shortcuts";

/** Registers ⌘B (agent) and ⌘I (inspector) once — must render inside the inspector SidebarProvider. */
export function EditorSidebarShortcuts({
  agentSidebar,
}: {
  agentSidebar: Pick<SidebarContextProps, "toggleSidebarInstant">;
}) {
  const inspectorSidebar = useSidebar();

  useEditorSidebarShortcuts({
    onToggleAgent: agentSidebar.toggleSidebarInstant,
    onToggleInspector: inspectorSidebar.toggleSidebarInstant,
  });

  return null;
}
