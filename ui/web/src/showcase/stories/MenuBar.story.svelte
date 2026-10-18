<script lang="ts">
  import MenuBar from "$ui/components/MenuBar.svelte";
  import Stack from "$ui/components/Stack.svelte";
  import Text from "$ui/components/Text.svelte";

  let last = $state("nothing yet");
  let wordWrap = $state(true);
  let minimap = $state(false);
  const run = (name: string) => () => (last = name);
</script>

<Stack gap="md">
  <MenuBar
    menus={[
      {
        label: "File",
        items: [
          { label: "New File", action: run("New File") },
          { label: "Open Folder...", action: run("Open Folder") },
          { separator: true },
          {
            label: "Open Recent",
            submenu: [
              { label: "nibtree", action: run("Open nibtree") },
              { label: "website", action: run("Open website") },
            ],
          },
          { separator: true },
          { label: "Close Folder", action: run("Close Folder"), disabled: true },
        ],
      },
      {
        label: "Edit",
        items: [
          { label: "Undo", action: run("Undo") },
          { label: "Redo", action: run("Redo") },
        ],
      },
      {
        label: "View",
        items: [
          { label: "Word Wrap", action: () => (wordWrap = !wordWrap), checked: wordWrap },
          { label: "Minimap", action: () => (minimap = !minimap), checked: minimap },
        ],
      },
      { label: "Help", items: [{ label: "About Nibtree", action: run("About") }] },
    ]}
  />
  <Text tone="dim">Ran: {last}</Text>
</Stack>
