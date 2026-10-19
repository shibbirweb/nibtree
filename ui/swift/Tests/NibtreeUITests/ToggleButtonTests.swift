import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// ToggleButton.svelte's color rules: a hover rule outranks `.active`, so a pointed-at button shows the hover
/// background even when on.
@Suite("ToggleButton")
@MainActor
struct ToggleButtonTests {
    private let palette = Palette.light

    private func colors(
        _ variant: NToggleButtonVariant, pressed: Bool, hovering: Bool
    ) -> (CGColor?, CGColor?, CGColor) {
        let look = NToggleButtonLook(variant: variant, pressed: pressed, icon: nil, text: "Wrap")
        let colors = look.colors(hovering: hovering, palette: palette)
        return (colors.fill, colors.edge, colors.text)
    }

    @Test("an on plain button is tinted, and hovering it shows the hover background with bright words")
    func plain() {
        #expect(colors(.plain, pressed: true, hovering: false).0 == palette.cgColor(.selectedInactive))
        #expect(colors(.plain, pressed: true, hovering: true).0 == palette.cgColor(.hover))
        #expect(colors(.plain, pressed: true, hovering: true).2 == palette.cgColor(.text))
        #expect(colors(.plain, pressed: false, hovering: false).2 == palette.cgColor(.textDim))
    }

    @Test("an on outline turns accent and has no hover look")
    func outline() {
        #expect(colors(.outline, pressed: true, hovering: true).1 == palette.cgColor(.accent))
        #expect(colors(.outline, pressed: false, hovering: true).0 == nil)
    }

    @Test("an icon-only plain button has the narrower padding")
    func iconOnly() {
        let look = NToggleButtonLook(variant: .plain, pressed: false, icon: .pilcrow, text: "")
        #expect(look.paddingX == GMToggleButtonTokens.iconPaddingX)
    }
}
