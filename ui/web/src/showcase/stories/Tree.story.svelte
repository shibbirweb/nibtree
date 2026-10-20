<script lang="ts">
  import Stack from "$ui/components/Stack.svelte";
  import Text from "$ui/components/Text.svelte";
  import Tree from "$ui/components/Tree.svelte";
  import type { TreeDecoration, TreeNode } from "$ui/logic/treeModel";

  const many = Array.from({ length: 2000 }, (_, index) => ({
    id: `gen/file-${index}.ts`,
    label: `file-${index}.ts`,
  }));
  const nodes: TreeNode[] = [
    {
      id: "src",
      label: "src",
      children: [
        { id: "src/lib", label: "lib", children: [{ id: "src/lib/cart.ts", label: "cart.ts" }] },
        { id: "src/main.ts", label: "main.ts" },
        { id: "src/old.ts", label: "old.ts" },
      ],
    },
    { id: "build", label: "build", children: [{ id: "build/app.js", label: "app.js" }] },
    { id: "gen", label: "generated (2,000 files)", children: many },
    { id: ".DS_Store", label: ".DS_Store" },
    { id: "README.md", label: "README.md" },
  ];
  const STATUS: Record<string, TreeDecoration> = {
    src: { tone: "accent", dot: true, badgeTitle: "Contains changes" },
    "src/lib/cart.ts": { tone: "accent", badge: "M", badgeTitle: "Modified", title: "src/lib/cart.ts" },
    "src/main.ts": { tone: "success", badge: "A" },
    "src/old.ts": { tone: "danger", strike: true, badge: "D" },
    build: { ignored: true },
    ".DS_Store": { ignored: true },
  };

  let expanded = $state(["src", "src/lib"]);
  let selected = $state<string | null>("src/lib/cart.ts");
  let selection = $state<string[]>(["src/lib/cart.ts"]);
  let renaming = $state<string | null>(null);
  let note = $state(
    "Cmd-click and Shift-click select more. F2 renames. Drag rows onto a folder (Option copies, Escape cancels).",
  );
</script>

<Stack gap="sm">
  <Tree
    label="Files, F2 renames"
    {nodes}
    height="medium"
    multiple
    draggable
    bind:expanded
    bind:selected
    bind:selection
    bind:renaming
    decorate={(node) => STATUS[node.id] ?? null}
    canDrag={(node) => node.id !== "README.md"}
    onkeydown={(event) => {
      if (event.key === "F2" && selected) {
        event.preventDefault();
        renaming = selected;
      }
    }}
    onclick={(node, event) => (note = `Clicked ${node.label}${event.shiftKey ? " with Shift" : ""}`)}
    onbackgroundmenu={(event) => {
      event.preventDefault();
      note = "Right-clicked below the rows";
    }}
    onopen={(node) => (note = `Opened ${node.label}`)}
    onrename={(node, name) => (note = `Renamed ${node.label} to ${name}`)}
    ondrop={(ids, target, mode) =>
      (note = `${mode === "copy" ? "Copied" : "Moved"} ${ids.length} into ${target?.label ?? "the top"}`)}
  />
  <Tree label="Empty folder" nodes={[]} height="small" empty="This folder is empty." />
  <Text tone="dim">{note} Selected: {selection.length}. README.md cannot be dragged.</Text>
</Stack>
