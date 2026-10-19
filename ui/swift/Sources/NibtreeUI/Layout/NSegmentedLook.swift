import NibtreeTokens
import SwiftUI

/// Everything a segmented control draws, worked out once from its props as Segmented.svelte's classes do.
struct NSegmentedLook: Sendable {
    /// A segment's words, icon and whether it can be chosen.
    struct Segment: Sendable {
        let words: NTextSpec?
        let icon: GMIconName?
        let disabled: Bool
    }

    /// Segmented.svelte's `opacity: 0.5` on a disabled segment, and the small look's chosen shadow:
    /// `0 1px 2px color-mix(in srgb, var(--text) 18%, transparent)`.
    nonisolated static let disabledOpacity = 0.5
    nonisolated static let smallShadowShare = 0.18

    let size: NSegmentedSize
    let variant: NSegmentedVariant
    let segments: [Segment]
    let chosen: Int?
    let line: NLineBox
    let keeper = NSegmentedPlaced()

    @MainActor
    init(
        labels: [String?], icons: [GMIconName?], disabled: [Bool], chosen: Int?, size: NSegmentedSize,
        variant: NSegmentedVariant
    ) {
        let split = variant == .split
        let font = NTypography.FontKey(GMTextStyles.body, size: split ? GMFontSize.small : nil)
        let bold = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small, weight: GMFontWeight.semibold)
        line = NTextMetrics.lineBox(font, lineHeight: nil)
        segments = labels.indices.map { index in
            let words = labels[index].map { text in
                // A split control's chosen part is bold.
                let shown = split && index == chosen ? bold : font
                return NTextSpec(
                    text: text, font: shown, kerning: 0, tabular: false, truncate: false,
                    line: NTextMetrics.lineBox(shown, lineHeight: nil), tone: .text, strike: false)
            }
            return Segment(words: words, icon: icons[index], disabled: disabled[index])
        }
        self.chosen = chosen
        self.size = size
        self.variant = variant
    }

    var small: Bool { size == .small }
    var boxPadding: CGFloat {
        variant != .pill ? 0 : small ? GMSegmentedTokens.smallPadding : GMSegmentedTokens.padding
    }
    var iconSize: NIconSize { small ? .medium : .normal }
    /// The 1 point line between two joined or split segments.
    var separator: CGFloat { variant == .pill ? 0 : 1 }

    var paddingX: CGFloat {
        switch variant {
        case .pill: small ? 0 : GMSegmentedTokens.segmentPaddingX
        case .joined: GMSegmentedTokens.joinedPaddingX
        case .split: GMSegmentedTokens.splitPaddingX
        }
    }

    var paddingY: CGFloat {
        switch variant {
        case .pill: small ? 0 : GMSegmentedTokens.segmentPaddingY
        case .joined: 0
        case .split: GMSegmentedTokens.splitPaddingY
        }
    }

    /// A segment's content: the icon, the gap when both show, the words.
    @MainActor
    func content(_ segment: Segment) -> CGFloat {
        let words = segment.words.map { spec -> CGFloat in
            let layout = spec.state.layout ?? spec.layout(width: nil)
            spec.state.layout = layout
            return layout.width
        }
        let icon = segment.icon == nil ? 0 : iconSize.points
        let gap = segment.icon != nil && words != nil ? GMSegmentedTokens.iconGap : 0
        return icon + gap + (words ?? 0)
    }

    @MainActor
    func naturalWidth(_ segment: Segment) -> CGFloat {
        small && variant == .pill ? GMSegmentedTokens.smallSegmentWidth : content(segment) + 2 * paddingX
    }

    var segmentHeight: CGFloat {
        if variant == .joined {
            return GMSegmentedTokens.joinedHeight - 2
        }
        if small && variant == .pill {
            return GMSegmentedTokens.smallSegmentHeight
        }
        let tallest = segments.map { segment in
            max(segment.words == nil ? 0 : line.height, segment.icon == nil ? 0 : iconSize.points)
        }.max() ?? line.height
        return tallest + 2 * paddingY
    }

    /// The control's own width: its segments, the lines between them, padding and border.
    @MainActor
    var naturalWidth: CGFloat {
        let segments = segments.map(naturalWidth).reduce(0, +)
        return segments + CGFloat(max(0, self.segments.count - 1)) * separator + 2 * (boxPadding + 1)
    }

    var height: CGFloat { segmentHeight + 2 * (boxPadding + 1) }

    /// Each segment's left edge and width in a control `width` wide: their own widths, or equal parts for `split`.
    @MainActor
    func frames(width: CGFloat) -> [(x: CGFloat, width: CGFloat)] {
        let inside = 1 + boxPadding
        var x = inside
        let lines = CGFloat(max(0, segments.count - 1)) * separator
        let equal = (width - 2 * inside - lines) / CGFloat(max(1, segments.count))
        return segments.map { segment in
            let width = variant == .split ? equal : naturalWidth(segment)
            defer { x += width + separator }
            return (x, width)
        }
    }
}
