# Activity Bars

The **activity bars** are the two thin icon strips at the left and right edges of the window. Each icon opens a panel or a view: Changes, Branches and Stashes, the Log, Scripts and the Terminal start on the left, and Files, AI Agents and Notifications start on the right. You can put every icon where you like: on either bar, at its top or at its bottom, in any order.

[TODO:activity-bar-menu.png]

*Right-click an icon to move it to another place.*

## Move an icon from its menu

1. Right-click the icon, for example **Changes**.
2. Pick **Move to Left Top**, **Move to Left Bottom**, **Move to Right Top** or **Move to Right Bottom**. The place it is in now is greyed out.

The icon goes to the end of that group.

## Drag an icon

Press an icon and drag it. A short accent line shows where it will land: between two icons, at the end of a group, or in the other bar. Let go to drop it there. Drag it a little before the move starts, so a plain click still opens the panel. Press **Esc** while dragging to leave the icon where it was.

While you drag, an empty group (say, the right bar's bottom after you moved Notifications away) keeps a small spot so you can drop an icon back into it.

## The panel goes with its icon

Changes, Branches and Stashes, Scripts, Files, AI Agents and Notifications open a **side panel**. A panel always opens on the side of its icon:

- Move **Changes** to the right bar and the Changes panel opens on the right, where the Files panel was.
- Move **Files** to the left bar and the file tree opens on the left.
- If the panel is open when you move its icon, it moves to the other side right away.

Each side shows one panel at a time, like before: clicking another icon on the same side switches the panel, and clicking the open one hides it. The **Log** opens in the middle and the **Terminal** at the bottom wherever their icons are.

## Put everything back

Right-click any icon and pick **Reset Positions**. Every icon goes back to where it started, and an open panel goes back to its side. The item is greyed out while nothing has moved.

## Good to know

- The places are saved with the window layout in `state.json` (see [Settings Files](Settings-Files.md)), so they come back the next time you open Nibtree.
- **View > Sidebar** (Option+Cmd+B) shows the first panel whose icon is on the left bar.
- **Settings > Layout > Left sidebar** offers the panels whose icons are on the left bar.
- The keys and menu items still work the same: **View > Files Panel** (Cmd+B) opens the Files panel on whichever side its icon is.
