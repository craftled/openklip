export const CONFIG_SIDEBAR_WIDTH = 288;
export const CHAT_WIDTH_WITH_CONFIG = 360;

export type MobileRightPanel = "chat" | null;

export function visibleChatWidth(chatWidth: number): number {
  return chatWidth;
}
