import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// PopupRow.svelte's grid: `icon minmax(0, 1fr) minmax(0, auto) chevron`.
@Suite("PopupRow")
@MainActor
struct PopupRowTests {
    private func look(hint: String) -> NPopupRowLook {
        NPopupRowLook(
            label: "feature/login", variant: .item, icon: .branch, hint: hint, current: false, chevron: true,
            highlighted: false, disabled: false)
    }

    @Test("the hint keeps its own width and the name takes the rest")
    func shares() {
        let row = look(hint: "2 ahead")
        let columns = row.columns(width: 300)
        let hint = row.hint!.layout(width: nil).width
        #expect(abs(columns.hint - hint) < 0.01)
        let fixed = row.nameLeft + 2 * GMPopupRowTokens.gap + GMPopupRowTokens.chevronColumn + GMPopupRowTokens.paddingX
        #expect(abs(columns.name - (300 - fixed - hint)) < 0.01)
    }

    @Test("a long hint is capped at its max width")
    func capped() {
        let row = look(hint: String(repeating: "a long hint ", count: 30))
        #expect(row.columns(width: 900).hint == GMPopupRowTokens.hintMaxWidth)
    }

    @Test("an item always keeps the icon column; an action only with an icon")
    func iconColumn() {
        let action = NPopupRowLook(
            label: "Fetch", variant: .action, icon: nil, hint: "", current: false, chevron: false,
            highlighted: false, disabled: false)
        #expect(action.nameLeft == GMPopupRowTokens.paddingX)
        let item = GMPopupRowTokens.paddingX + GMPopupRowTokens.iconColumn + GMPopupRowTokens.gap
        #expect(look(hint: "").nameLeft == item)
    }
}
