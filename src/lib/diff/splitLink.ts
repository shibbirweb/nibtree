// Links the two sides of a MergeView that each scroll themselves (no padding): the line at the
// center of the side being scrolled is mapped through the changes to the other side, and the connector's bands are
// measured for the changes on screen. Changes come from @codemirror/merge, so highlights, folds and staging stay.
import type { MergeView } from "@codemirror/merge";
import type { ConnectorRibbon } from "@nibtree/ui/components/MergeConnector.svelte";
import { overlaps, span, visibleLines } from "$lib/merge/mergeRibbons";
import { lineAtCenter, scrollToLine } from "$lib/merge/mergeScroll";
import { invertAnchors, mapLine } from "$lib/merge/model";
import { chunkKind, chunkLines, diffAnchors } from "./splitChunks";

type Side = "a" | "b";

/** Turns off MergeView's padding: its measure only adds the spacers that line the sides up. */
export function unpadded(view: MergeView): MergeView {
  (view as unknown as { measure: () => void }).measure = () => undefined;
  return view;
}

export class SplitLink {
  #lock: Side | null = null;
  #unlockFrame = 0;
  #ribbonFrame = 0;
  #onScrollA = (): void => this.#follow("a");
  #onScrollB = (): void => this.#follow("b");

  /** `body` is the frame body the connector's ribbons are measured from. */
  constructor(
    private readonly view: MergeView,
    private readonly body: HTMLElement,
    private readonly onRibbons: (ribbons: ConnectorRibbon[]) => void,
  ) {
    view.a.scrollDOM.addEventListener("scroll", this.#onScrollA, { passive: true });
    view.b.scrollDOM.addEventListener("scroll", this.#onScrollB, { passive: true });
  }

  /** Brings the left side in line with the right one, as after its own scroll. */
  align(): void {
    this.#follow("b");
  }

  /** Measures the bands on the next frame (geometry, folds or the changes moved). */
  schedule(): void {
    cancelAnimationFrame(this.#ribbonFrame);
    this.#ribbonFrame = requestAnimationFrame(() => this.onRibbons(this.ribbons()));
  }

  #follow(source: Side): void {
    if (this.#lock && this.#lock !== source) {
      this.schedule();
      return;
    }
    this.#lock = source;
    cancelAnimationFrame(this.#unlockFrame);
    const { a, b } = this.view;
    const anchors = diffAnchors(this.view.chunks, a.state.doc, b.state.doc);
    if (source === "a") {
      scrollToLine(b, mapLine(lineAtCenter(a), anchors));
    } else {
      scrollToLine(a, mapLine(lineAtCenter(b), invertAnchors(anchors)));
    }
    this.#unlockFrame = requestAnimationFrame(() => {
      this.#unlockFrame = requestAnimationFrame(() => {
        this.#lock = null;
      });
    });
    this.schedule();
  }

  /** A band for every change with lines on screen on either side, in pixels from the body's top. */
  ribbons(): ConnectorRibbon[] {
    const { a, b, chunks } = this.view;
    const box = this.body.getBoundingClientRect();
    const visibleA = visibleLines(a);
    const visibleB = visibleLines(b);
    const ribbons: ConnectorRibbon[] = [];
    chunks.forEach((chunk, index) => {
      const lines = chunkLines(chunk, a.state.doc, b.state.doc);
      if (!overlaps(lines.a.start, lines.a.end, visibleA) && !overlaps(lines.b.start, lines.b.end, visibleB)) {
        return;
      }
      const left = span(a, lines.a.start, lines.a.end, box.top);
      const right = span(b, lines.b.start, lines.b.end, box.top);
      if (Math.max(left.bottom, right.bottom) < -40 || Math.min(left.top, right.top) > box.height + 40) {
        return;
      }
      ribbons.push({
        index,
        kind: chunkKind(chunk),
        aTop: left.top,
        aBottom: left.bottom,
        bTop: right.top,
        bBottom: right.bottom,
      });
    });
    return ribbons;
  }

  dispose(): void {
    cancelAnimationFrame(this.#unlockFrame);
    cancelAnimationFrame(this.#ribbonFrame);
    this.view.a.scrollDOM.removeEventListener("scroll", this.#onScrollA);
    this.view.b.scrollDOM.removeEventListener("scroll", this.#onScrollB);
  }
}
