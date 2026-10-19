import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("RefLabel")
@MainActor
struct RefLabelTests {
    @Test("the name starts after the border and padding, and after the icon and gap when there is one")
    func wordsLeft() {
        let plain = NRefLabelLook(kind: .local, label: "main", icon: nil)
        let iconed = NRefLabelLook(kind: .tag, label: "v1", icon: .tag)
        #expect(abs(plain.wordsLeft - 7) < 1e-9)
        #expect(abs(iconed.wordsLeft - (7 + NIconSize.xsmall.points + 3)) < 1e-9)
    }

    @Test("the name's room is what the padding and border leave, never below zero")
    func room() {
        let look = NRefLabelLook(kind: .remote, label: "origin/main", icon: nil)
        #expect(abs(look.room(GMRefLabelTokens.maxWidth) - (GMRefLabelTokens.maxWidth - 14)) < 1e-9)
        #expect(look.room(4) == 0)
    }

    @Test("the natural width is the name plus padding and border on both sides")
    func naturalWidth() {
        let look = NRefLabelLook(kind: .head, label: "main", icon: nil)
        #expect(abs(look.naturalWidth - (look.naturalLayout.width + 14)) < 1e-9)
    }
}
