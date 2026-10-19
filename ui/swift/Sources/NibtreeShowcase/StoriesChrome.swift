import NibtreeTokens
import NibtreeUI
import SwiftUI

/// Stories of the bars around the app's content.
extension Stories {
    static let chrome: [Story] = [
        Story("ToggleButton", group: "Actions") {
            NStack(direction: .row, gap: .xs, align: .center) {
                NToggleButton(pressed: .constant(true), label: "Wrap", text: "Wrap")
                NToggleButton(pressed: .constant(false), label: "Ours", text: "Ours", variant: .outline)
                NToggleButton(pressed: .constant(true), label: "Blame", icon: .history, variant: .tool)
                NToggleButton(pressed: .constant(true), label: "Edited", text: "Edited only", variant: .chip)
                NToggleButton(pressed: .constant(false), label: "Mine", text: "Mine", variant: .filter)
            }
        },
        Story("SettingRow", group: "Layout") {
            NSettingRow(title: "Sign commits", hint: "Add `--signoff` to every commit.") {
                NSwitch(checked: .constant(true), label: "Sign commits")
            }
            .frame(width: 400)
        },
        Story("PopupRow", group: "Overlays") {
            NStack(gap: .none) {
                NPopupRow(label: "main", icon: .branch, hint: "origin/main", current: true)
                NPopupRow(label: "New branch", variant: .action, icon: .plus)
            }
            .frame(width: 300)
        },
        Story("ListRow", group: "Layout") {
            NStack(gap: .none) {
                NListRow(label: "CartItems.svelte", description: "src/lib/components")
                NListRow(label: "Open Folder", description: "File", icon: .folder, highlighted: true)
            }
            .frame(width: 320)
        },
        Story("Row", group: "Layout") {
            NStack(gap: .none) {
                NRow(size: .tree, expanded: .open) {
                    NIcon(.folder, size: .medium)
                    NText("src")
                }
                NRow(selected: true) {
                    NText("feature/login")
                    NSpacer()
                    NText("2 days", tone: .dim, size: .small)
                }
                NRow(disabled: true) { NText("gone") }
            }
            .frame(width: 300)
        },
        Story("ResourceLink", group: "Actions") {
            NStack(gap: .sm) {
                NResourceLink(icon: .book, title: "Read the docs", description: "Learn how Nibtree works.") {}
                NResourceLink(icon: .bug, title: "Report a problem", variant: .card) {}
            }
            .frame(width: 380)
        },
        Story("DialogHead", group: "Overlays") {
            NStack(gap: .none) {
                NDialogHead(title: "Delete branch", subtitle: "It has commits that are not merged.", icon: .trash,
                    iconTone: .danger)
                NDialogHead(title: "Settings", size: .content, onClose: {})
            }
            .frame(width: 380)
        },
        Story("ZoomBadge", group: "Feedback") {
            NZoomBadge(text: "125%").frame(width: 320, height: 110)
        },
        Story("ThemeSwatch", group: "Feedback") {
            NThemeSwatch(
                colors: NThemeSwatchColors(
                    background: .black, foreground: .white, border: .gray, keyword: .pink, string: .orange,
                    accent: .blue, selection: .indigo),
                label: "Dark")
        },
        Story("SearchToggles", group: "Forms") {
            NSearchToggles(options: .constant(NSearchOptions(matchCase: true, regex: true)))
        },
        Story("Segmented", group: "Actions") {
            NSegmented(
                options: [
                    NSegmentedOption(value: "light", label: "Light"), NSegmentedOption(value: "dark", label: "Dark"),
                    NSegmentedOption(value: "system", label: "System"),
                ], value: .constant("dark"), label: "Theme")
        },
        Story("Tile", group: "Actions") {
            NStack(direction: .row, gap: .lg, align: .start) {
                NTile(icon: .folder, label: "Open") {}
                NTile(icon: .cloudDownload, label: "Clone") {}.help("Clone a repository")
                NTile(icon: .plus, label: "New") {}
            }
        },
        Story("SectionTitle", group: "Layout") {
            NStack(gap: .none) {
                NSectionTitle(title: "Staged", variant: .bar, count: 3) {
                    NIconButton(icon: .minus, label: "Unstage all", size: .small) {}
                }
                NSectionTitle(title: "Branches", count: 12)
                NSectionTitle(title: "Appearance", variant: .group, heading: .two)
            }
            .frame(width: 320)
        },
        Story("StatusItem", group: "Layout") {
            NStack(direction: .row, gap: .xs, align: .center) {
                NStatusItem(text: "main", icon: .branch, action: {})
                NStatusItem(text: "2 ahead", icon: .arrowUp, tone: .accent)
                NStatusItem(text: "Keep awake", variant: .quiet)
                NStatusItem(icon: .sync, label: "Syncing", spin: true)
            }
        },
        Story("StatusBar", group: "Layout") {
            NStatusBar {
                NStatusItem(text: "nibtree", icon: .folderGit, action: {})
                NStatusItem(text: "main", icon: .branch, limit: .branch, action: {})
            } end: {
                NStatusItem(text: "214 MB", variant: .quiet)
                NStatusItem(icon: .bell, label: "Notifications", action: {})
            }
            .frame(width: 520)
        },
    ]
}
