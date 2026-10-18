<!-- The window's top bar on the UI library's AppHeader: Back and Forward, the folder, repository and branch pickers,
     the busy work, and the layout, theme and settings buttons. -->
<script lang="ts">
  import AppHeader from "@nibtree/ui/components/AppHeader.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { api } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { contextMenu, type MenuItem } from "$lib/ui/menu.svelte";
  import { recentEntries, shortPath } from "./recentEntries";
  import { windowChrome } from "$lib/stores/windowChrome.svelte";
  import PageMenuBar from "$lib/menu/PageMenuBar.svelte";
  import { pageMenuHost } from "$lib/menu/pageMenuHost.svelte";
  import {
    openNewWindow,
    openRecent,
    openRecentInNewWindow,
    pickAndAddFolder,
    pickAndOpenInNewWindow,
    pickAndOpenRepo,
    pickAndOpenWorkspaceFile,
    pickAndSaveWorkspace,
  } from "./repoPicker";
  import { newBranchFrom } from "./sidebar/actions";
  import { navigation } from "$lib/stores/navigation.svelte";

  const head = $derived(repoStore.status?.head);
  const branchLabel = $derived(head?.branch ?? (head?.shortId ? `HEAD detached at ${head.shortId}` : "No branch"));
  const busy = $derived(repoStore.busy !== null || repoStore.repo === null);
  // A separate repository picker only helps when the folder is not simply one repository.
  const showRepoPicker = $derived(
    repoStore.repos.length > 1 ||
      (repoStore.repos.length === 1 && repoStore.repos[0].root !== repoStore.workspace?.root),
  );

  function changeCount(repoRoot: string): number {
    return repoStore.statuses[repoRoot]?.files.length ?? 0;
  }

  function workspaceMenu(event: MouseEvent): void {
    const openRoots = repoStore.workspace?.folders.map((folder) => folder.root) ?? [];
    const recent = recentEntries(settings, { file: repoStore.workspace?.file ?? null, folderRoots: openRoots });
    const items: MenuItem[] = recent.map((entry) => ({
      label: entry.label,
      hint: entry.hint,
      action: () => void openRecent(entry),
    }));
    if (items.length > 0) {
      items.push(
        {
          label: "Open Recent in New Window",
          submenu: recent.map((entry) => ({
            label: entry.label,
            hint: entry.hint,
            action: () => void openRecentInNewWindow(entry),
          })),
        },
        { separator: true },
      );
    }
    items.push(
      { label: "New Window", action: () => void openNewWindow() },
      { label: "Open Folder...", action: () => void pickAndOpenRepo() },
      { label: "Open Folder in New Window...", action: () => void pickAndOpenInNewWindow() },
      { label: "Open Workspace from File...", action: () => void pickAndOpenWorkspaceFile() },
      { label: "Add Folder to Workspace...", action: () => void pickAndAddFolder() },
      {
        label: repoStore.workspace?.file ? "Save Workspace As..." : "Save Workspace to File...",
        hint: repoStore.workspace?.file ? shortPath(repoStore.workspace.file) : undefined,
        action: () => void pickAndSaveWorkspace(),
      },
    );
    if (openRoots.length > 1) {
      items.push({ separator: true });
      for (const folder of repoStore.workspace?.folders ?? []) {
        items.push({
          label: `Remove "${folder.name}" from Workspace`,
          hint: shortPath(folder.root),
          action: () => void repoStore.removeFolder(folder.root),
        });
      }
    }
    items.push(
      { separator: true },
      { label: "Scan for Repositories", action: () => void repoStore.rediscover() },
      {
        label: openRoots.length > 1 ? "Close Workspace" : "Close Folder",
        action: () => void repoStore.closeWorkspace(),
      },
    );
    contextMenu.open(event, items);
  }

  function repoPickerMenu(event: MouseEvent): void {
    const items: MenuItem[] = repoStore.repos.map((repo) => {
      const count = changeCount(repo.root);
      const isActive = repo.root === repoStore.repo?.root;
      return {
        label: `${isActive ? "\u2713 " : "   "}${repo.name}`,
        hint: [
          repo.relativePath && repo.relativePath !== repo.name ? repo.relativePath : "",
          count > 0 ? `${count}` : "",
        ]
          .filter(Boolean)
          .join("  "),
        action: () => void repoStore.setActiveRepo(repo.root),
      };
    });
    items.push({ separator: true }, { label: "Scan for Repositories", action: () => void repoStore.rediscover() });
    contextMenu.open(event, items);
  }

  function branchMenu(event: MouseEvent): void {
    const local = repoStore.refs?.local ?? [];
    const items: MenuItem[] = [
      { label: "New Branch...", action: () => void newBranch() },
      { separator: true },
      ...local.map((branch) => ({
        label: branch.isHead ? `${branch.name}  (current)` : branch.name,
        disabled: branch.isHead,
        action: () =>
          void repoStore.run("Checkout", (repoPath) => api.checkoutBranch(repoPath, branch.name), {
            success: `Switched to ${branch.name}`,
          }),
      })),
    ];
    contextMenu.open(event, items);
  }

  function newBranch(): Promise<void> {
    return newBranchFrom(null);
  }

  function toggleTheme(): void {
    const dark =
      settings.theme === "dark" ||
      (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    settings.setTheme(dark ? "light" : "dark");
  }
</script>

{#snippet syncCount(count: number, icon: "arrow-up" | "arrow-down", title: string)}
  <Stack direction="row" align="center" gap="none" element="span">
    <Text size="small" tone="dim" {title}>{count}</Text>
    <Icon name={icon} size="small" tone="dim" />
  </Stack>
{/snippet}

{#snippet menuRow()}
  <PageMenuBar surface="none" />
{/snippet}

<AppHeader
  look={settings.roundedPanels ? "rounded" : "flat"}
  tint={windowChrome.tint}
  windowControls={windowChrome.controlsInBar}
  menuBar={pageMenuHost.mode ? menuRow : undefined}
  busy={repoStore.busy ? repoStore.progress || `${repoStore.busy}...` : ""}
  busyTitle={repoStore.progress || undefined}
>
  {#snippet start()}
    <Stack direction="row" gap="xxs" role="group" label="Navigation history">
      <IconButton
        icon="arrow-left"
        iconSize="regular"
        size="header"
        label="Go back"
        title={withCommandKeys("Go Back", "nav.goBack")}
        disabled={!navigation.canGoBack}
        onclick={() => void navigation.goBack()}
      />
      <IconButton
        icon="arrow-right"
        iconSize="regular"
        size="header"
        label="Go forward"
        title={withCommandKeys("Go Forward", "nav.goForward")}
        disabled={!navigation.canGoForward}
        onclick={() => void navigation.goForward()}
      />
    </Stack>
    <Divider direction="vertical" />
    <Button
      variant="ghost"
      icon="folder"
      trailingIcon="chevron-down"
      aria-haspopup="menu"
      title={(repoStore.workspace?.folders ?? []).map((folder) => folder.root).join("\n")}
      onclick={workspaceMenu}
    >
      <Text weight="semibold" truncate>{repoStore.workspace?.name}</Text>
    </Button>
    {#if showRepoPicker}
      <Text tone="faint">/</Text>
      <Button
        variant="ghost"
        icon="folder-git"
        trailingIcon="chevron-down"
        aria-haspopup="menu"
        count={repoStore.repos.length}
        title="Active repository: {repoStore.repo?.root ?? 'none'}"
        onclick={repoPickerMenu}
      >
        <Text truncate>{repoStore.repo?.name ?? "Select repository"}</Text>
      </Button>
    {/if}
    {#if repoStore.repo}
      <Button
        variant="ghost"
        icon="branch"
        trailingIcon="chevron-down"
        aria-haspopup="menu"
        title="Branch: {branchLabel}. Click to switch branches"
        onclick={branchMenu}
      >
        <Text truncate>{branchLabel}</Text>
        {#if head && head.ahead > 0}
          {@render syncCount(head.ahead, "arrow-up", "Commits to push")}
        {/if}
        {#if head && head.behind > 0}
          {@render syncCount(head.behind, "arrow-down", "Commits to pull")}
        {/if}
      </Button>
    {:else}
      <Text size="small" tone="dim">No git repository</Text>
    {/if}
  {/snippet}
  {#snippet end()}
    <Button
      variant="ghost"
      layout="sidebar-left"
      layoutActive={settings.leftBarVisible}
      title="{settings.leftBarVisible ? 'Hide' : 'Show'} Left Activity Bar"
      aria-label="Toggle left activity bar"
      aria-pressed={settings.leftBarVisible}
      onclick={() => settings.toggleActivityBar("left")}
    />
    <Button
      variant="ghost"
      layout="sidebar-right"
      layoutActive={settings.rightBarVisible}
      title="{settings.rightBarVisible ? 'Hide' : 'Show'} Right Activity Bar"
      aria-label="Toggle right activity bar"
      aria-pressed={settings.rightBarVisible}
      onclick={() => settings.toggleActivityBar("right")}
    />
    <Divider direction="vertical" />
    <IconButton icon="sun" iconSize="regular" label="Toggle light/dark theme" onclick={toggleTheme} />
    <IconButton
      icon="settings"
      iconSize="regular"
      label="Settings"
      title={withCommandKeys("Settings", "app.settings")}
      onclick={() => settings.openDialog()}
    />
  {/snippet}
</AppHeader>
