import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("DescriptionList")
@MainActor
struct DescriptionListTests {
    private let look = NDescriptionLook(items: [
        NDescriptionItem(label: "Author", value: "Ada Lovelace"),
        NDescriptionItem(label: "Id", value: "0123456789abcdef0123456789abcdef", mono: true),
    ])

    @Test("the labels' column is as wide as the widest label, like a grid's auto column")
    func labelColumn() {
        let measured = look.measure(width: nil)
        #expect(measured.label == look.labels[0].layout(width: nil).width)
    }

    @Test("a value too long for the rest of the row wraps, and its row grows by its lines")
    func wraps() {
        let measured = look.measure(width: 160)
        let room = 160 - measured.label - GMDescriptionListTokens.columnGap
        #expect(measured.values[1].lines.count > 1)
        #expect(measured.values[1].width <= room + 0.01)
        #expect(measured.rows[1] == CGFloat(measured.values[1].lines.count) * look.values[1].line.height)
    }

    @Test("a row is as tall as the taller of its label and value")
    func rowHeight() {
        let measured = look.measure(width: nil)
        #expect(measured.rows[0] == max(look.labels[0].line.height, look.values[0].line.height))
    }
}
