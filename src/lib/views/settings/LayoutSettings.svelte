<!-- Settings > Layout: notifications, the Files panel, drag and drop, the left sidebar and windows on start. -->
<script lang="ts">
  import { commandKeys } from "$lib/commands/commandRuntime";
  import { settings } from "$lib/stores/settings.svelte";
  import { panelSide, SIDE_PANELS, type SidePanel } from "$lib/stores/sidePanels";
  import Segmented from "@nibtree/ui/components/Segmented.svelte";
  import Switch from "@nibtree/ui/components/Switch.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import { set } from "./settingsShared";

  const PANEL_NAMES: Record<SidePanel, string> = {
    changes: "Changes",
    branches: "Branches",
    scripts: "Scripts",
    files: "Files",
    ai: "AI Agents",
    notifications: "Notifications",
  };
  // The panels whose activity bar icon is on the left (the icons can move between the bars).
  const sidebarChoices = $derived([
    ...SIDE_PANELS.filter((panel) => panel !== "scripts" && panelSide(settings.activityLayout, panel) === "left").map(
      (panel) => ({ value: panel as SidePanel | "hidden", label: PANEL_NAMES[panel] }),
    ),
    { value: "hidden" as const, label: "Hidden" },
  ]);
  const filesKeys = commandKeys("view.filesPanel");
  const sidebarKeys = commandKeys("view.sidebar");
</script>

<SettingsRow
  title="Do not disturb"
  hint="Only errors pop up. Every message is still kept in the bell at the bottom right."
  toggle
>
  <Switch
    label="Do not disturb"
    checked={settings.notificationsDoNotDisturb}
    onchange={(on) => set("notificationsDoNotDisturb", on)}
  />
</SettingsRow>
<SettingsRow
  title="Files panel"
  hint="Show the file tree on the right.{filesKeys ? ` Also toggled with ${filesKeys}.` : ''}"
  toggle
>
  <Switch label="Files panel" checked={settings.filesPanelShown} onchange={() => settings.toggleExplorer()} />
</SettingsRow>
<SettingsRow
  title="Confirm drag and drop"
  hint="Ask before dragging files or folders in the Files panel moves them."
  toggle
>
  <Switch
    label="Confirm drag and drop"
    checked={settings.confirmDragAndDrop}
    onchange={(on) => set("confirmDragAndDrop", on)}
  />
</SettingsRow>
<SettingsRow
  title="Left sidebar"
  hint="Also toggled from the activity bar{sidebarKeys ? ` or with ${sidebarKeys}` : ''}."
>
  <Segmented
    label="Left sidebar"
    options={sidebarChoices}
    value={settings.leftPanel ?? "hidden"}
    onchange={(panel) => settings.setLeftPanel(panel === "hidden" ? null : panel)}
  />
</SettingsRow>
<SettingsRow title="Reopen windows on start" toggle>
  {#snippet hintContent()}
    Open every window that was open when you quit, each with its folders. Off: only the last folders you had open.
  {/snippet}
  <Switch
    label="Reopen windows on start"
    checked={settings.reopenWindows}
    onchange={(on) => set("reopenWindows", on)}
  />
</SettingsRow>
