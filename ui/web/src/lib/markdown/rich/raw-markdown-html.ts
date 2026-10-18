// Adapted from Orca (github.com/stablyai/orca), MIT License: see LICENSE-ORCA.
import { createDetailsMatcher } from "./details-markdown-html";
import { normalizeMarkdownReferenceLinks } from "./markdown-reference-link-normalization";
import type { RichMarkdownEditorCodec } from "./rich-markdown-source-transport";

const INLINE_HTML_PATTERN = /^<!--[\s\S]*?-->|^<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>/;

function isEscaped(content: string, index: number): boolean {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && content[i] === "\\"; i -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function findLineEnd(content: string, start: number): number {
  const newlineIndex = content.indexOf("\n", start);
  return newlineIndex === -1 ? content.length : newlineIndex;
}

function isLineOnlyHtml(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }

  if (trimmed.startsWith("<!--")) {
    return trimmed.includes("-->");
  }

  return /^<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>$/.test(trimmed);
}

// Nibtree: CommonMark's HTML block that starts with a block-level tag (type 6) runs to the next blank line,
// indented lines included; marked reads it that way. Line by line, a 4-space indented `<td>` line of such a block
// was read as indented code, so a README's HTML table lost its markup and the file could not be rich-edited.
const BLOCK_HTML_TAGS = new Set(
  (
    "address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl " +
    "dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend " +
    "li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td " +
    "tfoot th thead title tr track ul"
  ).split(" "),
);

/** The whole HTML block (type 6) starting at a line start, to the next blank line, or null. */
function matchHtmlBlockToBlankLine(content: string, start: number): string | null {
  const opening = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/.exec(content.slice(start, start + 200));
  if (!opening || !BLOCK_HTML_TAGS.has(opening[1].toLowerCase())) {
    return null;
  }
  const blank = /\n[ \t]*\n/g;
  blank.lastIndex = start;
  const found = blank.exec(content);
  const end = found ? found.index : content.length;
  const raw = content.slice(start, end);
  // A single line is left to the line-only handling below, as before.
  return raw.includes("\n") ? raw : null;
}

function matchBlockHtml(content: string, start: number): string | null {
  const lineEnd = findLineEnd(content, start);
  const line = content.slice(start, lineEnd);
  return isLineOnlyHtml(line) ? line : null;
}

export function encodeRawMarkdownHtmlForRichEditor(content: string, codec: RichMarkdownEditorCodec): string {
  const normalizedContent = normalizeMarkdownReferenceLinks(content);
  const matchDetails = createDetailsMatcher(normalizedContent);
  const lastCommentClose = normalizedContent.lastIndexOf("-->");
  const { transport } = codec;
  let index = 0;
  let activeFence: "`" | "~" | null = null;
  let activeFenceLength = 0;
  let result = "";
  const nonWhitespace = /\S/g;
  const fencePrefix = /(`{3,}|~{3,})/y;
  let fenceProbe = -1;
  let fenceMatch: RegExpExecArray | null = null;

  while (index < normalizedContent.length) {
    const isLineStart = index === 0 || normalizedContent[index - 1] === "\n";
    if (isLineStart) {
      // Reuse the lookahead across blank lines, preserving cross-line fence semantics.
      if (index > fenceProbe) {
        nonWhitespace.lastIndex = index;
        fenceProbe = nonWhitespace.exec(normalizedContent)?.index ?? normalizedContent.length;
        fencePrefix.lastIndex = fenceProbe;
        fenceMatch = fencePrefix.exec(normalizedContent);
      }
      // Nibtree: the lookahead runs past blank lines, so the fence it found may start on a later line; it counts
      // only on its own line. Orca toggled it already on the blank line before, which a tilde fence did not survive
      // (backtick fences were saved by the inline code scan), so HTML after a `~~~` block was never kept.
      const fenceOnThisLine = fenceMatch && !normalizedContent.slice(index, fenceProbe).includes("\n");
      if (fenceMatch && fenceOnThisLine) {
        const fenceChar = fenceMatch[1][0] as "`" | "~";
        const fenceLength = fenceMatch[1].length;
        if (activeFence === null) {
          activeFence = fenceChar;
          activeFenceLength = fenceLength;
        } else if (activeFence === fenceChar && fenceLength >= activeFenceLength) {
          activeFence = null;
          activeFenceLength = 0;
          // Nibtree: the closing fence line is not inline text. Scanned as code spans, its last backtick paired
          // with the next code span's opening one, so every later span was read inside out.
          const lineEnd = findLineEnd(normalizedContent, index);
          result += normalizedContent.slice(index, lineEnd);
          index = lineEnd;
          continue;
        }
      }
    }

    if (activeFence) {
      const nextChar = normalizedContent[index];
      result += nextChar;
      index += 1;
      continue;
    }

    if (normalizedContent[index] === "`") {
      let tickCount = 0;
      while (normalizedContent[index + tickCount] === "`") {
        tickCount += 1;
      }

      // Why: the closing backtick sequence must be exactly tickCount backticks,
      // not a longer run. We scan forward to find the first exact match.
      let searchFrom = index + tickCount;
      let closingIndex = -1;
      while (searchFrom < normalizedContent.length) {
        const candidate = normalizedContent.indexOf("`".repeat(tickCount), searchFrom);
        if (candidate === -1) {
          break;
        }
        // Verify the match is exactly tickCount backticks (no extra backtick before/after)
        if (
          (candidate === 0 || normalizedContent[candidate - 1] !== "`") &&
          normalizedContent[candidate + tickCount] !== "`"
        ) {
          closingIndex = candidate;
          break;
        }
        searchFrom = candidate + 1;
      }

      if (closingIndex !== -1) {
        const rawSpan = normalizedContent.slice(index, closingIndex + tickCount);
        result += rawSpan;
        index = closingIndex + tickCount;
        continue;
      }
    }

    if (isLineStart) {
      const detailsHtml = matchDetails(index);
      if (detailsHtml) {
        result += transport.create("block-html", detailsHtml.raw);
        index += detailsHtml.raw.length;
        continue;
      }

      const htmlBlock = matchHtmlBlockToBlankLine(normalizedContent, index);
      if (htmlBlock) {
        result += transport.create("block-html", htmlBlock);
        index += htmlBlock.length;
        continue;
      }

      const blockHtml = matchBlockHtml(normalizedContent, index);
      if (blockHtml) {
        result += transport.create("block-html", blockHtml);
        index += blockHtml.length;
        continue;
      }
    }

    // Why: authored text that happens to contain this editor's random envelope
    // prefix must remain literal even in HTML-free documents and after edits.
    if (normalizedContent.startsWith(transport.authoredPrefix, index)) {
      const authoredEnd = normalizedContent.indexOf("]]", index + transport.authoredPrefix.length);
      const authoredOccurrence =
        authoredEnd === -1 ? transport.authoredPrefix : normalizedContent.slice(index, authoredEnd + 2);
      result += transport.create("literal", authoredOccurrence);
      index += authoredOccurrence.length;
      continue;
    }

    if (normalizedContent[index] === "<" && !isEscaped(normalizedContent, index)) {
      // An unterminated comment cannot match; later tags must still be encoded.
      const inlineHtml =
        normalizedContent.startsWith("<!--", index) && index + 4 > lastCommentClose
          ? null
          : (normalizedContent.slice(index).match(INLINE_HTML_PATTERN)?.[0] ?? null);
      if (inlineHtml) {
        result += transport.create("inline-html", inlineHtml);
        index += inlineHtml.length;
        continue;
      }
    }

    const nextChar = normalizedContent[index];
    result += nextChar;
    index += 1;
  }

  return result;
}
