// A save asked for while another save of the same file is still writing: it waits for that one to finish, then
// writes the newest text, instead of being dropped (Cmd+S right after Cmd+S used to leave the tab unsaved).

/** Waits until `busy()` is false, checking every `stepMs`; false when it is still busy after `limitMs`. */
export async function whenIdle(busy: () => boolean, stepMs = 50, limitMs = 10_000): Promise<boolean> {
  for (let waited = 0; busy(); waited += stepMs) {
    if (waited >= limitMs) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return true;
}
