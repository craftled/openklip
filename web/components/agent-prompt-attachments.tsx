"use client";

import type { FileUIPart } from "ai";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { FileTextIcon, Film, ImageIcon, Music, XIcon } from "@/lib/icon";
import {
  attachmentMediaLabel,
  isImageAttachment,
} from "@/lib/prompt-attachment";

function attachmentIcon(mediaType: string) {
  if (mediaType.startsWith("video/")) {
    return <Film />;
  }
  if (mediaType.startsWith("audio/")) {
    return <Music />;
  }
  if (mediaType.startsWith("image/")) {
    return <ImageIcon />;
  }
  return <FileTextIcon />;
}

function PromptAttachmentChip({
  file,
  onRemove,
}: {
  file: FileUIPart & { id: string };
  onRemove: (id: string) => void;
}) {
  const title = file.filename ?? "Attachment";
  const description = attachmentMediaLabel(file.mediaType);
  const showImage = isImageAttachment(file.mediaType) && file.url;

  return (
    <Attachment size="sm">
      <AttachmentMedia variant={showImage ? "image" : "icon"}>
        {showImage ? (
          <div
            aria-label={title}
            className="size-full bg-center bg-cover"
            role="img"
            style={{ backgroundImage: `url(${file.url})` }}
          />
        ) : (
          attachmentIcon(file.mediaType)
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{title}</AttachmentTitle>
        <AttachmentDescription>{description}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label={`Remove ${title}`}
          onClick={() => onRemove(file.id)}
        >
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

export function AgentPromptAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <div className="w-full border-border/60 border-b px-2.5 py-2">
      <AttachmentGroup>
        {attachments.files.map((file) => (
          <PromptAttachmentChip
            file={file}
            key={file.id}
            onRemove={attachments.remove}
          />
        ))}
      </AttachmentGroup>
    </div>
  );
}
