import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// EditorTab.svelte's looks: fills, sizes and the close button's tooltip.
@Suite("EditorTab")
@MainActor
struct EditorTabTests {
    private func look(
        _ tab: NEditorTabData = NEditorTabData(id: "a", label: "main.rs"), active: Bool = false, focused: Bool = true,
        layout: NEditorTabLayout = .scroll, style: NEditorTabLookStyle = .flat, lifted: Bool = false
    ) -> NEditorTabLook {
        NEditorTabLook(
            tab: tab, active: active, focused: focused, layout: layout, look: style, lifted: lifted, closable: true)
    }

    @Test("the open tab takes the editor color, a hovered one the hover color; a single tab has no fill")
    func fills() {
        #expect(look(active: true).fill(hovering: false) == .editorBg)
        #expect(look().fill(hovering: true) == .hover)
        #expect(look(active: true, layout: .single).fill(hovering: true) == nil)
        #expect(look(active: true, style: .rounded).fill(hovering: false) == .selected)
        #expect(look(active: true, focused: false, style: .rounded).fill(hovering: false) == .selectedInactive)
        #expect(look(lifted: true).fill(hovering: false) == .editorBg)
    }

    @Test("a long name stops at the strip's tab width; wrapped and rounded tabs have their own heights")
    func sizes() {
        let long = look(NEditorTabData(id: "a", label: String(repeating: "long-name-", count: 20)))
        #expect(long.width(offer: nil) == GMTabStripTokens.tabMaxWidth)
        #expect(look(layout: .wrap).height(offer: nil) == GMTabStripTokens.height)
        #expect(look(style: .rounded).height(offer: nil) == GMEditorTabTokens.roundedHeight)
        #expect(look().height(offer: 34) == 34)
    }

    @Test("a preview tab's name is italic; a single tab's is medium")
    func fonts() {
        #expect(look(NEditorTabData(id: "a", label: "x", preview: true)).name.font.italic)
        #expect(look(layout: .single).name.font.weight == GMFontWeight.medium)
    }

    @Test("the close button says the tab's state and what it does")
    func closeTitle() {
        let dirty = NEditorTabData(id: "a", label: "x", dirty: true, pinned: true)
        #expect(NEditorTab.closeTitle(dirty, unpins: true) == "Pinned, unsaved changes. Unpin")
        #expect(NEditorTab.closeTitle(dirty, unpins: false) == "Unsaved changes. Close")
        #expect(NEditorTab.closeTitle(NEditorTabData(id: "a", label: "x"), unpins: false) == "Close")
    }
}
