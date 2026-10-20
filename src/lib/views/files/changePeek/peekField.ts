// The change peek's place in the editor: one block widget under a line, holding ChangePeek.svelte. It comes from a
// StateField (block widgets cannot come from a plugin), closes on any edit of the text and ignores the events inside
// it, so the diff editor nested in it gets its own clicks and keys.
import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

export interface PeekTarget {
  /** A new number on every open, so opening the same change again builds its view again. */
  token: number;
  /** The end of the line the peek sits under. */
  pos: number;
}

/** Opens the peek at a target, or closes it with null. */
export const showPeek = StateEffect.define<PeekTarget | null>();

/** Draws the peek into `host`; returns what takes it down again. */
export type PeekRender = (host: HTMLElement, target: PeekTarget) => () => void;

class PeekWidget extends WidgetType {
  readonly #cleanups = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly target: PeekTarget,
    readonly render: PeekRender,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof PeekWidget && other.target.token === this.target.token;
  }

  toDOM(): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-change-peek";
    this.#cleanups.set(host, this.render(host, this.target));
    return host;
  }

  destroy(dom: HTMLElement): void {
    this.#cleanups.get(dom)?.();
    this.#cleanups.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const peekState = StateField.define<PeekTarget | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(showPeek)) {
        return effect.value;
      }
    }
    return transaction.docChanged ? null : value;
  },
});

/** The open peek's target, or null. */
export function openPeek(state: EditorState): PeekTarget | null {
  return state.field(peekState, false) ?? null;
}

export function peekField(render: PeekRender): Extension {
  return [
    peekState,
    EditorView.decorations.from(peekState, (target) =>
      target
        ? Decoration.set(
            Decoration.widget({ widget: new PeekWidget(target, render), block: true, side: 1 }).range(target.pos),
          )
        : Decoration.none,
    ),
  ];
}
