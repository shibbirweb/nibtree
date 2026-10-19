import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("TextArea")
@MainActor
struct TextAreaTests {
    private func look(rows: NTextAreaRows = .normal, height: NTextAreaHeight = .rows) -> NTextAreaLook {
        NTextAreaLook(
            rows: rows, height: height, resize: .none, invalid: false, mono: false, placeholder: "", disabled: false)
    }

    @Test("rows set the height as WebKit does: the lines, padding and border")
    func rowsHeight() {
        let small = look(rows: .small)
        #expect(small.boxHeight == 2 * small.line.height + 2 * (GMInputTokens.paddingY + 1))
        #expect(look(rows: .xlarge).boxHeight > look(rows: .large).boxHeight)
    }

    @Test("a set height wins over the rows")
    func setHeight() {
        #expect(look(rows: .xlarge, height: .short).boxHeight == GMTextAreaTokens.shortHeight)
        #expect(look(height: .tall).boxHeight == GMTextAreaTokens.tallHeight)
    }

    @Test("each paragraph wraps on its own and an empty one keeps its line")
    func paragraphs() {
        let lines = look().lines("Title\n\nBody", width: 300)
        #expect(lines.count == 3)
        #expect(look().lines("one two three four five six seven", width: 40).count > 1)
    }
}
