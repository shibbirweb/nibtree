// The commit message boxes on screen, by repository root, so Git > Commit can put the caret in the right one
// without looking it up in the page: a selector broke once when the layout around the box changed.

const fields = new Map<string, HTMLElement>();

/** Called by each commit message box while it is on screen; returns the function that forgets it. */
export function registerCommitField(repoRoot: string, element: HTMLElement): () => void {
  fields.set(repoRoot, element);
  return () => {
    if (fields.get(repoRoot) === element) {
      fields.delete(repoRoot);
    }
  };
}

/** The box for `repoRoot`, else the first one shown (a single commit box serves every repository). */
export function commitFieldFor(repoRoot?: string): HTMLElement | null {
  if (repoRoot) {
    const field = fields.get(repoRoot);
    if (field) {
      return field;
    }
  }
  return fields.values().next().value ?? null;
}
