"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { useEditorSidebarShortcuts } from "@/hooks/use-editor-sidebar-shortcuts";

/** Registers Mod+B (agent) and Mod+I (inspector) once inside the inspector SidebarProvider. */
export function EditorSidebarShortcuts({
  agentSidebar,
}: {
  agentSidebar: Pick<ReturnType<typeof useSidebar>, "toggleSidebar">;
}) {
  const inspectorSidebar = useSidebar();

  useEditorSidebarShortcuts({
    onToggleAgent: agentSidebar.toggleSidebar,
    onToggleInspector: inspectorSidebar.toggleSidebar,
  });

  return null;
}
