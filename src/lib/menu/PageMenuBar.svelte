<!-- The app's menu bar in a browser tab, which has no native one (pageMenuHost.svelte.ts): the same menus, state,
     keys and actions as appMenu.svelte.ts (see pageMenu.ts). The page also runs the menu's keys, since no native
     menu sees them; a key the page already handled (the editor, the window shortcuts) is left alone, as the native
     menu does. In AppHeader's menuBar row it is `surface="none"`, so the header's glow covers it too. -->
<script lang="ts">
  import MenuBar from "@nibtree/ui/components/MenuBar.svelte";
  import { pageNativeItem } from "$lib/browser/pageNative";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { matchesAccelerator } from "$lib/commands/keybinding";
  import { menuAccelerators } from "$lib/commands/registry";
  import { usableOverrides } from "$lib/commands/shortcutSettings";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { recentEntries, recentMenuText } from "$lib/views/recentEntries";
  import { openRecent } from "$lib/views/repoPicker";
  import { currentMenuInputs } from "./appMenu.svelte";
  import { runMenuAction } from "./menuActions";
  import { actionEntries, menuSpec, platformFromUserAgent } from "./menuSpec";
  import { menuState } from "./menuState";
  import { pageMenus } from "./pageMenu";
  import { pageMenuHost } from "./pageMenuHost.svelte";

  let { surface = "panel" }: { surface?: "panel" | "none" } = $props();

  const mode = $derived(pageMenuHost.mode ?? "app");

  const platform = platformFromUserAgent(navigator.userAgent);
  const spec = $derived(menuSpec(platform, mode));
  const state = $derived(menuState(currentMenuInputs(mode)));
  const accelerators = $derived(menuAccelerators(spec, usableOverrides(settings.keybindings, platform)));
  const recent = $derived(
    recentEntries(settings, {
      file: repoStore.workspace?.file ?? null,
      folderRoots: repoStore.workspace?.folders.map((folder) => folder.root) ?? [],
    }).map((entry) => ({
      text: recentMenuText(entry),
      open: () => {
        // Like every File item, it waits while an in-app dialog asks something.
        if (dialogs.active === null) {
          void openRecent(entry);
        }
      },
    })),
  );
  const menus = $derived(
    pageMenus(spec, { state, accelerators, recent, keyWords: localKeys, run: runMenuAction, native: pageNativeItem }),
  );

  function onkeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || dialogs.active !== null) {
      return;
    }
    for (const entry of actionEntries(spec)) {
      const accelerator = accelerators.has(entry.action) ? accelerators.get(entry.action) : entry.accelerator;
      if (!accelerator || !matchesAccelerator(event, accelerator, platform)) {
        continue;
      }
      const itemState = state[entry.action];
      if (itemState?.enabled !== false && itemState?.visible !== false) {
        event.preventDefault();
        runMenuAction(entry.action);
      }
      return;
    }
  }
</script>

<svelte:window {onkeydown} />

<MenuBar {menus} {surface} />
