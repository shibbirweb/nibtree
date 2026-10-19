import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("ResourceLink")
@MainActor
struct ResourceLinkTests {
    private func look(_ variant: NResourceLinkVariant) -> NResourceLinkLook {
        NResourceLinkLook(icon: .book, title: "Docs", description: "", variant: variant)
    }

    @Test("a plain link is never shorter than its minimum height; a card has none")
    func minimum() {
        #expect(look(.plain).height(words: 10) == GMResourceLinkTokens.minHeight)
        #expect(look(.card).height(words: 16) < GMResourceLinkTokens.minHeight)
    }

    @Test("tall words grow the link past its minimum by their height and the padding")
    func grows() {
        let link = look(.plain)
        #expect(abs(link.height(words: 60) - (60 + 2 * GMResourceLinkTokens.paddingY)) < 1e-9)
    }

    @Test("the words start after the padding, the icon and the gap, and a card's border")
    func wordsLeft() {
        let icon = NIconSize.xlarge.points
        let plain = GMResourceLinkTokens.paddingX + icon + GMResourceLinkTokens.gap
        let card = 1 + GMResourceLinkTokens.cardPaddingX + icon + GMResourceLinkTokens.cardGap
        #expect(abs(look(.plain).wordsLeft - plain) < 1e-9)
        #expect(abs(look(.card).wordsLeft - card) < 1e-9)
    }
}
