export const CONFIG_SIDEBAR_WIDTH = 288;
export const CHAT_WIDTH_WITH_CONFIG = 360;

export type MobileRightPanel = "chat" | "config" | null;

export function visibleChatWidth(
  chatWidth: number,
  configOpen: boolean
): number {
  return configOpen ? Math.min(chatWidth, CHAT_WIDTH_WITH_CONFIG) : chatWidth;
}
