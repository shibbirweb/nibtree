import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// Toolbar.svelte's variants: sizes, lines, fills and the dividers' metrics.
@Suite("Toolbar")
struct ToolbarTests {
    @Test("a tab bar is the token height with a strong line under it, which adds to its padding")
    func tab() {
        let look = NToolbarLook(variant: .tab, placement: .top)
        #expect(look.height == GMToolbarTokens.tabHeight)
        #expect(look.edge == .bottom)
        #expect(look.strongLine)
        #expect(look.insets.bottom == NToolbarLook.line)
    }

    @Test("placed at the bottom, any bar draws a strong line on top instead")
    func bottom() {
        let look = NToolbarLook(variant: .panel, placement: .bottom)
        #expect(look.edge == .top)
        #expect(look.strongLine)
        #expect(look.insets.top == NToolbarLook.line)
        #expect(look.insets.bottom == 0)
    }

    @Test("file bars fill with the panel color, dim their icons and shorten their dividers")
    func file() {
        let look = NToolbarLook(variant: .file, placement: .top)
        #expect(look.fill == .panel)
        #expect(look.tone == .textDim)
        #expect(look.dividers.length == GMToolbarTokens.fileDividerLength)
        #expect(NToolbarLook(variant: .compact, placement: .top).tone == .text)
        #expect(NToolbarLook(variant: .strip, placement: .top).gap == 0)
    }

    @Test("the merge bar's dividers are longer with more room; the editor's have more room")
    func dividers() {
        let merge = NToolbarLook(variant: .merge, placement: .top)
        #expect(merge.dividers.length == GMToolbarTokens.mergeDividerLength)
        #expect(merge.dividers.space == GMToolbarTokens.mergeDividerSpace)
        #expect(NToolbarLook(variant: .editor, placement: .top).dividers.space == GMToolbarTokens.editorDividerSpace)
        #expect(NToolbarLook(variant: .tab, placement: .top).dividers.space == GMToolbarTokens.dividerSpace)
    }

    @Test("a rail is a set width with its line on the right; a filter row draws nothing")
    func rail() {
        let rail = NToolbarLook(variant: .rail, placement: .top)
        #expect(rail.width == GMToolbarTokens.railWidth)
        #expect(rail.insets.trailing == NToolbarLook.line)
        #expect(!NToolbarLook(variant: .filter, placement: .top).draws)
        #expect(NToolbarLook(variant: .conflict, placement: .top).draws)
    }
}
