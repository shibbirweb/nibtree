<!-- The window: the header, the side panels, the editor groups (split by the split tree), the bottom panel and the
     status bar on the UI library's AppShell and SplitGrid, plus the window keys and the popups over it. -->
<script lang="ts">
  import { runWorkspace } from "./workspaceLife.svelte";
  import EditorGroupContent from "./EditorGroupContent.svelte";
  import AppShell from "@nibtree/ui/components/AppShell.svelte";
  import { windowChrome } from "$lib/stores/windowChrome.svelte";
  import ElementHost from "@nibtree/ui/components/ElementHost.svelte";
  import SplitGrid from "@nibtree/ui/components/SplitGrid.svelte";
  import type { GridSplitter } from "@nibtree/ui/logic/splitGrid";
  import ConflictsDialog from "$lib/merge/ConflictsDialog.svelte";
  import MergeView from "$lib/merge/MergeView.svelte";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { SidePanel } from "$lib/stores/sidePanels";
  import { groupRects, layoutSplitters, type Splitter } from "$lib/stores/groupLayout";
  import TerminalHost from "$lib/terminal/TerminalHost.svelte";
  import TerminalPanel from "$lib/terminal/TerminalPanel.svelte";
  import { terminalStore } from "$lib/terminal/terminalStore.svelte";
  import FileSearch from "$lib/search/FileSearch.svelte";
  import { fileSearch } from "$lib/search/fileSearchStore.svelte";
  import { recentFilesStore } from "$lib/recentFiles/recentFilesStore.svelte";
  import { navBarStore } from "$lib/navBar/navBarStore.svelte";
  import ResizeHandle from "@nibtree/ui/components/ResizeHandle.svelte";
  import NavigationBar from "$lib/navBar/NavigationBar.svelte";
  import { navTarget } from "$lib/navBar/navTarget.svelte";
  import ActivityBar from "./ActivityBar.svelte";
  import AiPanel from "$lib/ai/AiPanel.svelte";
  import NotificationsPanel from "$lib/notifications/NotificationsPanel.svelte";
  import FileExplorer from "./files/FileExplorer.svelte";
  import ChangesView from "./ChangesView.svelte";
  import Header from "./Header.svelte";
  import OpBanner from "./OpBanner.svelte";
  import BisectBanner from "./git/BisectBanner.svelte";
  import NoRepository from "./NoRepository.svelte";
  import RightActivityBar from "./RightActivityBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import Sidebar from "./Sidebar.svelte";

  // Loaded the first time the Scripts panel shows.
  const loadScriptsPanel = () => import("$lib/scripts/ScriptsPanel.svelte");

  /** Each side of a split keeps at least this many pixels. */
  const MIN_GROUP_SIZE = 120;
  const RIGHT_LABELS: Record<SidePanel, string> = {
    changes: "Resize changes sidebar",
    branches: "Resize branches sidebar",
    scripts: "Resize scripts sidebar",
    files: "Resize files sidebar",
    ai: "Resize AI sidebar",
    notifications: "Resize notifications sidebar",
  };
  const FULL_RECT = { x: 0, y: 0, width: 1, height: 1 };
  const leftOpen = $derived(settings.leftPanel !== null);
  let areaWidth = $state(0);
  let areaHeight = $state(0);
  const rects = $derived(groupRects(repoStore.groupLayout));
  const splitters = $derived(layoutSplitters(repoStore.groupLayout));
  const gridGroups = $derived(
    repoStore.groups.map((group) => ({ id: String(group.id), group, rect: rects.get(group.id) ?? FULL_RECT })),
  );
  const gridSplitters = $derived(splitters.map((splitter) => ({ ...splitter, id: splitter.path })));

  /** The editor area's size, for the splitters' lengths in pixels. */
  function measureArea(element: HTMLDivElement): () => void {
    const observer = new ResizeObserver(() => {
      areaWidth = element.clientWidth;
      areaHeight = element.clientHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }

  /** The split's length in pixels along its direction. */
  function splitterLength(splitter: Splitter): number {
    return splitter.direction === "right" ? splitter.rect.width * areaWidth : splitter.rect.height * areaHeight;
  }

  /** A drag moved a bar: the handle reports the first side's width, or for a bar going across the second's height. */
  function resizeSplit(splitter: Splitter, size: number, persist: boolean): void {
    const length = splitterLength(splitter);
    if (length > 0) {
      const ratio = splitter.direction === "right" ? size / length : 1 - size / length;
      repoStore.setGroupRatio(splitter.path, ratio, persist);
    }
  }

  runWorkspace();
</script>

{#snippet header()}
  <Header />
{/snippet}

{#snippet banners()}
  <OpBanner />
  <BisectBanner />
{/snippet}

{#snippet leftBar()}
  <ActivityBar />
{/snippet}

<!-- Either side shows any panel: the one whose activity bar icon is on that side (stores/sidePanels.ts). -->
{#snippet sidePanel(panel: SidePanel)}
  {#if panel === "changes"}
    <ChangesView />
  {:else if panel === "scripts"}
    {#await loadScriptsPanel() then module}
      <module.default />
    {/await}
  {:else if panel === "ai"}
    <AiPanel />
  {:else if panel === "notifications"}
    <NotificationsPanel />
  {:else if panel === "files"}
    <FileExplorer />
  {:else if repoStore.repo}
    {#key repoStore.repo.root}
      <Sidebar />
    {/key}
  {:else}
    <NoRepository compact />
  {/if}
{/snippet}

{#snippet sidebar()}
  {#if settings.leftPanel}
    {@render sidePanel(settings.leftPanel)}
  {/if}
{/snippet}

{#snippet editorGroup(entry: (typeof gridGroups)[number], index: number)}
  <EditorGroupContent group={entry.group} {index} />
{/snippet}

{#snippet groupSplitter(gridLine: GridSplitter)}
  {@const line = splitters.find((candidate) => candidate.path === gridLine.id) ?? null}
  {#if line}
    {@render splitHandle(line)}
  {/if}
{/snippet}

{#snippet splitHandle(line: Splitter)}
  {@const length = splitterLength(line)}
  {@const min = Math.min(MIN_GROUP_SIZE, Math.round(length / 2))}
  <ResizeHandle
    preset="pane"
    label="Resize editor groups"
    side={line.direction === "right" ? "left" : "bottom"}
    size={Math.round(length * (line.direction === "right" ? line.ratio : 1 - line.ratio))}
    {min}
    max={Math.max(min, Math.round(length) - min)}
    defaultSize={Math.round(length / 2)}
    onresize={(size) => resizeSplit(line, size, false)}
    oncommit={(size) => resizeSplit(line, size, true)}
    inPanel
  />
{/snippet}

{#snippet editor()}
  <!--
    One editor group, or several placed by the split tree (Window > Split Right / Split Down);
    the first one also shows the diff and the Log.
  -->
  <ElementHost fill="grow" stretch onready={(element) => measureArea(element)}>
    <SplitGrid
      groups={gridGroups}
      splitters={gridSplitters}
      look={settings.roundedPanels ? "rounded" : "flat"}
      focused={String(repoStore.focusedGroupId)}
      group={editorGroup}
      splitter={groupSplitter}
      onfocus={(groupId) => repoStore.focusGroup(Number(groupId))}
    />
  </ElementHost>
{/snippet}

{#snippet bottom()}
  <TerminalPanel />
{/snippet}

{#snippet right()}
  {@render sidePanel(settings.rightPanel)}
{/snippet}

{#snippet rightBar()}
  <RightActivityBar />
{/snippet}

{#snippet statusBar()}
  <StatusBar />
{/snippet}

<AppShell
  look={settings.roundedPanels ? "rounded" : "flat"}
  tint={windowChrome.tint}
  bind:sidebarWidth={() => settings.sidebarWidth, (width) => (settings.sidebarWidth = width)}
  bind:rightWidth={() => settings.explorerWidth, (width) => (settings.explorerWidth = width)}
  bind:bottomHeight={() => settings.terminalHeight, (height) => (settings.terminalHeight = height)}
  rightLabel={RIGHT_LABELS[settings.rightPanel]}
  bottomLabel="Resize terminal panel"
  bottomHidden={!terminalStore.panelOpen}
  oncommit={() => settings.save()}
  {header}
  {banners}
  leftBar={settings.leftBarVisible ? leftBar : undefined}
  sidebar={leftOpen ? sidebar : undefined}
  {editor}
  bottom={terminalStore.started ? bottom : undefined}
  right={settings.explorerOpen ? right : undefined}
  rightBar={settings.rightBarVisible ? rightBar : undefined}
  {statusBar}
/>
<!-- Every terminal, mounted once; each is moved into the panel or its editor tab. -->
<TerminalHost />

{#if repoStore.conflictsOpen && !repoStore.mergeTarget}
  <ConflictsDialog />
{/if}

{#if fileSearch.isOpen}
  <FileSearch />
{/if}

<!-- Recent Files (Cmd+E), loaded on first use. -->
{#if recentFilesStore.isOpen}
  {#await import("$lib/recentFiles/RecentFiles.svelte") then module}
    <module.default />
  {/await}
{/if}

<!--
  Jump to Navigation Bar when no placed bar answers it (placement None, or the Log or a diff
  with placement Top): a floating bar for the file on screen, else the active repository.
-->
{#if navBarStore.floating}
  {@const target = navTarget()}
  <NavigationBar targetPath={target.path} targetIsDir={target.isDir} floating />
{/if}

{#if repoStore.mergeTarget && repoStore.repo}
  {#key repoStore.mergeTarget}
    <MergeView repoPath={repoStore.repo.root} conflictPath={repoStore.mergeTarget} />
  {/key}
{/if}
