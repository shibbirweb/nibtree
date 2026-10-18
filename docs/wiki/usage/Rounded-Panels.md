# Rounded Panels

Rounded panels give Nibtree a calm, spaced-out look. The sidebar, each editor, the bottom panel and the Files panel become separate panels with round corners. A small gap shows the window color between them, so each part of the window stands on its own.

The setting is **on by default** and works with **every color theme**, not only Islet Light and Islet Dark.

![The window with rounded panels in a dark theme](../images/rounded-panels.png)

*Nibtree Dark with rounded panels: the Changes sidebar, the editor and the Files panel each sit in their own panel.*

## Turn it on or off

1. Open **Settings** (Cmd+,). It opens on **Appearance**.
2. Turn **Rounded panels** on or off.

The window changes at once. Turn the switch off to get the classic look back, with panels joined by thin lines.

## What changes

With rounded panels on:

- **The window frame:** the header at the top, the status bar at the bottom and the two narrow icon bars on the left and right take the window color and lose their dividing lines.
- **The panels:** the left sidebar, the editor area, the terminal panel at the bottom and the Files panel on the right each get round corners and a 6 pixel gap around them.
- **Split editors:** when you split the editor (Window > Split Right or Split Down), each group is its own panel.
- **Editor tabs:** tabs become small rounded pills. A thin line under the tabs separates them from the code. The tab you are looking at is tinted with the theme's selection color and has a thin outline in the accent color. In the groups of a split editor that are not focused, the open tab is grey instead.
- **Resizing:** drag the gap between two panels to resize them, the same as you drag the line between them in the classic look. The gap lights up in the accent color while you drag.

Nothing else changes: menus, dialogs, the merge tool window and the colors inside each panel stay the same.

## With any color theme

Rounded panels need the window frame to look different from the panels and from the editor, or the gaps would be invisible. Many themes, such as One Dark Pro, Dracula or Dusk, use one color for both. For those, Nibtree picks a frame color for you: a little darker than the panels and the editor in dark themes, and a little greyer in light themes. Text on the frame always stays readable. Nibtree Dark uses a frame darker than its editor, so the editor and its tabs show as a rounded panel just as they do in Nibtree Light.

The **Islet Light** and **Islet Dark** themes come with their own frame colors, made for rounded panels. See [Color Themes](Color-Themes.md).

![The window with rounded panels in the Islet Light theme](../images/rounded-panels-islet-light.png)

*Islet Light with rounded panels.*

## Saved where

The choice is saved in `~/.nibtree/settings.json` as `roundedPanels`, for example `"roundedPanels": true`. Anything other than `true` or `false` counts as on, the default. See [Settings Files](Settings-Files.md).

## Related

- [Color Themes](Color-Themes.md)
- [Settings](Settings.md)
- [Editor and Tabs](Editor-and-Tabs.md)
- [How rounded panels work (developer)](../developer/How-Rounded-Panels-Work.md)
