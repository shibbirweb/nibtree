<!-- The Notifications panel in the right sidebar: every message of this session
     (pull, push, fetch, errors...), newest first, with any link that still works. Each one closes on its own x, Clear
     All empties the list, and the bell toggles Do Not Disturb. While it is shown, nothing pops up as a toast. -->
<script lang="ts">
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Notification from "@nibtree/ui/components/Notification.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { settings } from "$lib/stores/settings.svelte";
  import { toast } from "$lib/ui/toast.svelte";
  import PanelHead from "$lib/views/PanelHead.svelte";
  import { notifications } from "./notifications.svelte";

  const doNotDisturb = $derived(settings.notificationsDoNotDisturb);
</script>

<Stack grow gap="none" role="region" label="Notifications">
  <PanelHead
    title="Notifications"
    hideTitle={withCommandKeys("Hide", "view.notifications")}
    onhide={() => settings.hidePanel("notifications")}
  >
    <IconButton
      icon={doNotDisturb ? "bell-off" : "bell"}
      iconSize="medium"
      size="compact"
      label="Do Not Disturb"
      title={doNotDisturb ? "Do Not Disturb is on: only errors pop up" : "Do Not Disturb: only errors pop up"}
      active={doNotDisturb}
      onclick={() => settings.setPreference("notificationsDoNotDisturb", !doNotDisturb)}
    />
    <IconButton
      icon="trash"
      iconSize="medium"
      size="compact"
      label="Clear All"
      disabled={notifications.items.length === 0}
      onclick={() => notifications.clear()}
    />
  </PanelHead>
  <Stack grow gap="none" scroll="y" role="group" label="Messages">
    {#each notifications.items as entry, index (entry.id)}
      <Stack line={index > 0 ? "top" : "none"}>
        <Notification
          variant="row"
          kind={entry.kind}
          title={entry.title}
          detail={entry.detail}
          source={entry.source}
          time={entry.time}
          unread={notifications.fresh.has(entry.id)}
          actionLabel={entry.action && notifications.actionAvailable(entry) ? entry.action.label : null}
          onaction={() => toast.runNotificationAction(entry.id)}
          ondismiss={() => notifications.remove(entry.id)}
        />
      </Stack>
    {:else}
      <EmptyState
        variant="pane"
        icon="bell"
        title="No notifications"
        hint="Pull, push, fetch and other events show up here."
      />
    {/each}
  </Stack>
</Stack>
