import Foundation

/// Text cut into plain and matched parts, from match ranges [start, end) in UTF-16 units like the web's string
/// indices (quick open, search results): the Swift side of ui/web `logic/highlight.ts`. Ranges may overlap or come
/// unsorted; they are merged and clipped to the text.
public enum NHighlightParts {
    public struct Part: Equatable, Sendable {
        public let text: String
        public let match: Bool
    }

    public static func merged(_ ranges: [Range<Int>], length: Int) -> [Range<Int>] {
        let clipped = ranges
            .map { max(0, $0.lowerBound)..<max(max(0, $0.lowerBound), min(length, $0.upperBound)) }
            .filter { !$0.isEmpty }
            .sorted { $0.lowerBound < $1.lowerBound }
        var merged: [Range<Int>] = []
        for range in clipped {
            if let last = merged.last, range.lowerBound <= last.upperBound {
                merged[merged.count - 1] = last.lowerBound..<max(last.upperBound, range.upperBound)
            } else {
                merged.append(range)
            }
        }
        return merged
    }

    public static func parts(_ text: String, ranges: [Range<Int>]) -> [Part] {
        let units = text as NSString
        var parts: [Part] = []
        var at = 0
        for range in merged(ranges, length: units.length) {
            if range.lowerBound > at {
                let plain = NSRange(location: at, length: range.lowerBound - at)
                parts.append(Part(text: units.substring(with: plain), match: false))
            }
            parts.append(Part(text: units.substring(with: NSRange(range)), match: true))
            at = range.upperBound
        }
        if at < units.length || parts.isEmpty {
            parts.append(Part(text: units.substring(from: at), match: false))
        }
        return parts
    }
}
