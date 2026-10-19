import NibtreeTokens
import SwiftUI

/// Everything a toggle button draws, worked out once from its props as ToggleButton.svelte's classes do.
struct NToggleButtonLook: Sendable {
    /// ToggleButton.svelte's `opacity: 0.4` while disabled.
    nonisolated static let disabledOpacity = 0.4
    /// An on `outline`'s `color-mix(in srgb, var(--accent) 15%, transparent)`.
    nonisolated static let outlineShare = 0.15
    /// An on `filter`'s border, 55% accent over the strong border, and its background, 12% accent over the panel.
    nonisolated static let filterBorderShare = 0.55
    nonisolated static let filterFillShare = 0.12

    let variant: NToggleButtonVariant
    let pressed: Bool
    let icon: GMIconName?
    let words: NTextSpec

    @MainActor
    init(variant: NToggleButtonVariant, pressed: Bool, icon: GMIconName?, text: String) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        words = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.variant = variant
        self.pressed = pressed
        self.icon = icon
    }

    var border: CGFloat {
        switch variant {
        case .outline, .chip, .filter: 1
        case .plain, .tool: 0
        }
    }

    var radius: CGFloat { variant == .tool || variant == .chip ? GMRadius.small : GMRadius.control }

    var gap: CGFloat {
        switch variant {
        case .plain: GMToggleButtonTokens.plainGap
        case .outline, .filter: GMToggleButtonTokens.outlineGap
        case .chip: GMToggleButtonTokens.chipGap
        case .tool: 0
        }
    }

    var paddingX: CGFloat {
        switch variant {
        case .plain: words.text.isEmpty ? GMToggleButtonTokens.iconPaddingX : GMToggleButtonTokens.plainPaddingX
        case .outline: GMToggleButtonTokens.outlinePaddingX
        case .chip: GMToggleButtonTokens.chipPaddingX
        case .filter: GMToggleButtonTokens.filterPaddingX
        case .tool: 0
        }
    }

    /// The content's parts left to right: the chip's check, the icon, the words.
    @MainActor
    var parts: [(kind: Part, width: CGFloat)] {
        var parts: [(Part, CGFloat)] = []
        if variant == .chip && pressed {
            parts.append((.check, NIconSize.compact.points))
        }
        if icon != nil {
            parts.append((.icon, NIconSize.medium.points))
        }
        if !words.text.isEmpty {
            let layout = words.state.layout ?? words.layout(width: nil)
            words.state.layout = layout
            parts.append((.words, layout.width))
        }
        return parts
    }

    enum Part {
        case check, icon, words
    }

    @MainActor
    var size: CGSize {
        let parts = parts
        let content = parts.reduce(0) { $0 + $1.width } + CGFloat(max(0, parts.count - 1)) * gap
        switch variant {
        case .tool: return CGSize(width: GMToggleButtonTokens.toolWidth, height: GMToggleButtonTokens.toolHeight)
        case .plain: return CGSize(width: content + 2 * paddingX, height: GMToggleButtonTokens.plainHeight)
        case .outline:
            return CGSize(width: content + 2 * (paddingX + border), height: GMToggleButtonTokens.outlineHeight)
        case .filter:
            return CGSize(width: content + 2 * (paddingX + border), height: GMToggleButtonTokens.filterHeight)
        case .chip:
            let tallest = max(
                words.text.isEmpty ? 0 : words.line.height, icon == nil ? 0 : NIconSize.medium.points,
                pressed ? NIconSize.compact.points : 0)
            return CGSize(
                width: content + 2 * (paddingX + border),
                height: tallest + 2 * (GMToggleButtonTokens.chipPaddingY + border))
        }
    }

    /// The background, border and content colors. The hover rules (`:hover:not(:disabled)`) outrank `.active`, so a
    /// pointed-at button takes the hover background even when on.
    func colors(hovering: Bool, palette: Palette) -> (fill: CGColor?, edge: CGColor?, text: CGColor) {
        let accent = palette.cgColor(.accent)
        let (text, dim, hover) = (palette.cgColor(.text), palette.cgColor(.textDim), palette.cgColor(.hover))
        switch variant {
        case .plain:
            let fill = hovering ? hover : pressed ? palette.cgColor(.selectedInactive) : nil
            return (fill, nil, pressed ? text : dim)
        case .outline:
            if pressed {
                return (accent.copy(alpha: accent.alpha * Self.outlineShare), accent, accent)
            }
            return (nil, palette.cgColor(.borderStrong), text)
        case .tool:
            let fill = hovering ? hover : pressed ? palette.cgColor(.selectedInactive) : nil
            return (fill, nil, hovering || pressed ? text : dim)
        case .chip:
            let fill = hovering ? palette.cgColor(.selected) : nil
            return pressed ? (fill, accent, accent) : (fill, nil, dim)
        case .filter:
            let strong = palette.cgColor(.borderStrong)
            let panel = palette.cgColor(.panel)
            let on = NAvatarFace.mix(accent, panel, share: Self.filterFillShare)
            let edge = pressed ? NAvatarFace.mix(accent, strong, share: Self.filterBorderShare) : strong
            return (hovering ? hover : pressed ? on : panel, edge, pressed ? text : dim)
        }
    }
}
