import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// LoadingOverlay.svelte's card: its width and the column of title, step and hint.
@Suite("LoadingOverlay")
@MainActor
struct LoadingOverlayTests {
    @Test("the card keeps the token width, and the side room on a narrow window")
    func width() {
        #expect(NLoadingOverlayTexts.cardWidth(room: 1000) == GMLoadingOverlayTokens.width)
        let narrow: CGFloat = 300 - 2 * GMSpace.s8
        #expect(NLoadingOverlayTexts.cardWidth(room: 300) == narrow)
        #expect(NLoadingOverlayTexts.cardWidth(room: 10) == 0)
    }

    @Test("a title alone is the column; the step and the hint follow with their gaps")
    func column() {
        let alone = NLoadingOverlayTexts(title: "Opening", step: "", hint: "")
        let title = alone.measure(width: 300).height
        #expect(title == alone.title.line.height)
        let all = NLoadingOverlayTexts(title: "Opening", step: "Scanning", hint: "Wait")
        let parts = all.measure(width: 300)
        let stepTop: CGFloat = title + GMLoadingOverlayTokens.textGap
        #expect(parts.step == stepTop)
        let hintTop: CGFloat = stepTop + (all.step?.line.height ?? 0) + GMLoadingOverlayTokens.textGap + GMSpace.s3
        #expect(parts.hint == hintTop)
        let height: CGFloat = hintTop + (all.hint?.line.height ?? 0)
        #expect(parts.height == height)
    }

    @Test("a long hint wraps to more lines in a narrow column")
    func wraps() {
        let hint = String(repeating: "Big folders take a while. ", count: 4)
        let texts = NLoadingOverlayTexts(title: "Opening", step: "", hint: hint)
        let wide = texts.measure(width: 2000).height
        let narrow: CGFloat = texts.measure(width: 200).height
        #expect(narrow > wide)
    }

    @Test("VoiceOver reads the title, the step and the hint that are set")
    func spoken() {
        #expect(NLoadingOverlayTexts(title: "Opening", step: "", hint: "Wait").spoken == "Opening, Wait")
    }
}
