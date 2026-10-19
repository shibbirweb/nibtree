import NibtreeTokens
import SwiftUI

/// Everything a file row draws, worked out once from its props as FileRow.svelte's classes do, and where each part
/// goes in a row of a given width (CSS flex: the words take what the others leave).
struct NFileRowLook: Sendable {
    /// The `.actions` span's `gap: 1px` between the row's buttons.
    nonisolated static let actionsGap = 1.0
    /// The tag's `1px solid` border.
    nonisolated static let tagBorder = 1.0

    let kind: NStatusLetter.Kind?
    let letter: NTextSpec
    let name: NTextSpec
    let directory: NTextSpec?
    let note: NTextSpec?
    let tag: NTextSpec?
    let icon: NFileIconView?
    let checked: Bool?
    let selected: Bool
    let deleted: Bool
    let list: Bool
    let paddingLeft: CGFloat

    @MainActor
    init(
        kind: NStatusLetter.Kind?, name: String, directory: String, note: String, badge: String, icon: NFileIconView?,
        selected: Bool, nested: Bool, variant: NFileRowVariant, checked: Bool?
    ) {
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken, line: NLineBox?) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: true,
                line: line ?? NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        list = variant == .list
        let letterFont = NTypography.FontKey(
            GMTextStyles.body, size: GMFontSize.compact, weight: list ? GMFontWeight.semibold : GMFontWeight.bold,
            mono: true)
        letter = spec(kind?.letter ?? "!", letterFont, .text, nil)
        deleted = kind == .deleted
        self.name = spec(name, NTypography.FontKey(GMTextStyles.body), deleted ? .textDim : .text, nil)
        let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        self.directory = directory.isEmpty ? nil : spec(directory, small, .textDim, nil)
        self.note = note.isEmpty ? nil : spec("(\(note))", small, .textDim, nil)
        let tagFont = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.tiny, weight: GMFontWeight.semibold)
        let tagLine = NTextMetrics.lineBox(tagFont, lineHeight: GMFileRowTokens.tagLineHeight / GMFontSize.tiny)
        tag = badge.isEmpty ? nil : spec(badge, tagFont, .textDim, tagLine)
        self.kind = kind
        self.icon = icon
        self.checked = checked
        self.selected = selected
        paddingLeft = list
            ? GMFileRowTokens.listPaddingX : nested ? GMFileRowTokens.nestedPaddingLeft : GMFileRowTokens.paddingLeft
    }

    var gap: CGFloat { list ? GMSpace.s4 : GMFileRowTokens.gap }
    var paddingRight: CGFloat { list ? GMFileRowTokens.listPaddingX : GMFileRowTokens.paddingRight }
    /// The room before a folder or note: the space the template's line break leaves between the spans (in the name's
    /// font), and the margin, wider in a plain list.
    @MainActor
    var directoryMargin: CGFloat {
        NTextMetrics.width(of: " ", font: name.font, kerning: 0) + (list ? GMSpace.s4 : GMSpace.s3)
    }

    @MainActor
    func width(_ spec: NTextSpec?) -> CGFloat {
        spec.map { NTextMetrics.width(of: $0.text, font: $0.font, kerning: 0) } ?? 0
    }

    @MainActor
    var tagWidth: CGFloat? { tag.map { width($0) + 2 * (GMFileRowTokens.tagPaddingX + Self.tagBorder) } }

    /// Where the parts of a row go.
    struct Parts {
        var checkbox: CGFloat?
        var letter: CGFloat = 0
        var icon: CGFloat?
        var text: CGFloat = 0
        var textWidth: CGFloat = 0
        var tag: CGFloat?
        var actions: CGFloat?
    }

    /// The row's parts in `rowWidth`, with actions `actions` wide when they show.
    @MainActor
    func parts(width rowWidth: CGFloat, actions: CGFloat?) -> Parts {
        var parts = Parts()
        var x = paddingLeft
        if checked != nil {
            parts.checkbox = x
            x += NCheckboxBox.side + gap
        }
        parts.letter = x
        x += GMFileRowTokens.letterWidth + gap
        if icon != nil {
            parts.icon = x
            x += NIconSize.normal.points + gap
        }
        let tail = [tagWidth, actions].compactMap { $0 }.reduce(0) { $0 + gap + $1 }
        parts.text = x
        parts.textWidth = max(0, rowWidth - paddingRight - x - tail)
        x += parts.textWidth
        if let tagWidth {
            parts.tag = x + gap
            x += gap + tagWidth
        }
        if actions != nil {
            parts.actions = x + gap
        }
        return parts
    }

    /// The name, folder and note on one line: the words' natural width.
    @MainActor
    var textNatural: CGFloat {
        width(name) + [directory, note].compactMap { $0 }.reduce(0) { $0 + directoryMargin + width($1) }
    }
}

/// Where the layout put a file row and how wide its shown actions are.
final class NFileRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var actions: CGFloat?
}
