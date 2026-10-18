# MenuBar

A bar of menus under their names, like a window's File, Edit and View.

```ts
import MenuBar from "@nibtree/ui/components/MenuBar.svelte";
```

Group: Overlays. Also known as: Menubar, Application menu, Main menu.

## When to use

Use where the system has no menu bar for the app, such as the app in a browser tab. Each menu holds Menu items. Pointing
at another name while a menu is open opens that one; Left and Right move along the bar.

## Props

- `menus` (`MenuBarMenu[] ({ label, items, strong? }, from logic/menuBarModel.ts)`, required): The menus, left to right;
  `strong` sets the app's own menu name in bold.
- `label` (`string`, default `"Menu bar"`): Accessible name.
- `surface` (`"panel" | "none"`, default `"panel"`): Its own panel background with a line under it, or none inside
  AppHeader's menuBar row, where the header's background and glow show through.

## Rules

- Shortcut hints come from commandKeys(id) or localKeys(accelerator), never typed by hand.

## Example: File and Edit

```svelte
<MenuBar menus={[
  { label: "File", items: [{ label: "Open...", action: openFolder }] },
  { label: "Edit", items: [{ label: "Word Wrap", action: toggleWrap, checked: wrap }] },
]} />
```

## Replaces in the app

- `the native menu bar in the browser app (src/lib/menu/PageMenuBar.svelte)`

## Logic

- `logic/menuBarModel.ts`
- `logic/menuModel.ts`
