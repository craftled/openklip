// Stream a Web File/Blob to disk without buffering the whole payload in RAM.
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";

export async function writeUploadToFile(
  targetPath: string,
  file: Blob
): Promise<void> {
  const stream = file.stream();
  const nodeStream = createWriteStream(targetPath);
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!nodeStream.write(value)) {
        await new Promise<void>((resolve) => nodeStream.once("drain", resolve));
      }
    }
    nodeStream.end();
    await finished(nodeStream);
  } catch (error) {
    nodeStream.destroy();
    throw error;
  } finally {
    reader.releaseLock();
  }
}
