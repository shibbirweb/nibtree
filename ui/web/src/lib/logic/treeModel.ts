// A tree as the rows on screen: the open folders' children follow them, each row knows its depth. Keys move
// through the rows like the app's Files panel: Up and Down, Right opens or goes in, Left closes or goes up.

export interface TreeNode {
  id: string;
  label: string;
  /** Absent for a leaf; an empty array for a folder with nothing in it. */
  children?: TreeNode[];
}

/** How a row looks beyond its name: a tone (git status colors), struck through (deleted), a badge letter. */
export interface TreeDecoration {
  tone?: "default" | "dim" | "faint" | "accent" | "danger" | "success" | "warning";
  strike?: boolean;
  badge?: string;
  /** A pending cut: the name and icon half faded. */
  cut?: boolean;
  /** Ignored by git: the name and icon faint, the name in italics, and a circle with a slash at the end. */
  ignored?: boolean;
  /** A workspace folder in a multi-folder workspace: its name as a section header. */
  root?: boolean;
  /** A repository folder: its icon in the accent color. */
  repo?: boolean;
  /** A small outlined mark after the name, such as LFS. */
  tag?: string;
  /** The badge's tooltip, such as "Modified, not staged". */
  badgeTitle?: string;
  /** A small dot in the tone at the end, such as a folder holding changes. */
  dot?: boolean;
  /** The row's tooltip, such as the full path. */
  title?: string;
  /** Shown elsewhere now, such as the file open in the editor: a quiet highlight. */
  open?: boolean;
}

export interface TreeRow<N extends TreeNode = TreeNode> {
  node: N;
  depth: number;
  parent: string | null;
  isFolder: boolean;
  expanded: boolean;
}

export function treeRows<N extends TreeNode>(nodes: N[], expanded: ReadonlySet<string>): TreeRow<N>[] {
  const rows: TreeRow<N>[] = [];
  const visit = (list: N[], depth: number, parent: string | null) => {
    for (const node of list) {
      const isFolder = node.children !== undefined;
      const open = isFolder && expanded.has(node.id);
      rows.push({ node, depth, parent, isFolder, expanded: open });
      if (open) {
        visit(node.children as N[], depth + 1, node.id);
      }
    }
  };
  visit(nodes, 0, null);
  return rows;
}

export type TreeAction =
  | { kind: "select"; index: number }
  | { kind: "expand"; id: string }
  | { kind: "collapse"; id: string }
  | { kind: "open"; id: string };

/** What a key does on the row at `index` (-1 when none is selected); null for keys the tree does not use. */
export function treeKey(rows: TreeRow[], index: number, key: string): TreeAction | null {
  const row = rows[index] ?? null;
  switch (key) {
    case "ArrowDown":
      return rows.length ? { kind: "select", index: Math.min(rows.length - 1, index + 1) } : null;
    case "ArrowUp":
      return rows.length ? { kind: "select", index: Math.max(0, index - 1) } : null;
    case "Home":
      return rows.length ? { kind: "select", index: 0 } : null;
    case "End":
      return rows.length ? { kind: "select", index: rows.length - 1 } : null;
    case "ArrowRight":
      if (!row?.isFolder) {
        return null;
      }
      return row.expanded ? { kind: "select", index: index + 1 } : { kind: "expand", id: row.node.id };
    case "ArrowLeft":
      if (row?.isFolder && row.expanded) {
        return { kind: "collapse", id: row.node.id };
      }
      return row?.parent ? { kind: "select", index: rows.findIndex((entry) => entry.node.id === row.parent) } : null;
    case "Enter":
      if (!row) {
        return null;
      }
      if (!row.isFolder) {
        return { kind: "open", id: row.node.id };
      }
      return { kind: row.expanded ? "collapse" : "expand", id: row.node.id };
    default:
      return null;
  }
}
