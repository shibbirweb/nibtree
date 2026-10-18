<!--
  The welcome screen: a sidebar with Projects, Customize and
  Learn, and the recent projects as one searchable list with a colored badge each.
-->
<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { windowChrome } from "$lib/stores/windowChrome.svelte";
  import AppHeader from "@nibtree/ui/components/AppHeader.svelte";
  import { updates } from "$lib/update/updates.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Logo from "@nibtree/ui/components/Logo.svelte";
  import Pane from "@nibtree/ui/components/Pane.svelte";
  import SideNav from "@nibtree/ui/components/SideNav.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import WelcomeCustomize from "./welcome/WelcomeCustomize.svelte";
  import WelcomeLearn from "./welcome/WelcomeLearn.svelte";
  import WelcomeProjects from "./welcome/WelcomeProjects.svelte";
  import PageMenuBar from "$lib/menu/PageMenuBar.svelte";
  import { pageMenuHost } from "$lib/menu/pageMenuHost.svelte";

  type Section = "projects" | "customize" | "learn";

  const SECTIONS: { id: Section; label: string }[] = [
    { id: "projects", label: "Projects" },
    { id: "customize", label: "Customize" },
    { id: "learn", label: "Learn" },
  ];
  const LINKS = [
    { id: "star", label: "Star on GitHub", icon: "star" as const },
    { id: "bug", label: "Report a Bug", icon: "bug" as const },
    { id: "feature", label: "Request a Feature", icon: "lightbulb" as const },
  ];

  let section = $state<Section>("projects");

  function openLink(linkId: string): void {
    if (linkId === "star") {
      void updates.openRepository();
    } else if (linkId === "bug") {
      void updates.reportBug();
    } else {
      void updates.requestFeature();
    }
  }
</script>

<Stack gap="none" height="window" surface="panel">
  {#if pageMenuHost.mode}
    <PageMenuBar />
  {/if}
  {#if windowChrome.controlsInBar}
    <!-- The window's own buttons sit here (macOS), and the strip moves the window. -->
    <AppHeader look="rounded" windowControls>
      {#snippet start()}{/snippet}
    </AppHeader>
  {/if}
  <Stack element="main" direction="row" gap="none" grow>
    <Pane label="Welcome" line="soft">
      <Stack grow gap="xxl" paddingX="lg" paddingY="xl">
        <Stack direction="row" align="center" gap="lg" paddingX="mdPlus">
          <Logo />
          <Stack gap="xxs">
            <Text variant="heading">Nibtree</Text>
            {#if updates.current}
              <Text size="small" tone="dim">{updates.current}</Text>
            {/if}
          </Stack>
        </Stack>
        <SideNav
          label="Welcome sections"
          variant="large"
          items={SECTIONS}
          active={section}
          onselect={(sectionId) => (section = sectionId as Section)}
        />
        <Stack grow>{""}</Stack>
        <Stack gap="mdPlus">
          <SideNav label="Links" variant="links" items={LINKS} onselect={openLink} />
          <Divider strong={false} />
          <Stack paddingX="sm">
            <IconButton
              icon="settings"
              label="Settings"
              size="large"
              iconSize="regular"
              onclick={() => settings.openDialog()}
            />
          </Stack>
        </Stack>
      </Stack>
    </Pane>
    <Stack grow role="tabpanel" label={SECTIONS.find((item) => item.id === section)?.label}>
      {#if section === "projects"}
        <WelcomeProjects />
      {:else if section === "customize"}
        <WelcomeCustomize />
      {:else}
        <WelcomeLearn />
      {/if}
    </Stack>
  </Stack>
</Stack>
