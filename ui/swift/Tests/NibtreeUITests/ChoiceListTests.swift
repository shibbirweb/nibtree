import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// ChoiceList.svelte's cards: their heights and where a click lands.
@Suite("ChoiceList")
@MainActor
struct ChoiceListTests {
    @Test("a card is its padding, border and label, plus the gap and description when it has one")
    func heights() {
        let look = NChoiceListLook(labels: ["Apply", "Drop"], descriptions: ["Keep it.", nil], dangers: [false, true])
        let heights = look.heights(width: 300)
        let line: CGFloat = look.labels[0].line.height
        let frame: CGFloat = 2 * (GMChoiceListTokens.paddingY + NChoiceListLook.border)
        #expect(heights[1] == line + frame)
        let withDescription: CGFloat = line + GMChoiceListTokens.lineGap + (look.descriptions[0]?.line.height ?? 0)
            + frame
        #expect(heights[0] == withDescription)
    }

    @Test("a long description wraps and its card grows")
    func wraps() {
        let text = String(repeating: "Apply it, then drop it from the list. ", count: 4)
        let look = NChoiceListLook(labels: ["Pop"], descriptions: [text], dangers: [false])
        #expect(look.heights(width: 200)[0] > look.heights(width: 2000)[0])
    }

    @Test("a click picks the card under it; the gap between cards picks none")
    func hit() {
        let placed = NChoiceListPlaced()
        placed.tops = [0, 58]
        placed.heights = [52, 52]
        #expect(placed.index(at: 10) == 0)
        #expect(placed.index(at: 55) == nil)
        #expect(placed.index(at: 60) == 1)
    }
}
