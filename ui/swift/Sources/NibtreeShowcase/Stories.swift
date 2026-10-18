import NibtreeTokens
import NibtreeUI
import SwiftUI

/// One showcase page: a component (named like its ui/web twin) in the states worth comparing.
struct Story: Identifiable, Sendable {
    let name: String
    let group: String
    let make: @MainActor @Sendable () -> AnyView

    var id: String { name }

    init<V: View>(_ name: String, group: String, @ViewBuilder _ make: @escaping @MainActor @Sendable () -> V) {
        self.name = name
        self.group = group
        self.make = { AnyView(make()) }
    }
}

/// Every story, in ui/web's groups. Add a component's story here (or in a Stories<Group>.swift file) with its file in
/// Sources/NibtreeUI/Components.
@MainActor
enum Stories {
    static let all: [Story] = basics + layout + feedback + forms + navigation

    static let basics: [Story] = [
        Story("Stack", group: "Layout") {
            NStack(gap: .lg) {
                NText("row, gap md", variant: .sectionLabel)
                NStack(direction: .row, gap: .md) {
                    box("One")
                    box("Two")
                    box("Three")
                }
                NText("row, justify between", variant: .sectionLabel)
                NStack(direction: .row, justify: .between) {
                    box("Start")
                    box("End")
                }
                NText("column on a panel surface, padding lg, line bottom", variant: .sectionLabel)
                NStack(gap: .xs, padding: .lg, surface: .panel, line: .bottom) {
                    NText("First")
                    NText("Second", tone: .dim)
                }
            }
        },
        Story("Divider", group: "Layout") {
            NStack(gap: .sm) {
                NText("Strong, then soft")
                NDivider()
                NDivider(strong: false)
                NStack(direction: .row, gap: .sm) {
                    NText("Left")
                    NDivider(direction: .vertical)
                    NText("Right")
                }
            }
        },
        Story("Spacer", group: "Layout") {
            NStack(direction: .row, gap: .sm) {
                NText("Title", variant: .title)
                NSpacer()
                box("One")
                box("Two")
            }
        },
        Story("Icon", group: "Content") {
            NStack(gap: .sm) {
                ForEach(Array(stride(from: 0, to: GMIconName.allCases.count, by: 14)), id: \.self) { start in
                    NStack(direction: .row, gap: .sm) {
                        ForEach(GMIconName.allCases[start..<min(start + 14, GMIconName.allCases.count)], id: \.self) {
                            NIcon($0)
                        }
                    }
                }
                NStack(direction: .row, gap: .sm, align: .center) {
                    ForEach(NIconSize.allCases, id: \.self) { NIcon(.settings, size: $0, tone: .dim) }
                }
            }
        },
        Story("LayoutIcon", group: "Actions") {
            NStack(direction: .row, gap: .sm, align: .center) {
                ForEach(NLayoutIcon.Kind.allCases, id: \.self) { NLayoutIcon(kind: $0) }
                NLayoutIcon(kind: .sidebarLeft, active: true)
                NLayoutIcon(kind: .sidebarRight, active: true, size: .xxlarge)
            }
        },
        Story("Button", group: "Actions") { ButtonStory() },
        Story("IconButton", group: "Actions") {
            NStack(direction: .row, gap: .xs, align: .center) {
                NIconButton(icon: .settings, label: "Settings") {}
                NIconButton(icon: .trash, label: "Delete", iconSize: .normal, tone: .dimDanger) {}
                NIconButton(icon: .search, label: "Search", iconSize: .normal, active: true) {}
                NIconButton(icon: .refresh, label: "Refresh", iconSize: .normal, spinning: true) {}
                NIconButton(layout: .sidebarLeft, label: "Toggle sidebar", iconSize: .normal) {}
                NIconButton(icon: .sync, label: "Sync", iconSize: .compact, size: .row, count: "2\u{2193} 1\u{2191}") {}
                NIconButton(icon: .x, label: "Close", iconSize: .small, size: .micro) {}
            }
        },
        Story("Link", group: "Actions") { LinkStory() },
        Story("Chip", group: "Actions") {
            NStack(direction: .row, gap: .xs, align: .center) {
                NChip("3 running", status: .working)
                NChip("2 need you", tone: .warning, status: .waiting) {}
                NChip("Menlo", variant: .pick, fontFamily: "Menlo") {}
                NChip("node 20", variant: .badge)
            }
        },
        Story("Text", group: "Content") {
            NStack(gap: .sm) {
                ForEach(NText.Variant.allCases, id: \.self) { variant in
                    NText("\(variant.rawValue): The quick brown fox", variant: variant)
                }
                NStack(direction: .row, gap: .md) {
                    ForEach(NText.Tone.allCases, id: \.self) { tone in
                        NText(tone.rawValue, tone: tone)
                    }
                }
                NText("a1b2c3d mono", mono: true)
                NText("Deleted file name", strike: true)
                NText(String(repeating: "A long path that truncates at the end / ", count: 4), truncate: true)
            }
        },
    ]

    private static func box(_ label: String) -> some View {
        NStack(padding: .sm, surface: .alt) {
            NText(label)
        }
    }
}
