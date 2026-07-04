import { type FileDiffMetadata, parseDiffFromFile } from "@pierre/diffs";

export interface TranscriptDiffWord {
  deleted: boolean;
  id: string;
  text: string;
}

export interface TranscriptDiffLine {
  lineNumber: number;
  text: string;
  wordEndIndex: number;
  wordStartIndex: number;
}

export interface TranscriptDiffLinesResult {
  contents: string;
  lines: TranscriptDiffLine[];
}

export interface TranscriptFileDiffResult {
  fileDiff: FileDiffMetadata;
  newLines: TranscriptDiffLine[];
  oldLines: TranscriptDiffLine[];
}

const TRANSCRIPT_DIFF_FILENAME = "transcript.txt";

/** Serialize kept transcript words into newline-separated sentences for diffing. */
export function transcriptDiffLines(
  words: readonly TranscriptDiffWord[]
): TranscriptDiffLinesResult {
  const lines: TranscriptDiffLine[] = [];
  let sentenceStart = 0;
  let sentenceCount = 0;

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (!word) {
      continue;
    }
    if (/[.!?]$/.test(word.text)) {
      sentenceCount += 1;
    }
    const isLast = index === words.length - 1;
    if (isLast || shouldEndSentence(index - sentenceStart + 1, sentenceCount)) {
      const lineText = lineTextForRange(words, sentenceStart, index);
      if (lineText.length > 0) {
        lines.push({
          lineNumber: lines.length + 1,
          text: lineText,
          wordStartIndex: sentenceStart,
          wordEndIndex: index,
        });
      }
      sentenceStart = index + 1;
      sentenceCount = 0;
    }
  }

  return {
    contents: lines.map((line) => line.text).join("\n"),
    lines,
  };
}

function shouldEndSentence(wordCount: number, sentenceCount: number): boolean {
  return sentenceCount >= 1 || wordCount >= 90;
}

function lineTextForRange(
  words: readonly TranscriptDiffWord[],
  startIndex: number,
  endIndex: number
): string {
  const kept: string[] = [];
  for (let index = startIndex; index <= endIndex; index++) {
    const word = words[index];
    if (word && !word.deleted) {
      kept.push(word.text);
    }
  }
  return kept.join(" ");
}

/** Map a 1-based diff line number to an inclusive word-index range in the source words. */
export function wordRangeForDiffLine(
  lines: readonly TranscriptDiffLine[],
  lineNumber: number
): readonly [number, number] | null {
  const line = lines.find((entry) => entry.lineNumber === lineNumber);
  if (!line) {
    return null;
  }
  return [line.wordStartIndex, line.wordEndIndex];
}

/** Build a Pierre Diffs metadata object from two word-level transcript snapshots. */
export function buildTranscriptFileDiff(
  oldWords: readonly TranscriptDiffWord[],
  newWords: readonly TranscriptDiffWord[]
): TranscriptFileDiffResult {
  const oldLines = transcriptDiffLines(oldWords);
  const newLines = transcriptDiffLines(newWords);
  const fileDiff = parseDiffFromFile(
    {
      name: TRANSCRIPT_DIFF_FILENAME,
      contents: oldLines.contents,
      lang: "text",
    },
    {
      name: TRANSCRIPT_DIFF_FILENAME,
      contents: newLines.contents,
      lang: "text",
    }
  );
  return { fileDiff, oldLines: oldLines.lines, newLines: newLines.lines };
}

export function transcriptDiffSummary(fileDiff: FileDiffMetadata): {
  additions: number;
  deletions: number;
  hunks: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionCount;
    deletions += hunk.deletionCount;
  }
  return {
    additions,
    deletions,
    hunks: fileDiff.hunks.length,
  };
}
