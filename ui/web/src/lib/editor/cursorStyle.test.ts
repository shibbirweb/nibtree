import { describe, expect, it } from "vitest";
import { BLINK_MS, type CursorOptions, cursorThemeSpec } from "./cursorStyle";

const CURSOR = ".cm-cursorLayer .cm-cursor";

const base: CursorOptions = {
  style: "line",
  width: 2,
  blinking: "blink",
  smoothCaret: false,
  extraTop: 0,
  extraBottom: 0,
};

describe("cursorThemeSpec", () => {
  it("draws the Line cursor with the chosen width, centered on the gap", () => {
    expect(cursorThemeSpec(base)[CURSOR]).toMatchObject({
      borderLeft: "2px solid var(--editor-cursor)",
      marginLeft: "-1px",
    });
    expect(cursorThemeSpec({ ...base, width: 4 })[CURSOR]).toMatchObject({
      borderLeft: "4px solid var(--editor-cursor)",
    });
  });

  it("keeps the thin styles at one pixel whatever the width", () => {
    expect(cursorThemeSpec({ ...base, style: "line-thin", width: 5 })[CURSOR]).toMatchObject({
      borderLeft: "1px solid var(--editor-cursor)",
    });
    expect(cursorThemeSpec({ ...base, style: "underline-thin" })[CURSOR]).toMatchObject({
      borderBottom: "1px solid var(--editor-cursor)",
    });
  });

  it("makes block, outline and underline cursors one character wide", () => {
    for (const style of ["block", "block-outline", "underline"] as const) {
      const cursor = cursorThemeSpec({ ...base, style })[CURSOR];
      expect(cursor.width).toBe("var(--gm-char-width, 0.6em)");
      expect(cursor.borderLeft).toBe("none");
    }
    expect(cursorThemeSpec({ ...base, style: "block" })[CURSOR].backgroundColor).toContain("var(--editor-cursor)");
    expect(cursorThemeSpec({ ...base, style: "block-outline" })[CURSOR].outline).toBe("1px solid var(--editor-cursor)");
    expect(cursorThemeSpec({ ...base, style: "underline" })[CURSOR].borderBottom).toBe(
      "2px solid var(--editor-cursor)",
    );
  });

  it("reaches above and below the text with the extra caret height", () => {
    const cursor = cursorThemeSpec({ ...base, extraTop: 3, extraBottom: 5 })[CURSOR];
    expect(cursor).toMatchObject({
      boxSizing: "content-box",
      paddingTop: "3px",
      paddingBottom: "5px",
      marginTop: "-3px",
    });
    expect(cursorThemeSpec(base)[CURSOR].paddingTop).toBeUndefined();
  });

  it("glides only with smooth caret animation on", () => {
    expect(cursorThemeSpec(base)[CURSOR].transition).toBeUndefined();
    expect(cursorThemeSpec({ ...base, smoothCaret: true })[CURSOR].transition).toContain("left");
  });

  it("turns off CodeMirror's layer blink and blinks the cursors with two restartable copies", () => {
    const spec = cursorThemeSpec(base);
    expect(spec["&.cm-focused > .cm-scroller > .cm-cursorLayer"]).toEqual({ animation: "none !important" });
    expect(spec["@keyframes gm-cursor-blink-a"]).toEqual(spec["@keyframes gm-cursor-blink-b"]);
    // Visibility, not opacity: an opacity animation makes the cursor a GPU layer.
    expect(spec["@keyframes gm-cursor-blink-a"]["50%"]).toEqual({ visibility: "hidden" });
    expect(spec[`& .cm-scroller[data-gm-blink="a"] ${CURSOR}`].animation).toBe(
      `gm-cursor-blink-a ${BLINK_MS}ms steps(1) infinite`,
    );
    expect(spec[`& .cm-scroller[data-gm-blink="b"] ${CURSOR}`].animation).toContain("gm-cursor-blink-b");
  });

  it("fades for smooth and phase, scales for expand, and never blinks when solid", () => {
    expect(cursorThemeSpec({ ...base, blinking: "smooth" })["@keyframes gm-cursor-smooth-a"]["60%, 100%"]).toEqual({
      opacity: "0",
    });
    expect(cursorThemeSpec({ ...base, blinking: "phase" })["@keyframes gm-cursor-phase-a"]["90%, 100%"]).toEqual({
      opacity: "0",
    });
    expect(cursorThemeSpec({ ...base, blinking: "expand" })["@keyframes gm-cursor-expand-a"]["80%, 100%"]).toEqual({
      transform: "scaleY(0)",
    });
    const solid = cursorThemeSpec({ ...base, blinking: "solid" });
    expect(Object.keys(solid).some((key) => key.startsWith("@keyframes"))).toBe(false);
    expect(solid["&.cm-focused > .cm-scroller > .cm-cursorLayer"]).toEqual({ animation: "none !important" });
  });
});
