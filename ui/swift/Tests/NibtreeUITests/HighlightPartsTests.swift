import Testing

@testable import NibtreeUI

/// The same cases as ui/web `logic/highlight.test.ts`.
@Suite("HighlightParts")
struct HighlightPartsTests {
    @Test("cuts text into plain and matched parts")
    func parts() {
        #expect(
            NHighlightParts.parts("cart.ts", ranges: [0..<2]) == [
                .init(text: "ca", match: true), .init(text: "rt.ts", match: false),
            ])
    }

    @Test("merges overlapping and unsorted ranges, clipped to the text")
    func merged() {
        #expect(NHighlightParts.merged([4..<6, 0..<2, 1..<3, 5..<99], length: 7) == [0..<3, 4..<7])
        #expect(NHighlightParts.merged([-5..<0, 3..<3], length: 7) == [])
    }

    @Test("keeps plain text whole without matches")
    func plain() {
        #expect(NHighlightParts.parts("main", ranges: []) == [.init(text: "main", match: false)])
        #expect(NHighlightParts.parts("", ranges: []) == [.init(text: "", match: false)])
    }

    @Test("counts UTF-16 units like the web's string indices")
    func utf16() {
        #expect(
            NHighlightParts.parts("a😀b", ranges: [1..<3]) == [
                .init(text: "a", match: false), .init(text: "😀", match: true), .init(text: "b", match: false),
            ])
    }
}
