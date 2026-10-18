// Nibtree: HTML after a fenced code block is still kept as raw HTML, for both fence characters. The encoder's
// fence lookahead runs past blank lines; a fence counts only on its own line.

import { describe, expect, it } from "vitest";
import { encodeRawMarkdownHtmlForRichEditor } from "./raw-markdown-html";
import { createRichMarkdownEditorCodec } from "./rich-markdown-source-transport";

describe("raw html after fences", () => {
  it.each(["~~~", "```"])("wraps a details block after a %s fence", (fence) => {
    const codec = createRichMarkdownEditorCodec();
    const details = "<details>\n<summary>More</summary>\n\nBody.\n\n</details>\n";
    const source = `Before.\n\n${fence}ts\nconst a = 1;\n${fence}\n\n${details}`;
    const encoded = encodeRawMarkdownHtmlForRichEditor(source, codec);
    expect(encoded).toContain(`${fence}ts\nconst a = 1;\n${fence}`);
    expect(encoded).not.toContain("<details>");
    expect(encoded).toContain(":block-html:");
  });

  it("keeps a tag inside a code span after a backtick fence", () => {
    const codec = createRichMarkdownEditorCodec();
    const source = "```mermaid\nflowchart LR\n```\n\nThen `nibtree@<version>` does not exist.\n";
    expect(encodeRawMarkdownHtmlForRichEditor(source, codec)).toBe(source);
  });

  it("leaves html inside a tilde fence alone", () => {
    const codec = createRichMarkdownEditorCodec();
    const source = "~~~html\n<div>code</div>\n~~~\n";
    expect(encodeRawMarkdownHtmlForRichEditor(source, codec)).toBe(source);
  });
});
