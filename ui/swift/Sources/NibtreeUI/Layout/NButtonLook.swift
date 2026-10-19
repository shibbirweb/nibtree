import NibtreeTokens
import SwiftUI

/// Everything a button draws, worked out once from its props as Button.svelte's classes do: its height, side padding,
/// border, colors, glyphs and texts. `NIconButton` makes one too (NIconButtonLook.swift), with its own sizes and tones.
struct NButtonLook: Sendable {
    struct Colors: Sendable {
        let background: GMColorToken?
        let border: GMColorToken?
        let text: GMColorToken
        /// The background under the pointer, or none (a link's).
        let hover: GMColorToken?
        /// The words and glyphs under the pointer, when they change (a dim icon button brightens).
        var hoverText: GMColorToken?
        var pressedBackground = GMColorToken.selected
    }

    /// Button.svelte's `opacity: 0.5` while disabled.
    nonisolated static let disabledOpacity = 0.5
    /// Button.svelte's `1px solid` border.
    nonisolated static let cssBorder = 1.0

    var words: NTextSpec
    var count: NTextSpec?
    var icon: GMIconName?
    var iconSize: NIconSize
    var layout: NLayoutIcon.Kind?
    var layoutActive: Bool
    var trailingIcon: GMIconName?
    var spinning: Bool
    var pressed: Bool
    var fill: Bool
    var labelled: Bool
    var colors: Colors
    var height: CGFloat
    var paddingX: CGFloat
    var border: CGFloat
    /// A tiny icon-only button is a fixed square with its icon centered.
    var fixedWidth: CGFloat?
    var maxWidth: CGFloat
    var minWidth: CGFloat = 0
    var radius = GMButtonTokens.radius
    var gap = GMButtonTokens.gap
    /// Content in the middle of the button, as an icon button's `justify-content: center`.
    var centered = false
    var disabledOpacity = NButtonLook.disabledOpacity
    /// The count is in the button's color (an icon button's) rather than dim (a button's).
    var countFollowsText = false
    /// A label view after the count (an icon button's children), not in the words' place.
    var labelLast = false
    /// The words underlined under the pointer, as a link's.
    var underlineOnHover = false
    /// Where the layout put the content, for the canvas: a label view's width is known only there.
    let placed = NButtonPlaced()

    @MainActor
    static func spec(
        _ text: String, _ font: NTypography.FontKey, tone: GMColorToken, tabular: Bool = false
    ) -> NTextSpec {
        NTextSpec(
            text: text, font: font, kerning: 0, tabular: tabular, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
    }

    private static func colors(_ variant: String) -> Colors {
        switch variant {
        case "primary": Colors(background: .accent, border: .accent, text: .accentText, hover: .accentHover)
        case "danger": Colors(background: .panel, border: .borderStrong, text: .danger, hover: .hover)
        case "danger-primary": Colors(background: .danger, border: .danger, text: .accentText, hover: .danger)
        case "ghost": Colors(background: nil, border: nil, text: .text, hover: .hover)
        case "accent": Colors(background: .panel, border: .accent, text: .accent, hover: .hover)
        default: Colors(background: .panel, border: .borderStrong, text: .text, hover: .hover)
        }
    }

    var leadPoints: CGFloat? {
        layout != nil || icon != nil ? iconSize.points : nil
    }

    /// The words' or count's lines, laid out once.
    @MainActor
    static func lines(_ spec: NTextSpec) -> NTextEngine.Layout {
        let layout = spec.state.layout ?? spec.layout(width: nil)
        spec.state.layout = layout
        return layout
    }

    /// The x of each part from the content's left, and the content's width; `label` is a label view's width.
    @MainActor
    func parts(label: CGFloat?) -> (lead: CGFloat, words: CGFloat, count: CGFloat, trailing: CGFloat, width: CGFloat) {
        var x: CGFloat = 0
        var any = false
        func add(_ width: CGFloat) -> CGFloat {
            if any {
                x += gap
            }
            any = true
            let start = x
            x += width
            return start
        }
        let lead = leadPoints.map(add) ?? 0
        let wordsWidth = labelLast ? nil : label ?? (words.text.isEmpty ? nil : Self.lines(words).width)
        var wordsX = wordsWidth.map(add) ?? x
        let countX = count.map { add(Self.lines($0).width) } ?? x
        if labelLast, let label {
            wordsX = add(label)
        }
        let trailingX = trailingIcon.map { _ in add(NIconSize.compact.points) } ?? x
        return (lead, wordsX, countX, trailingX, x)
    }

    /// Where the content starts in a button `width` wide whose content is `content` wide.
    /// Where the content starts. A button squeezed below its content and padding (a flex row that shrank it) centers
    /// the content, as `justify-content: center` does when it overflows.
    func contentLeft(width: CGFloat, content: CGFloat) -> CGFloat {
        let squeezed = width < content + 2 * (border + paddingX) - 0.01
        return fill || centered || fixedWidth != nil || squeezed ? (width - content) / 2 : border + paddingX
    }

    func naturalWidth(content: CGFloat) -> CGFloat {
        fixedWidth ?? min(maxWidth, max(minWidth, content + 2 * (border + paddingX)))
    }
}

extension NButtonLook {
    /// A button's look (NButton); an extension, so the struct keeps its memberwise init for NIconButton's.
    @MainActor
    init(
        words text: String, variant: NButtonVariant, size: NButtonSize, icon: GMIconName?,
        trailingIcon: GMIconName?, layout: NLayoutIcon.Kind?, layoutActive: Bool, spinning: Bool, pressed: Bool,
        count: Int?, fill: Bool, labelled: Bool
    ) {
        let small = size != .normal
        let iconOnly = text.isEmpty && !labelled && (icon != nil || layout != nil)
        let fontSize: CGFloat? = size == .mini ? GMFontSize.compact : small ? GMButtonTokens.fontSizeSmall : nil
        let font = NTypography.FontKey(GMTextStyles.body, size: fontSize)
        let colors = NButtonLook.colors(variant.rawValue)
        self.colors = colors
        words = NButtonLook.spec(text, font, tone: colors.text)
        self.count = count.map {
            let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.xsmall)
            return NButtonLook.spec(String($0), small, tone: .textDim)
        }
        self.icon = icon
        iconSize = size == .normal ? .normal : size == .tiny ? .medium : .compact
        self.layout = layout
        self.layoutActive = layoutActive
        self.trailingIcon = trailingIcon
        self.spinning = spinning
        self.pressed = pressed
        self.fill = fill
        self.labelled = labelled
        height = switch size {
        case .normal: GMButtonTokens.height
        case .small: GMButtonTokens.heightSmall
        case .tiny: GMButtonTokens.heightTiny
        case .mini: GMButtonTokens.heightMini
        }
        var padding = variant == .ghost ? GMButtonTokens.ghostPaddingX : GMButtonTokens.paddingX
        if small {
            padding = GMButtonTokens.paddingXSmall
        }
        if iconOnly {
            padding = GMButtonTokens.iconOnlyPaddingX
        }
        if size == .mini {
            padding = GMButtonTokens.paddingXMini
        }
        paddingX = padding
        border = variant == .ghost ? 0 : NButtonLook.cssBorder
        fixedWidth = size == .tiny && iconOnly ? GMButtonTokens.iconOnlyTinyWidth : nil
        maxWidth = variant == .ghost ? GMButtonTokens.ghostMaxWidth : .infinity
    }
}

final class NButtonPlaced: @unchecked Sendable {
    var left: CGFloat = 0
    var parts: (lead: CGFloat, words: CGFloat, count: CGFloat, trailing: CGFloat, width: CGFloat) = (0, 0, 0, 0, 0)
}

/// Which part of the button a subview is.
enum NButtonPart: LayoutValueKey {
    enum Part {
        case face, label, spin, badge
    }

    static let defaultValue = Part.face
}

/// The button's room: its words' width plus padding (or a stack's whole width, when a column stretches it), always its
/// size's height. Places a label view, a spinning icon and a corner badge over the drawn face.
struct NButtonFrame: Layout {
    let look: NButtonLook

    private func labelWidth(_ subviews: Subviews) -> CGFloat? {
        guard look.labelled else {
            return nil
        }
        return subviews.first { $0[NButtonPart.self] == .label }?.sizeThatFits(.unspecified).width ?? 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let content = MainActor.assumeIsolated { look.parts(label: labelWidth(subviews)).width }
        let natural = look.naturalWidth(content: content)
        guard let offer = proposal.width, offer.isFinite, look.fixedWidth == nil else {
            return CGSize(width: natural, height: look.height)
        }
        // A stack stretches it past its content; a flex row short of room squeezes it, never below its min width.
        return CGSize(width: offer >= natural ? offer : max(offer, look.minWidth), height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let parts = MainActor.assumeIsolated { look.parts(label: labelWidth(subviews)) }
        let left = bounds.minX + look.contentLeft(width: bounds.width, content: parts.width)
        look.words.state.origin = bounds.origin
        look.placed.left = left - bounds.minX
        look.placed.parts = parts
        for subview in subviews {
            switch subview[NButtonPart.self] {
            case .face:
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            case .label:
                let spot = CGPoint(x: left + parts.words, y: bounds.midY)
                subview.place(at: spot, anchor: .leading, proposal: .unspecified)
            case .spin:
                let spot = CGPoint(x: left + parts.lead, y: bounds.midY)
                subview.place(at: spot, anchor: .leading, proposal: .unspecified)
            case .badge:
                subview.place(at: CGPoint(x: bounds.maxX, y: bounds.minY), anchor: .topTrailing, proposal: .zero)
            }
        }
    }
}
