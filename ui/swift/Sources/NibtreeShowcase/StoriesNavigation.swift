import NibtreeUI
import SwiftUI

/// Stories of the Navigation group: ways to move around and to show or hide parts of a view.
extension Stories {
    static let navigation: [Story] = [
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
