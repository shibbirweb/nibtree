import AppKit
import CoreText
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// The text engine follows WebKit's numbers (measured in WebKit for the same font, size and line height).
@Suite("Text engine")
@MainActor
struct TextEngineTests {
    private let body = NTypography.FontKey(GMTextStyles.body)
    private let hint = NTypography.FontKey(GMTextStyles.hint)

    @Test("normal line height is the rounded ascent plus the rounded descent")
    func normalLineBox() {
        let line = NTextMetrics.lineBox(body, lineHeight: nil)
        #expect(line.height == 16)
        #expect(abs(line.baseline - 12.906) < 0.02)
    }

    @Test("a line height is the size times it, in WebKit's 1/64 point steps, the baseline centered")
    func setLineBox() {
        let line = NTextMetrics.lineBox(hint, lineHeight: 1.45)
        #expect(line.height == 17.390625)
        #expect(abs(line.baseline - 13.219) < 0.02)
    }

    @Test("the system font is made at the CSS weight, so letters are as wide as in WebKit")
    func cssWeight() {
        let semibold = NTypography.nsFont(NTypography.FontKey(GMTextStyles.body, weight: .semibold))
        let variation = CTFontCopyVariation(semibold as CTFont) as? [NSNumber: Any]
        #expect((variation?[NSNumber(value: 0x7767_6874)] as? Double) == 600)
    }

    @Test("text wider than the width wraps onto more lines; a text offered its own width stays on one")
    func wrapping() {
        let text = "A sentence long enough to wrap onto a second and a third line"
        let one = NTextEngine.layout(text, font: body, kerning: 0, tabular: false, truncate: false, width: nil)
        #expect(one.lines.count == 1)
        let fitted = NTextEngine.layout(text, font: body, kerning: 0, tabular: false, truncate: false, width: one.width)
        #expect(fitted.lines.count == 1)
        let wrapped = NTextEngine.layout(text, font: body, kerning: 0, tabular: false, truncate: false, width: 180)
        #expect(wrapped.lines.count == 3)
        #expect(wrapped.width <= 180)
    }

    @Test("truncated text stays on one line within the width")
    func truncation() {
        let text = "src/lib/views/a/very/long/path/file.ts"
        let cut = NTextEngine.layout(text, font: body, kerning: 0, tabular: false, truncate: true, width: 120)
        #expect(cut.lines.count == 1)
        #expect(cut.width <= 120)
    }
}
