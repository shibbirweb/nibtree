import NibtreeTokens
import SwiftUI

/// Everything an empty state draws, worked out once from its props as EmptyState.svelte's classes do.
struct NEmptyStateLook: Sendable {
    /// The icon alone, or on a round tinted badge.
    struct Glyph: Sendable {
        let name: GMIconName
        let points: CGFloat
        let stroke: CGFloat
        let tone: GMColorToken
        let circle: CGFloat?
        let circleShare: Double

        var height: CGFloat { circle ?? points }
    }

    let glyph: Glyph?
    let title: NTextSpec
    let hint: NTextSpec?
    let gap: CGFloat
    let padding: CGSize
    /// A notice's dashed box.
    let dashed: Bool
    /// Centered up and down in its room (an area or a pane), or at the top (a panel or a notice).
    let centered: Bool
    /// Where the layout put the parts, for the canvas.
    let placed = NEmptyStatePlaced()

    var border: CGFloat { dashed ? NEmptyStateLook.cssBorder : 0 }
    /// EmptyState.svelte's `1px dashed` notice border.
    nonisolated static let cssBorder = 1.0

    @MainActor
    init(
        title: String, hint: String, icon: GMIconName?, variant: NEmptyState.Variant,
        iconStyle: NEmptyState.IconStyle, iconTone: NEmptyState.IconTone, strong: Bool,
        titleSize: NEmptyState.TitleSize, titleTone: NEmptyState.TitleTone
    ) {
        let small = variant == .panel || variant == .notice
        let base = small ? GMFontSize.small : GMTextStyles.body.size
        let titleWeight: Font.Weight = small ? .bold : strong || titleSize == .large ? .semibold : .regular
        let titleFont = NTypography.FontKey(
            GMTextStyles.body, size: titleSize == .large ? GMFontSize.title : base, weight: titleWeight)
        let toneColor: GMColorToken = switch titleTone {
        case .default: .text
        case .dim: .textDim
        case .danger: .danger
        }
        // A panel's title rule comes later in EmptyState.svelte, so its plain text color wins over the tone.
        let titleColor = small ? .text : toneColor
        self.title = Self.spec(title, titleFont, titleColor)
        self.hint = hint.isEmpty ? nil : Self.spec(hint, NTypography.FontKey(GMTextStyles.body, size: base), .textDim)
        glyph = icon.map { Self.glyph($0, variant: variant, style: iconStyle, tone: iconTone, small: small) }
        switch variant {
        case .area:
            (gap, padding) = (GMEmptyStateTokens.gap, CGSize(width: GMEmptyStateTokens.padding,
                height: GMEmptyStateTokens.padding))
        case .pane:
            (gap, padding) = (GMEmptyStateTokens.paneGap, CGSize(width: GMEmptyStateTokens.panePaddingX,
                height: GMEmptyStateTokens.panePaddingY))
        case .panel, .notice:
            (gap, padding) = (GMEmptyStateTokens.panelGap, CGSize(width: GMEmptyStateTokens.panelPaddingX,
                height: GMEmptyStateTokens.panelPaddingY))
        }
        dashed = variant == .notice
        centered = !small
    }

    @MainActor
    private static func spec(_ text: String, _ font: NTypography.FontKey, _ tone: GMColorToken) -> NTextSpec {
        NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
    }

    private static func glyph(
        _ name: GMIconName, variant: NEmptyState.Variant, style: NEmptyState.IconStyle, tone: NEmptyState.IconTone,
        small: Bool
    ) -> Glyph {
        switch style {
        case .plain:
            let color: GMColorToken = switch tone {
            case .inherit: small ? .textDim : .text
            case .faint: .textFaint
            case .accent: .accent
            case .success: .success
            }
            let area = variant == .area
            return Glyph(
                name: name, points: area ? GMIconSize.xlarge : GMIconSize.giant,
                stroke: area ? GMIconStroke.normal : GMIconStroke.thin, tone: color, circle: nil, circleShare: 0)
        case .circle, .largeCircle:
            let large = style == .largeCircle
            let points = large ? GMIconSize.emphasis : variant == .pane ? GMIconSize.xxlarge : GMIconSize.xlarge
            let success = tone == .success
            return Glyph(
                name: name, points: points, stroke: GMIconStroke.normal, tone: success ? .success : .accent,
                circle: large ? GMEmptyStateTokens.largeCircleSize : GMEmptyStateTokens.circleSize,
                circleShare: success ? (large ? 0.18 : 0.14) : 0.12)
        }
    }
}

final class NEmptyStatePlaced: @unchecked Sendable {
    /// Top of the icon, title and hint, from the view's top.
    var icon: CGFloat = 0
    var title: CGFloat = 0
    var hint: CGFloat = 0
}

/// The empty state's room: as wide as offered, its parts in a centered column, `gap` apart, inside the padding.
/// Its height is the content's; an area or pane takes a height it is offered (its share of a stack) and centers the
/// parts in it.
struct NEmptyStateFrame: Layout {
    let look: NEmptyStateLook

    struct Cache {
        var room: CGFloat?? = .none
        var title: NTextEngine.Layout?
        var hint: NTextEngine.Layout?
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    private var insets: CGSize {
        CGSize(width: look.padding.width + look.border, height: look.padding.height + look.border)
    }

    private func lines(_ room: CGFloat?, _ cache: inout Cache) -> (NTextEngine.Layout, NTextEngine.Layout?) {
        if case .some(let cached) = cache.room, cached == room, let title = cache.title {
            return (title, cache.hint)
        }
        let (title, hint) = MainActor.assumeIsolated {
            (look.title.layout(width: room), look.hint?.layout(width: room))
        }
        cache = Cache(room: .some(room), title: title, hint: hint)
        return (title, hint)
    }

    /// The parts' heights, top to bottom, and the widest part.
    private func parts(_ width: CGFloat?, _ subviews: Subviews, _ cache: inout Cache) -> ([CGFloat], CGFloat) {
        let room = width.map { max(0, $0 - 2 * insets.width) }
        let (title, hint) = lines(room, &cache)
        var heights: [CGFloat] = []
        var widest = title.width
        if let glyph = look.glyph {
            heights.append(glyph.height)
            widest = max(widest, glyph.circle ?? glyph.points)
        }
        heights.append(CGFloat(title.lines.count) * look.title.line.height)
        if let hint, let spec = look.hint {
            heights.append(CGFloat(hint.lines.count) * spec.line.height)
            widest = max(widest, hint.width)
        }
        // The action is as wide as its content, like a flex item centered across the column.
        if let action = subviews.dropFirst().first?.sizeThatFits(.unspecified) {
            heights.append(action.height)
            widest = max(widest, action.width)
        }
        return (heights, widest)
    }

    private func height(_ heights: [CGFloat]) -> CGFloat {
        heights.reduce(0, +) + look.gap * CGFloat(max(0, heights.count - 1)) + 2 * insets.height
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let (heights, widest) = parts(offer, subviews, &cache)
        let natural = height(heights)
        // A stack measures with no height and places a growing area with its share: the area takes it all.
        let offered = look.centered ? proposal.height.flatMap { $0.isFinite ? $0 : nil } : nil
        return CGSize(width: offer ?? widest + 2 * insets.width, height: max(natural, offered ?? natural))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let (heights, _) = parts(bounds.width, subviews, &cache)
        look.title.state.layout = cache.title
        look.title.state.origin = bounds.origin
        look.hint?.state.layout = cache.hint
        let free = look.centered ? max(0, bounds.height - height(heights)) / 2 : 0
        var y = free + insets.height
        var index = 0
        func next() -> CGFloat {
            let top = y
            y += heights[index] + look.gap
            index += 1
            return top
        }
        if look.glyph != nil {
            look.placed.icon = next()
        }
        look.placed.title = next()
        if look.hint != nil {
            look.placed.hint = next()
        }
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        if subviews.count > 1 {
            let spot = CGPoint(x: bounds.midX, y: bounds.minY + next())
            subviews[1].place(at: spot, anchor: .top, proposal: .unspecified)
        }
    }
}
