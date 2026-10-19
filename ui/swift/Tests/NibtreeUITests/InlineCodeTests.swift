import Testing

@testable import NibtreeUI

/// The same cases as ui/web `logic/inlineCode.test.ts`.
@Suite("InlineCode")
struct InlineCodeTests {
    @Test("splits code words out of the text")
    func splits() {
        #expect(
            NInlineCode.parts("Add `--signoff` to `git commit`.") == [
                .init(text: "Add ", code: false), .init(text: "--signoff", code: true),
                .init(text: " to ", code: false), .init(text: "git commit", code: true), .init(text: ".", code: false),
            ])
    }

    @Test("keeps text without backticks whole")
    func plain() {
        #expect(NInlineCode.parts("Plain words.") == [.init(text: "Plain words.", code: false)])
    }

    @Test("leaves a lone backtick as text")
    func lone() {
        #expect(
            NInlineCode.parts("a `b` c ` d") == [
                .init(text: "a ", code: false), .init(text: "b", code: true), .init(text: " c ", code: false),
                .init(text: "` d", code: false),
            ])
    }

    @Test("returns nothing for empty text")
    func empty() {
        #expect(NInlineCode.parts("").isEmpty)
    }
}
