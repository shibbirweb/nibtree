import NibtreeUI
import SwiftUI

/// Stories of the Navigation group: ways to move around and to show or hide parts of a view.
extension Stories {
    static let navigation: [Story] = [
        Story("EditorTab", group: "Navigation") {
            NStack(direction: .row) {
                NEditorTab(tab: NEditorTabData(id: "a", label: "main.rs", icon: .file), active: true)
                NEditorTab(tab: NEditorTabData(id: "b", label: "README.md", preview: true))
                NEditorTab(tab: NEditorTabData(id: "c", label: "lib.rs", dirty: true))
            }
        },
        Story("ActivityBar", group: "Navigation") {
            NActivityBar(
                entries: [
                    .item(NActivityItem(id: "files", icon: .file, label: "Files")),
                    .item(NActivityItem(id: "changes", icon: .gitCompare, label: "Changes", badge: 4)), .divider,
                    .spacer, .item(NActivityItem(id: "settings", icon: .settings, label: "Settings", dot: true)),
                ], active: .constant("changes"), label: "Panels"
            )
            .frame(height: 260)
        },
        Story("FileRow", group: "Navigation") {
            NStack(gap: .none) {
                NFileRow(kind: .modified, name: "main.rs", directory: "src-tauri/src")
                NFileRow(kind: .deleted, name: "old.ts", directory: "src/lib", badge: "LFS")
                NFileRow(kind: .added, name: "index.ts", directory: "src", selected: true, variant: .list)
            }
            .frame(width: 280)
        },
        Story("SidebarRow", group: "Navigation") {
            NStack(gap: .none) {
                NSidebarRow(label: "Branches", section: true, count: 12) {
                    NIconButton(icon: .plus, label: "New branch", size: .small) {}
                }
                NSidebarRow(label: "origin", icon: .cloud, expanded: true)
                NSidebarRow(label: "main", depth: .one, icon: .branch, current: true, strong: true, ahead: 2, behind: 1)
                NSidebarRow(label: "feature/old-login", depth: .one, icon: .branch, behind: 3, gone: true)
                NSidebarRow(label: "WIP on main", icon: .stash, detail: "stash@{0}", selected: true) {
                    NIconButton(icon: .trash, label: "Drop", size: .small) {}
                }
            }
            .frame(width: 280)
        },
        Story("Collapsible", group: "Navigation") { CollapsibleStory() },
        Story("Breadcrumbs", group: "Navigation") { BreadcrumbsStory() },
    ]
}

private struct CollapsibleStory: View {
    @State private var staged = true
    @State private var changes = false

    var body: some View {
        NStack {
            NCollapsible(title: "Staged", open: $staged, count: 2) { hovering in
                if hovering {
                    NIconButton(icon: .minus, label: "Unstage all", iconSize: .compact, size: .row) {}
                }
            } content: {
                NStack(paddingX: .lg) {
                    NText("src/app.ts", size: .small)
                    NText("README.md", size: .small)
                }
            }
            NCollapsible(title: "Changes", open: $changes, count: 14) {
                NText("notes.txt", size: .small)
            }
        }
        .frame(width: 280)
    }
}

private struct BreadcrumbsStory: View {
    @State private var open: Int?

    private let crumbs = [
        NCrumb("git-merger", icon: .folderGit, kind: .repo), NCrumb("src"), NCrumb("lib"),
        NCrumb("app.ts", fileIcon: nil, kind: .file),
    ]

    var body: some View {
        NStack(gap: .md) {
            NBreadcrumbs(crumbs: crumbs, open: open) { open = open == $0 ? nil : $0 }
            NBreadcrumbs(crumbs: crumbs, variant: .floating)
            NBreadcrumbs(crumbs: crumbs).frame(width: 160)
        }
        .frame(width: 360)
        .padding(.vertical, 24)
    }
}
