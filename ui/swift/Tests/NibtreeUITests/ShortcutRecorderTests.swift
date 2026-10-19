import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// ShortcutRecorder.svelte's three looks: keys, None, and recording.
@Suite("ShortcutRecorder")
@MainActor
struct ShortcutRecorderTests {
    @Test("keys show in a cap; no keys show a dim None")
    func resting() {
        let keys = NShortcutRecorderLook(keys: "Cmd+K", pending: nil, recording: false)
        #expect(keys.words == nil)
        let none = NShortcutRecorderLook(keys: "", pending: nil, recording: false)
        #expect(none.words?.text == "None")
        #expect(none.words?.tone == .textDim)
    }

    @Test("recording asks for keys, then shows what was pressed")
    func recording() {
        #expect(NShortcutRecorderLook(keys: "Cmd+K", pending: nil, recording: true).words?.text == "Press keys")
        #expect(NShortcutRecorderLook(keys: "Cmd+K", pending: "Cmd+J", recording: true).words?.text == "Cmd+J")
    }

    @Test("the field is at least the token height; the cap is its line, padding and borders")
    func heights() {
        let look = NShortcutRecorderLook(keys: "Cmd+K", pending: nil, recording: false)
        #expect(look.height >= GMShortcutRecorderTokens.minHeight)
        let cap: CGFloat = look.keys.line.height + 2 + 1 + GMBorderWidth.thick
        #expect(look.capHeight == cap)
    }
}
