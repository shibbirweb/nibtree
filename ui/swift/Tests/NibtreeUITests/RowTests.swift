import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// Row.svelte's size rules.
@Suite("Row")
struct RowTests {
    private func look(_ size: NRowSize, depth: Int = 0, line: Bool = false) -> NRowLook {
        NRowLook(
            size: size, selected: false, disabled: false, depth: depth, expanded: nil, align: .center,
            alwaysShown: false, line: line, mark: false, interactive: false, acts: false)
    }

    @Test("fixed rows keep their token height whatever their content")
    func fixed() {
        #expect(look(.list).height(content: 40) == GMRowTokens.listHeight)
        #expect(look(.history).height(content: 0) == GMRowTokens.historyHeight)
    }

    @Test("entry rows are their content and padding; large and section rows keep a minimum")
    func growing() {
        #expect(look(.entry).height(content: 16) == 16 + 2 * GMRowTokens.entryPaddingY)
        #expect(look(.large).height(content: 16) == GMRowTokens.largeMinHeight)
        #expect(look(.section).height(content: 40) == 40)
    }

    @Test("an indent adds a step per depth to the start padding, and a line adds its point under an entry")
    func indentAndLine() {
        #expect(look(.tree, depth: 2).padding.left == GMRowTokens.treePaddingX + 2 * GMRowTokens.indent)
        #expect(look(.entry, line: true).height(content: 16) == 16 + 2 * GMRowTokens.entryPaddingY + 1)
    }
}
