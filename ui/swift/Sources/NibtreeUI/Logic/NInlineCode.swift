import Foundation

/// Plain text with `backtick` code words, split into parts so a component can draw the code words in the mono font
/// (a setting's hint such as "Add `--signoff` to every commit"): the Swift side of ui/web `logic/inlineCode.ts`.
public enum NInlineCode {
    public struct Part: Equatable, Sendable {
        public let text: String
        public let code: Bool
    }

    public static func parts(_ text: String) -> [Part] {
        let pieces = text.components(separatedBy: "`")
        // An odd number of backticks leaves the last one as plain text.
        let closed = pieces.count % 2 == 1 ? pieces.count : pieces.count - 1
        return pieces.enumerated().compactMap { index, piece in
            let value = index >= closed ? "`" + piece : piece
            return value.isEmpty ? nil : Part(text: value, code: index % 2 == 1 && index < closed)
        }
    }
}
