import NibtreeTokens
import SwiftUI

/// Everything a setting row draws, from SettingRow.svelte's classes: the title (a search's matches tinted) and the hint
/// (its `backtick` words mono), each wrapped to the label's width.
struct NSettingRowLook: Sendable {
    /// HighlightText's `search` tint: `color-mix(in srgb, var(--warning) 40%, transparent)`.
    nonisolated static let matchShare = 0.4

    let title: NSAttributedStringKeeper
    let hint: NSAttributedStringKeeper?
    let titleLine: NLineBox
    let hintLine: NLineBox
    let stacked: Bool
    let nested: Bool
    let plain: Bool
    let placed = NSettingRowPlaced()

    @MainActor
    init(title: String, matches: [Range<Int>], hint: String, stacked: Bool, nested: Bool, plain: Bool) {
        let titleFont = NTypography.FontKey(
            GMTextStyles.body, weight: plain ? GMFontWeight.regular : GMFontWeight.medium)
        let built = NSMutableAttributedString()
        for part in NHighlightParts.parts(title, ranges: matches) {
            let run = NSMutableAttributedString(
                attributedString: NTextEngine.attributed(
                    part.text, font: NTypography.nsFont(titleFont), kerning: 0, tabular: false))
            if part.match {
                run.addAttribute(NHighlightLook.matchKey, value: true, range: NSRange(location: 0, length: run.length))
            }
            built.append(run)
        }
        self.title = NSAttributedStringKeeper(value: built)
        titleLine = NTextMetrics.lineBox(titleFont, lineHeight: nil)
        let hintFont = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        let code = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.xsmall, mono: true)
        hintLine = NTextMetrics.lineBox(hintFont, lineHeight: GMLineHeight.normal)
        if hint.isEmpty {
            self.hint = nil
        } else {
            let words = NSMutableAttributedString()
            for part in NInlineCode.parts(hint) {
                let font = NTypography.nsFont(part.code ? code : hintFont)
                words.append(NTextEngine.attributed(part.text, font: font, kerning: 0, tabular: false))
            }
            self.hint = NSAttributedStringKeeper(value: words)
        }
        self.stacked = stacked
        self.nested = nested
        self.plain = plain
    }

    /// `string` wrapped to `width` (nil for one line) like CSS: Core Text's breaks.
    static func lines(_ string: NSAttributedString, width: CGFloat?) -> [CTLine] {
        let full = CTLineCreateWithAttributedString(string)
        guard let width, CGFloat(CTLineGetTypographicBounds(full, nil, nil, nil)) > width + 0.01 else {
            return [full]
        }
        let typesetter = CTTypesetterCreateWithAttributedString(string)
        var lines: [CTLine] = []
        var start = 0
        while start < string.length {
            let count = max(1, CTTypesetterSuggestLineBreak(typesetter, start, Double(width)))
            lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: start, length: count)))
            start += count
        }
        return lines
    }

    /// The label's lines in `width`, and its size; kept per width, as a layout asks for the same ones several times.
    func label(width: CGFloat?) -> (title: [CTLine], hint: [CTLine], size: CGSize) {
        let key = width.map { ($0 * 64).rounded() / 64 } ?? -1
        if let kept = placed.labels[key] {
            return kept
        }
        let made = makeLabel(width: width)
        placed.labels[key] = made
        return made
    }

    private func makeLabel(width: CGFloat?) -> (title: [CTLine], hint: [CTLine], size: CGSize) {
        let title = Self.lines(self.title.value, width: width)
        let hint = self.hint.map { Self.lines($0.value, width: width) } ?? []
        let widest = (title + hint).map { CGFloat(CTLineGetTypographicBounds($0, nil, nil, nil)) }.max() ?? 0
        var height = CGFloat(title.count) * titleLine.height
        if !hint.isEmpty {
            height += GMSettingRowTokens.labelGap + CGFloat(hint.count) * hintLine.height
        }
        return (title, hint, CGSize(width: widest, height: height))
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        if !plain {
            cg.setFillColor(palette.cgColor(.border))
            cg.fill(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1))
        }
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        cg.translateBy(x: origin.x - pixel(origin.x) + placed.label.x, y: origin.y - pixel(origin.y) + placed.label.y)
        let warning = palette.cgColor(.warning)
        let tint = warning.copy(alpha: warning.alpha * Self.matchShare) ?? warning
        for (index, line) in placed.title.enumerated() {
            let baseline = ((CGFloat(index) * titleLine.height + titleLine.baseline) * scale).rounded() / scale
            for run in CTLineGetGlyphRuns(line) as? [CTRun] ?? [] {
                guard (CTRunGetAttributes(run) as NSDictionary)[NHighlightLook.matchKey] != nil else {
                    continue
                }
                let range = CTRunGetStringRange(run)
                let start = CTLineGetOffsetForStringIndex(line, range.location, nil)
                let end = CTLineGetOffsetForStringIndex(line, range.location + range.length, nil)
                var ascent: CGFloat = 0
                var descent: CGFloat = 0
                _ = CTRunGetTypographicBounds(run, CFRange(location: 0, length: 0), &ascent, &descent, nil)
                cg.setFillColor(tint)
                cg.fill(CGRect(x: start, y: baseline - ascent, width: end - start, height: ascent + descent))
            }
        }
        NTextEngine.draw(
            NTextEngine.Layout(lines: placed.title, width: 0), line: titleLine, color: palette.cgColor(.text),
            strike: nil, scale: scale, in: cg)
        guard !placed.hint.isEmpty else {
            return
        }
        cg.translateBy(x: 0, y: CGFloat(placed.title.count) * titleLine.height + GMSettingRowTokens.labelGap)
        NTextEngine.draw(
            NTextEngine.Layout(lines: placed.hint, width: 0), line: hintLine, color: palette.cgColor(.textDim),
            strike: nil, scale: scale, in: cg)
    }
}

/// An attributed string that may cross into a canvas's drawing; it is never changed once built.
struct NSAttributedStringKeeper: @unchecked Sendable {
    let value: NSAttributedString
}

/// Where the label went and its lines, set by the layout.
final class NSettingRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var label = CGPoint.zero
    var title: [CTLine] = []
    var hint: [CTLine] = []
    var labels: [CGFloat: (title: [CTLine], hint: [CTLine], size: CGSize)] = [:]
}
