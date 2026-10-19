import NibtreeTokens
import Testing

@testable import NibtreeUI

/// DialogHead.svelte's size rules.
@Suite("DialogHead")
@MainActor
struct DialogHeadTests {
    private func look(icon: GMIconName? = nil, size: NDialogHeadSize, closes: Bool = false) -> NDialogHeadLook {
        NDialogHeadLook(title: "Title", subtitle: "", icon: icon, iconTone: .accent, size: size, closes: closes)
    }

    @Test("a panel head without an icon and a content head center their items; the others align them at the top")
    func centering() {
        #expect(look(size: .panel).centered)
        #expect(!look(icon: .info, size: .panel).centered)
        #expect(look(size: .content).centered)
        #expect(!look(size: .normal).centered)
    }

    @Test("only a normal head keeps room under itself and a margin around its title")
    func margins() {
        #expect(look(size: .normal).marginBottom == GMDialogHeadTokens.bottom)
        #expect(look(size: .panel).marginBottom == 0)
        #expect(look(size: .content).titleMargin == 0)
    }

    @Test("a panel head with an icon takes the body's side padding and the bigger tile")
    func panelIcon() {
        let head = look(icon: .info, size: .panel)
        #expect(head.padding.left == GMPanelDialogTokens.bodyPaddingX)
        #expect(head.tile == GMPanelDialogTokens.iconSize)
    }
}
