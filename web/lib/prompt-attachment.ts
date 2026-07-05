import type { FileUIPart } from "ai";

export function attachmentMediaLabel(mediaType: string): string {
  if (mediaType.startsWith("video/")) {
    return "Video";
  }
  if (mediaType.startsWith("audio/")) {
    return "Audio";
  }
  if (mediaType.startsWith("image/")) {
    return "Image";
  }
  if (mediaType) {
    return mediaType;
  }
  return "File";
}

export function isImageAttachment(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

export async function fileUIPartToFile(part: FileUIPart): Promise<File> {
  if (!part.url) {
    throw new Error(`Missing URL for attachment ${part.filename ?? "file"}`);
  }
  const response = await fetch(part.url);
  const blob = await response.blob();
  return new File([blob], part.filename ?? "file", {
    type: part.mediaType || blob.type || "application/octet-stream",
  });
}
