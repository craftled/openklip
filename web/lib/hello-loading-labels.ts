export type HelloLoadingContext = "chats" | "project";

const LOADING_LABELS: Record<HelloLoadingContext, string> = {
  project: "Loading project…",
  chats: "Loading chats…",
};

export function helloLoadingLabel(context: HelloLoadingContext): string {
  return LOADING_LABELS[context];
}
