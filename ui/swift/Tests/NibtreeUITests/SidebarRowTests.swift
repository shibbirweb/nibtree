import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// SidebarRow.svelte's flex row: where each part goes.
@Suite("SidebarRow")
@MainActor
struct SidebarRowTests {
    private func look(
        label: String = "main", depth: NSidebarRowDepth = .none, icon: GMIconName? = nil, section: Bool = false,
        expanded: Bool? = nil, count: Int? = nil, detail: String = "", selected: Bool = false
    ) -> NSidebarRowLook {
        NSidebarRowLook(
            NSidebarRowProps(
                label: label, depth: depth, icon: icon, current: false, strong: false, section: section,
                expanded: expanded, count: count, ahead: 0, behind: 0, path: "", detail: detail, gone: false,
                selected: selected))
    }

    @Test("a leaf is indented by the chevron's room so names line up with their group's")
    func indent() {
        let leaf: CGFloat = GMSidebarRowTokens.paddingLeft + GMSidebarRowTokens.indent + GMSidebarRowTokens.chevron
        #expect(look(depth: .one).indent == leaf)
        let group: CGFloat = GMSidebarRowTokens.paddingLeft + 3 * GMSidebarRowTokens.indent
        #expect(look(depth: .three, expanded: false).indent == group)
    }

    @Test("the name takes what the count and the buttons leave, so they sit at the row's end")
    func nameGrows() {
        let row = look(count: 4)
        let parts = row.parts(width: 300, actions: 20, actionsAcceptDetail: true)
        let end: CGFloat = 300 - GMSidebarRowTokens.paddingRight
        #expect((parts.actions ?? 0) + 20 == end)
        #expect(parts.label + parts.labelWidth < (parts.count ?? 0))
    }

    @Test("a section's title keeps its own width and its buttons go to the end")
    func section() {
        let row = look(label: "Branches", section: true, count: 12)
        let parts = row.parts(width: 300, actions: 20, actionsAcceptDetail: true)
        #expect(parts.labelWidth == row.labelNatural)
        let end: CGFloat = 300 - GMSidebarRowTokens.paddingRight - 20
        #expect(parts.actions == end)
    }

    @Test("the buttons take the detail's place while they show; a section's at rest leave it")
    func detail() {
        let row = look(detail: "stash@{0}", selected: true)
        #expect(!row.showsDetail(hovering: false, acts: true))
        #expect(row.showsDetail(hovering: false, acts: false))
        #expect(look(section: true).showsActions(hovering: false))
        #expect(look(detail: "x").showsDetail(hovering: false, acts: true))
        let hidden = row.parts(width: 300, actions: 20, actionsAcceptDetail: false)
        #expect(hidden.detail == nil)
    }

    @Test("with nothing on offer the row is its parts' width")
    func natural() {
        let row = look(icon: .branch, count: 3)
        let parts = row.parts(width: row.naturalWidth(actions: nil, actionsAcceptDetail: true), actions: nil,
            actionsAcceptDetail: true)
        #expect(abs(parts.labelWidth - row.labelNatural) < 0.001)
    }
}
