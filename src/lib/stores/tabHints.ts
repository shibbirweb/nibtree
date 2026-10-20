// The folder hint of tabs that share a file name (tabLabels in tabs.ts): the shortest end of each one's folder that
// tells them apart, like VS Code. Two worktrees' src/prices.ts read "shop/src" and "shop-fix-tax/src".

function folderSegments(path: string): string[] {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? [] : path.slice(0, slash).split("/").filter(Boolean);
}

/** Each path's hint ("/" separated), or null for a path with no folder; `paths` all have the same file name. */
export function distinctFolderHints(paths: readonly string[]): (string | null)[] {
  const folders = paths.map(folderSegments);
  const tail = (segments: string[], depth: number) => segments.slice(-depth).join("/");
  return folders.map((segments, index) => {
    for (let depth = 1; depth <= segments.length; depth++) {
      const end = tail(segments, depth);
      if (!folders.some((other, otherIndex) => otherIndex !== index && tail(other, depth) === end)) {
        return end;
      }
    }
    return segments.length > 0 ? segments.join("/") : null;
  });
}
