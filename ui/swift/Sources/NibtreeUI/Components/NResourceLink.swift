import NibtreeTokens
import SwiftUI

/// `plain` is the Welcome page's Learn links, `card` Settings' About links: bordered, turning accent under the pointer.
public enum NResourceLinkVariant: String, CaseIterable, Sendable {
    case plain, card
}

/// A large row that opens something to read or do, with an icon, a title and a line of description, like the Welcome
/// page's Learn links: the Swift side of ui/web `ResourceLink` (docs/components/ResourceLink.md). As wide as a column
/// that stretches it, its words wrapping in what the icon leaves. One canvas draws it.
public struct NResourceLink: View {
    private let look: NResourceLinkLook
    private let action: () -> Void
    @State private var hovering = false

    public init(
        icon: GMIconName, title: String, description: String = "", variant: NResourceLinkVariant = .plain,
        action: @escaping () -> Void
    ) {
        look = NResourceLinkLook(icon: icon, title: title, description: description, variant: variant)
        self.action = action
    }

    public var body: some View {
        let (look, hot) = (look, hovering)
        NResourceLinkFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovering: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onHover { hovering = $0 }
        .onTapGesture(perform: action)
        .accessibilityElement()
        .accessibilityLabel(look.title.text)
        .accessibilityHint(look.description?.text ?? "")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

/// Everything a resource link draws, from ResourceLink.svelte's classes.
struct NResourceLinkLook: Sendable {
    let icon: GMIconName
    let title: NTextSpec
    let description: NTextSpec?
    let variant: NResourceLinkVariant
    let placed = NTextState()

    @MainActor
    init(icon: GMIconName, title: String, description: String, variant: NResourceLinkVariant) {
        let card = variant == .card
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        let titleFont = NTypography.FontKey(
            GMTextStyles.body, size: card ? nil : GMFontSize.medium, weight: GMFontWeight.semibold)
        self.title = spec(title, titleFont, .text)
        let body = NTypography.FontKey(GMTextStyles.body)
        self.description = description.isEmpty ? nil : spec(description, body, .textDim)
        self.icon = icon
        self.variant = variant
    }

    var card: Bool { variant == .card }
    var border: CGFloat { card ? 1 : 0 }
    var padding: CGSize {
        card
            ? CGSize(width: GMResourceLinkTokens.cardPaddingX, height: GMResourceLinkTokens.cardPaddingY)
            : CGSize(width: GMResourceLinkTokens.paddingX, height: GMResourceLinkTokens.paddingY)
    }
    var gap: CGFloat { card ? GMResourceLinkTokens.cardGap : GMResourceLinkTokens.gap }
    var linesGap: CGFloat { card ? GMResourceLinkTokens.cardLinesGap : GMResourceLinkTokens.linesGap }
    /// Where the words start: past the border, the padding, the icon and the gap.
    var wordsLeft: CGFloat { border + padding.width + NIconSize.xlarge.points + gap }

    /// The words laid out in `width` (wrapped), and their height.
    @MainActor
    func layOut(width: CGFloat?) -> (width: CGFloat, height: CGFloat) {
        let title = self.title.layout(width: width)
        self.title.state.layout = title
        var height = CGFloat(title.lines.count) * self.title.line.height
        var widest = title.width
        if let description {
            let layout = description.layout(width: width)
            description.state.layout = layout
            height += linesGap + CGFloat(layout.lines.count) * description.line.height
            widest = max(widest, layout.width)
        }
        return (widest, height)
    }

    /// The link's height for words this tall: the padding around the taller of the icon and the words, at least the
    /// plain link's minimum.
    func height(words: CGFloat) -> CGFloat {
        let content = max(NIconSize.xlarge.points + (card ? GMSpace.s1 : 0), words)
        return max(card ? 0 : GMResourceLinkTokens.minHeight, content + 2 * (padding.height + border))
    }

    @MainActor
    func draw(hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let box = CGRect(origin: .zero, size: size)
        let radius = GMResourceLinkTokens.radius
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        if card || hovering {
            cg.addPath(outer)
            cg.setFillColor(palette.cgColor(card ? .panel : .hover))
            cg.fillPath()
        }
        if card {
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: 1, dy: 1), cornerWidth: radius - 1, cornerHeight: radius - 1,
                    transform: nil))
            cg.setFillColor(palette.cgColor(hovering ? .accent : .borderStrong))
            cg.fillPath(using: .evenOdd)
        }
        let origin = placed.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let inner = size.height - 2 * (padding.height + border)
        let titleHeight = title.state.layout.map { CGFloat($0.lines.count) * title.line.height } ?? 0
        let descriptionHeight = description?.state.layout.map {
            linesGap + CGFloat($0.lines.count) * (description?.line.height ?? 0)
        } ?? 0
        let words = titleHeight + descriptionHeight
        let points = NIconSize.xlarge.points
        // A card aligns at the top, its icon `--space-1` down; a plain link centers both.
        let iconTop = border + padding.height + (card ? GMSpace.s1 : (inner - points) / 2)
        let wordsTop = border + padding.height + (card ? 0 : (inner - words) / 2)
        let color = palette.cgColor(card ? .accent : .textDim)
        let key = NIconImages.Key(
            name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            let x = ((border + padding.width + phase.x) * scale).rounded() / scale
            let y = ((iconTop + phase.y) * scale).rounded() / scale
            cg.saveGState()
            cg.translateBy(x: x, y: y + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        cg.translateBy(x: wordsLeft + phase.x, y: wordsTop + phase.y)
        if let layout = title.state.layout {
            NTextEngine.draw(
                layout, line: title.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
        }
        if let description, let layout = description.state.layout {
            cg.translateBy(x: 0, y: titleHeight + linesGap)
            NTextEngine.draw(
                layout, line: description.line, color: palette.cgColor(.textDim), strike: nil, scale: scale, in: cg)
        }
    }
}

/// A flex button: as wide as a column stretching it (its words wrap in what is left), else its content's width.
private struct NResourceLinkFrame: Layout {
    let look: NResourceLinkLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        MainActor.assumeIsolated {
            let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
            let room = width.map { max(1, $0 - look.wordsLeft - look.padding.width - look.border) }
            let words = look.layOut(width: room)
            let natural = look.wordsLeft + words.width + look.padding.width + look.border
            return CGSize(width: width ?? natural, height: look.height(words: words.height))
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            _ = look.layOut(width: max(1, bounds.width - look.wordsLeft - look.padding.width - look.border))
        }
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
