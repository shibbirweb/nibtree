# How rounded panels work

This chapter explains how the **Rounded panels** setting turns the workspace into separate rounded panels, in any color theme. The user side is in [Rounded Panels](../usage/Rounded-Panels.md).

## Why we need it

With rounded panels, tool windows and the editor float as rounded "islets" on the window color. Users asked for this look. We first tied it to our Islet Light and Islet Dark themes, then made it a setting of its own, because the shape is a layout choice and people want it with their favorite colors too.

## How it works

The whole feature is one boolean attribute on `<html>` and CSS rules that only match while it is there. No component renders anything different, so turning it on or off never remounts an editor or a terminal.

```mermaid
flowchart LR
  S["settings.roundedPanels"] --> A["applyAppearance()"]
  A --> H["html data-rounded-panels"]
  H --> W["AppShell and SplitGrid look rounded: gaps, frame, rounded panels and groups"]
  H --> R["ResizeHandle.svelte: handle fills the gap"]
  H --> F["Header, StatusBar, activity bars: frame color"]
  H --> T["TabStrip look rounded: pill tabs"]
  H --> P["AppShell: the rounded bottom panel"]
```

### The setting

`roundedPanels` is a boolean preference in `settingsData.ts` (default `true`, parsed with `pickBoolean`). Settings > Appearance has a switch for it. `applyAppearance()` in `settings.svelte.ts` runs on every preference change and calls `root.toggleAttribute("data-rounded-panels", this.roundedPanels)`, next to `data-ligatures`.

### Gaps and corners

Two size tokens set the look: `appShell.panelGap` (6px) and `appShell.panelRadius` (10px) in `ui/design-tokens`. `Workspace.svelte` passes `look="rounded"` to the library's `AppShell` and `SplitGrid`: the body, main column and editor area get `gap: var(--panel-gap)`, the body gets side and bottom padding on the frame color, and the panels and editor groups get `border-radius` without divider borders. Editor groups and the terminal panel also get `overflow: hidden` so their contents are clipped to the corners.

The activity bars get a negative margin equal to the gap, so they stay flush with the window edge while the panels keep their gap.

### Resize handles in the gaps

A `ResizeHandle` is normally 5px wide with `margin: 0 -2px`, so it takes 1px of layout. With rounded panels it becomes exactly as wide as the gap and has a negative margin of one gap on each side. Together with the two flex gaps around it, the handle adds one gap of space and covers that gap exactly, so the space between panels is the drag area. Horizontal handles (the terminal panel) do the same with height.

```mermaid
flowchart LR
  L["Sidebar"] --- G1["flex gap 6px"] --- H["handle 6px, margins -6px"] --- G2["flex gap 6px"] --- M["Editor"]
```

### The frame color

The window behind the panels uses the color token `--frame`. Every theme must set it, and it must stand apart from both `--panel` and `--editor-bg`, or the gaps would be invisible. The editor is a panel too: in rounded mode its tab strip takes the editor color.

- The built-in themes set it in `colors.json` (`colors.css`): `#ebecf0` for Nibtree Light, `#131416` for Nibtree Dark.
- Catalog themes get it from `frameColor()` in the UI library's `themes/derive.ts`: the theme's `--bg` when its CIELAB distance from both the panel and the editor color is at least 5 (`FRAME_DISTANCE`), else the darker of the two darkened (dark themes) or the panel greyed toward the text (light themes), and as a last resort moved further toward the text. High contrast dark themes with a black panel and GitHub Dark, whose editor is almost black, end up there.
- `legible()` in `deriveColors` now also checks the frame, so dim text and status colors stay readable on the header and status bar.

### Tabs

With rounded panels on, `EditorTabs.svelte` gives the library's `TabStrip` the `rounded` look, which draws pill tabs: the strip takes the editor background, each tab is 26px tall with a 6px radius, and the separators and the accent line on top are gone. The active tab uses `--selected` with an outline mixed from `--accent`. In an unfocused split group it uses `--selected-inactive` and `--border-strong`.

## Where the code lives

| File | What |
| --- | --- |
| `src/lib/stores/settingsData.ts` | `roundedPanels` type, default and parsing |
| `src/lib/stores/settings.svelte.ts` | the store field and `data-rounded-panels` in `applyAppearance()` |
| `src/lib/views/settings/AppearanceSettings.svelte` | the Appearance switch |
| `ui/design-tokens/components.json`, `colors.json` | `appShell.panelGap`, `appShell.panelRadius` and the built-in `--frame` |
| `ui/web/src/lib/themes/colorTokens.ts`, `derive.ts` | `--frame` as a color token, `frameColor()` |
| `src/lib/views/Workspace.svelte`, `AppShell` and `SplitGrid` (UI library) | gaps, padding, frame, rounded panels |
| `src/lib/ui/ResizeHandle.svelte` | handles that fill the gaps |
| `src/lib/views/Header.svelte`, `StatusBar.svelte`, `ActivityBar.svelte`, `RightActivityBar.svelte` | frame color, no dividers (the library's `AppHeader` and `StatusBar` take `look="rounded"`) |
| `ui/web/src/lib/components/EditorTab.svelte` | pill tabs (look rounded) |
| `AppShell` (UI library) | the rounded bottom panel |
| `SplitGrid` (UI library) | editor groups clip to the panel's corners |

## Design decisions

**An attribute, not a component prop.** CSS on one root attribute keeps every component unaware of the setting and avoids remounting editors and terminals. It is the same pattern as `data-ligatures` and `data-contrast`.

**Separate from the color theme.** Shape and color are independent choices. The Islet themes only bring colors; the setting brings the shape for every theme.

**A derived frame instead of `--bg`.** Many themes paint `--bg` and `--panel` the same, which would hide the gaps. A tested token keeps the look working in all 41 themes.

**The file toolbar is square at the top.** With the File toolbar at the Bottom, the editor group's clipping rounds the bar's bottom corners. At the Top the bar sits right under the tabs, inside the panel, so it stays a square band joined to the tab strip. Rounding its top corners there was tried and made the bar look like a separate box.

**On by default.** New installs start with the rounded look, the one the app is designed around. Existing users keep their choice: settings.json saves every preference, so anyone who already has one keeps `"roundedPanels": false` and the classic look until they change it.

## Bugs we fixed

See [Rounded Panels Bugs We Fixed](Rounded-Panels-Bugs-We-Fixed.md).

## Tests

- `settingsData.test.ts`: the default, `true`, and a non-boolean value falling back to off.
- `catalog.test.ts`: for every theme, `--frame` is at least 5 CIELAB units from `--panel` and `--editor-bg`, and `--text` keeps its contrast minimum on it; `--frame` is in all three `colors.css` blocks.
- The look itself needs a visual check: `rounded-panels` and `rounded-panels-islet-light` in `scripts/screenshots.ts`.

## Keeping in sync

- A new top-level panel in the workspace needs its own rounded rule under `html[data-rounded-panels]` and must sit in a flex container with the panel gap.
- A new resize handle works as is if it is a `ResizeHandle` between two flex children of such a container. Inside one panel, pass `inPanel`.
- New UI on the frame (header, status bar, activity bars) should use `--frame` in rounded mode, not `--bg`.
