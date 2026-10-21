<!-- Right sidebar: the work tree, loaded one folder at a time (explorerTree.svelte.ts), drawn by the UI library's
     Tree. File operations are in explorerOps.ts, the menus in explorerMenu.ts, Finder drops in explorerFinder.ts. -->
<script lang="ts">
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import Tree from "@nibtree/ui/components/Tree.svelte";
  import type { TreeDecoration } from "@nibtree/ui/logic/treeModel";
  import { onMount } from "svelte";
  import FileTypeIcon from "$lib/fileIcons/FileTypeIcon.svelte";
  import { platformFromUserAgent } from "$lib/menu/menuSpec";
  import { isPseudoTab } from "$lib/stores/pseudoTabs";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { baseName, folderFor, parentOf } from "$lib/stores/workspacePaths";
  import { toast } from "$lib/ui/toast.svelte";
  import { lfsStore } from "../git/lfs/lfsStore.svelte";
  import PanelHead from "../PanelHead.svelte";
  import { pickAndAddFolder } from "../repoPicker";
  import { followFinderDrags } from "./explorerFinder";
  import { openBackgroundMenu, openRowMenu, type MenuHost } from "./explorerMenu";
  import { lfsPathsOf, rowDecoration, workspaceChanges } from "./explorerLook";
  import { ExplorerOps } from "./explorerOps";
  import { ExplorerTree, type FileNode } from "./explorerTree.svelte";
  import { fileClipboard } from "./fileClipboard.svelte";
  import type { TreeEntry } from "./folderListings";
  import { fileKeyOp, movableTargets } from "./fileOps";
  import { foldersToOpen } from "./locate";
  import { extendSelection, selectedInOrder, selectOnly, topLevel } from "./selection";
  import { watchExplorer } from "./watchExplorer.svelte";

  const PLATFORM = platformFromUserAgent(navigator.userAgent);

  const folders = $derived(repoStore.workspace?.folders ?? []);
  /** The workspace folder that takes drops and new files off the rows; none with several folders. */
  const singleRoot = $derived(folders.length === 1 ? folders[0].root : null);
  const changes = $derived(workspaceChanges(repoStore.repos, repoStore.statuses));
  const lfsPaths = $derived(lfsPathsOf(lfsStore.statuses));
  const repoRoots = $derived(repoStore.repos.map((repo) => repo.root));
  const repoRootSet = $derived(new Set(repoRoots));

  const tree = new ExplorerTree(
    () => folders,
    () => changes,
  );
  let treeView = $state<ReturnType<typeof Tree<FileNode>> | null>(null);
  /** How the selected row comes into view: in the middle after Select Opened File. */
  let reveal = $state<"nearest" | "center">("nearest");
  const nodes = $derived(tree.nodes(repoRootSet));
  const rows = $derived(tree.rows(nodes));
  const order = $derived(rows.map((row) => row.node.id));
  const rowById = $derived(new Map(rows.map((row) => [row.node.id, row])));
  const cutPaths = $derived(fileClipboard.mode === "cut" ? new Set(fileClipboard.paths) : null);
  const singleRootError = $derived(singleRoot ? (tree.rootErrors.get(singleRoot) ?? null) : null);
  const loaded = $derived(singleRoot !== null && tree.children.has(singleRoot));

  const base = {
    tree,
    folders: () => folders,
    repoRoots: () => repoRoots,
    singleRoot: () => singleRoot,
    order: () => order,
    focus: () => treeView?.focus(),
  };
  const ops = new ExplorerOps(base);
  const host: MenuHost = { ...base, ops, changes: () => changes, selectedEntries, toggle };

  /** The file in the editor, when it is a real file inside the workspace. */
  const openedFile = $derived.by(() => {
    const openPath = repoStore.openFilePath;
    return openPath && !isPseudoTab(openPath) && folderFor(folders, openPath) ? openPath : null;
  });

  watchExplorer(
    tree,
    () => folders,
    () => repoRoots,
  );

  onMount(() =>
    followFinderDrags(
      () => treeView,
      (paths, target) => {
        const into = target ?? singleRoot;
        if (into) {
          void ops.copy(paths, into);
        }
      },
    ),
  );

  function toggle(dirPath: string): void {
    tree.setExpanded(
      tree.expanded.has(dirPath) ? [...tree.expanded].filter((path) => path !== dirPath) : [...tree.expanded, dirPath],
      repoRoots,
    );
  }

  /** The selected rows that are visible, top down. */
  function selectedEntries(): TreeEntry[] {
    return selectedInOrder(tree.selection, order)
      .map((path) => rowById.get(path)?.node.entry)
      .filter((entry) => entry !== undefined);
  }

  function activate(entry: TreeEntry): void {
    tree.selection = selectOnly(entry.path);
    if (entry.deleted) {
      toast.info(`${entry.name} was deleted`, "Restore or stage the deletion from the Changes view.");
    } else if (entry.isDir) {
      toggle(entry.path);
    } else {
      void repoStore.openFile(entry.path);
    }
  }

  /** A plain click opens a file or opens and closes a folder; Cmd and Shift clicks only select. */
  function onclick(node: FileNode, event: MouseEvent): void {
    if (event.shiftKey) {
      return;
    }
    if (PLATFORM === "macos" ? event.metaKey : event.ctrlKey) {
      // A Shift range from the keyboard starts at the row Cmd-clicked last.
      tree.selection = { ...tree.selection, anchor: node.id };
      return;
    }
    activate(node.entry);
  }

  /** The Tree changed the selection: one row also becomes where a Shift range starts. */
  function setSelection(ids: string[]): void {
    const anchor = ids.length === 1 ? ids[0] : (tree.selection.anchor ?? ids[0] ?? null);
    tree.selection = { ...tree.selection, paths: new Set(ids), anchor };
  }

  /** The file operation keys, Shift+Up and Shift+Down, and Enter; the Tree moves with the other keys. */
  function onkeydown(event: KeyboardEvent): void {
    const op = fileKeyOp(event, PLATFORM);
    if (op === "clearCut") {
      if (fileClipboard.mode === "cut") {
        event.preventDefault();
        fileClipboard.clear();
      }
      return;
    }
    const focused = tree.selection.focus === null ? null : (rowById.get(tree.selection.focus)?.node.entry ?? null);
    if (op) {
      // The Edit menu has Cut, Copy and Paste too; preventing the default keeps it from running as well.
      event.preventDefault();
      const single = op === "paste" || op === "rename";
      void ops.run(op, single ? (focused ? [focused] : []) : selectedEntries());
      return;
    }
    const plainShift = event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (plainShift && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      tree.selection = extendSelection(tree.selection, order, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && focused) {
      event.preventDefault();
      activate(focused);
    }
  }

  /** Opens the folders down to the file in the editor, selects it and scrolls it to the middle. */
  async function selectOpenedFile(): Promise<void> {
    const filePath = openedFile;
    const folder = filePath ? folderFor(folders, filePath) : null;
    if (!filePath || !folder) {
      return;
    }
    const dirPaths = foldersToOpen(folder.root, filePath);
    tree.open(dirPaths);
    await tree.loadDirs(
      dirPaths.filter((dirPath) => !tree.children.has(dirPath)),
      repoRoots,
    );
    if (!rowById.has(filePath)) {
      const reason = tree.truncated.has(parentOf(filePath))
        ? "Its folder has more than 5000 entries, and only the first 5000 are shown."
        : "Its folder could not be read.";
      toast.info(`${baseName(filePath)} is not in the list`, reason);
      return;
    }
    reveal = "center";
    tree.selection = selectOnly(filePath);
    treeView?.focus();
    requestAnimationFrame(() => (reveal = "nearest"));
  }

  function ondrop(ids: string[], target: FileNode | null, mode: "move" | "copy"): void {
    const into = target?.id ?? singleRoot;
    const entries = ids.map((id) => rowById.get(id)?.node.entry).filter((entry) => entry !== undefined);
    const sources = topLevel(movableTargets(entries).map((entry) => entry.path));
    if (into && sources.length > 0) {
      void (mode === "copy" ? ops.copy(sources, into) : ops.move(sources, into, true));
    }
  }

  function decorate(node: FileNode): TreeDecoration {
    return rowDecoration(node.entry, { changes, cutPaths, lfsPaths, openPath: repoStore.openFilePath });
  }

  function branchOf(dirPath: string): string | null {
    const head = repoStore.statuses[dirPath]?.head;
    return head?.branch ?? head?.shortId ?? null;
  }
</script>

{#snippet rowIcon(node: FileNode, open: boolean)}
  {#if node.entry.isDir}
    <Icon name={node.entry.isRepo ? "folder-git" : "folder"} size="normal" />
  {:else}
    <FileTypeIcon fileName={node.entry.name} />
  {/if}
{/snippet}

{#snippet rowDetail(node: FileNode)}
  {#if node.entry.isRepo && branchOf(node.entry.path)}
    {@const branch = branchOf(node.entry.path)}
    <Text size="xsmall" tone="dim" truncate title="Repository on branch {branch}">{branch}</Text>
  {/if}
  {#if node.entry.isDir && tree.truncated.has(node.entry.path)}
    <Text size="xsmall" tone="dim" title="Only the first 5000 entries are shown">5000+</Text>
  {/if}
{/snippet}

<Stack grow gap="none">
  <PanelHead
    title={repoStore.workspace?.name ?? "Files"}
    hideTitle="Hide files"
    onhide={() => settings.hidePanel("files")}
  >
    <IconButton
      icon="plus"
      iconSize="normal"
      size="compact"
      label="Add folder to workspace"
      title="Add Folder to Workspace..."
      onclick={() => void pickAndAddFolder()}
    />
    <IconButton
      icon="locate"
      iconSize="normal"
      size="compact"
      label="Select opened file"
      title={openedFile ? "Select Opened File" : "Select Opened File (open a file first)"}
      disabled={!openedFile}
      onclick={() => void selectOpenedFile()}
    />
    <IconButton
      icon="chevron-up"
      iconSize="normal"
      size="compact"
      label="Collapse all"
      onclick={() => tree.collapseAll()}
    />
    <IconButton
      icon="refresh"
      iconSize="medium"
      size="compact"
      label="Refresh"
      onclick={() => void tree.refreshLoaded(repoRoots)}
    />
  </PanelHead>
  {#if singleRootError}
    <EmptyState title={singleRootError} titleTone="dim" variant="panel" />
  {:else}
    <Tree
      bind:this={treeView}
      label="Files"
      {nodes}
      multiple
      draggable
      {reveal}
      empty={loaded ? "This folder is empty." : ""}
      bind:expanded={() => [...tree.expanded], (ids) => tree.setExpanded(ids, repoRoots)}
      bind:selected={() => tree.selection.focus, (id) => (tree.selection = { ...tree.selection, focus: id })}
      bind:selection={() => [...tree.selection.paths], setSelection}
      {decorate}
      customIcon={rowIcon}
      detail={rowDetail}
      canDrag={(node) => !node.entry.deleted && !node.entry.isFolderRoot}
      {onclick}
      {onkeydown}
      onopen={(node) => {
        if (!node.entry.deleted) {
          void repoStore.openFile(node.entry.path, { pin: true });
        }
      }}
      {ondrop}
      oncontextmenu={(node, event) => openRowMenu(host, event, node.entry, tree.expanded.has(node.id))}
      onbackgroundmenu={(event) => openBackgroundMenu(host, event)}
    />
  {/if}
</Stack>
