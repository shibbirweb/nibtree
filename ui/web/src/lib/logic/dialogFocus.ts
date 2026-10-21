// Where the focus goes when a Dialog opens: its first field (or button), else the dialog itself; when it closes,
// back to what had the focus before, if that is still in the page.
const FIRST = "[autofocus], input:not([type=checkbox]):not([type=radio]), textarea, select, button:not(:disabled)";

/** Moves the focus into `dialog` and returns the function that gives it back. */
export function focusInto(dialog: HTMLElement): () => void {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  (dialog.querySelector<HTMLElement>(FIRST) ?? dialog).focus();
  return () => {
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    }
  };
}

/**
 * Whether a key pressed with the focus on nothing (the page itself, because the focused button was removed or the
 * window came back to the front) belongs to `dialog`: only when it is the topmost open dialog. A popup that is not
 * modal (the Navigation Bar's list) is on top when no modal dialog is open. A key aimed at an element, or at a dialog
 * stacked above this one, is never taken, so Esc closes the right one and nothing outside it loses its keys.
 */
export function ownsStrayKey(
  dialog: Element,
  active: Element | null,
  body: Element | null,
  openDialogs: readonly Element[],
): boolean {
  const stray = active === null || active === body;
  return stray && (openDialogs.at(-1) ?? dialog) === dialog;
}

/**
 * A window keydown listener for a Dialog or a popup: a key its own handler never saw because the focus fell to the
 * page (a button that removed itself, the window coming back to the front) goes to `handle`, with the focus back in.
 */
export function strayKeys(
  dialog: () => HTMLElement | null,
  handle: (event: KeyboardEvent) => void,
): (event: KeyboardEvent) => void {
  return (event) => {
    const element = dialog();
    if (!element || event.defaultPrevented) {
      return;
    }
    const openDialogs = [...document.querySelectorAll("[role='dialog'][aria-modal='true']")];
    if (ownsStrayKey(element, document.activeElement, document.body, openDialogs)) {
      element.focus();
      handle(event);
    }
  };
}
