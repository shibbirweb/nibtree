import NibtreeTokens
import Testing

@testable import NibtreeUI

/// The color and spacing rules of StatusItem.svelte's classes, in the order its styles apply them.
@Suite("StatusItem")
@MainActor
struct StatusItemTests {
    private func look(
        text: String = "main", tone: NStatusItemTone = .default, open: Bool = false,
        variant: NStatusItemVariant = .default, active: Bool = false, iconOnly: Bool = false
    ) -> NStatusItemLook {
        NStatusItemLook(
            text: text, icon: .branch, tone: tone, open: open, spin: false, variant: variant, active: active,
            disabled: false, limit: .none, iconOnly: iconOnly)
    }

    @Test("a default item takes the bar's color; an open one is bright")
    func inherited() {
        #expect(look().color(hovering: false, inherited: .textDim) == .textDim)
        #expect(look(open: true).color(hovering: false, inherited: .textDim) == .text)
    }

    @Test("a tone wins over open, and hover wins over a tone")
    func toneAndHover() {
        #expect(look(tone: .accent, open: true).color(hovering: false, inherited: .textDim) == .accent)
        #expect(look(tone: .danger).color(hovering: true, inherited: .textDim) == .text)
    }

    @Test("quiet words are dim until active, even while open")
    func quiet() {
        #expect(look(open: true, variant: .quiet).color(hovering: false, inherited: .text) == .textDim)
        #expect(look(variant: .quiet, active: true).color(hovering: false, inherited: .textDim) == .text)
    }

    @Test("an icon-only item has the narrower padding, but a quiet one keeps its own")
    func padding() {
        #expect(look(iconOnly: true).paddingX == GMStatusBarTokens.iconOnlyPaddingX)
        #expect(look().paddingX == GMStatusBarTokens.itemPaddingX)
        #expect(look(variant: .quiet, iconOnly: true).paddingX == GMStatusBarTokens.quietPaddingX)
    }
}
