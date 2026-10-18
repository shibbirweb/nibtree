import NibtreeTokens
import SwiftUI

/// A person's or project's initials: the Swift side of ui/web `Avatar` (docs/components/Avatar.md). A round accent
/// `circle` is a signed-in account; a rounded `tile` in one of the palette colors is a project on the Welcome page.
/// Its size never changes with the stack around it, and long text overflows both sides like the web's flex centering.
public struct NAvatar: View {
    public enum Shape: String, CaseIterable, Sendable {
        case circle, tile
    }

    public enum Color: String, CaseIterable, Sendable {
        case accent, blue, green, magenta, cyan, red

        /// The terminal color a palette tile shades from bright (top left) to deep (bottom right).
        var shades: (bright: GMColorToken, deep: GMColorToken)? {
            switch self {
            case .accent: nil
            case .blue: (.termBrightBlue, .termBlue)
            case .green: (.termBrightGreen, .termGreen)
            case .magenta: (.termBrightMagenta, .termMagenta)
            case .cyan: (.termBrightCyan, .termCyan)
            case .red: (.termBrightRed, .termRed)
            }
        }
    }

    private let spec: NTextSpec
    private let shape: Shape
    private let color: Color
    private let label: String?

    /// `label` is read by VoiceOver instead of the letters, such as the full name.
    public init(text: String, shape: Shape = .circle, color: Color = .accent, label: String? = nil) {
        let tile = shape == .tile
        let font = NTypography.FontKey(
            GMTextStyles.body, size: tile ? GMFontSize.ui : GMFontSize.small,
            weight: tile ? GMFontWeight.bold : GMFontWeight.semibold)
        // Palette tiles have their own letter color: the accent text could be black on a deep tile.
        let tone: GMColorToken = tile && color != .accent ? .avatarText : .accentText
        spec = NTextSpec(
            text: text, font: font, kerning: tile ? GMLetterSpacing.slight * font.size : 0, tabular: false,
            truncate: false, line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        self.shape = shape
        self.color = color
        self.label = label
    }

    public var body: some View {
        NAvatarFrame(spec: spec, side: shape == .tile ? GMAvatarTokens.tileSize : GMAvatarTokens.size) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NAvatarFace.draw(shape: shape, color: color, size: box, palette: palette, in: cg)
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // Flex centering puts the letters at fractions of a point, as WebKit draws them.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + (box.width - layout.width) / 2,
                            y: origin.y - (origin.y * scale).rounded() / scale + (box.height - spec.line.height) / 2)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(label ?? spec.text)
    }
}

/// The avatar's round or rounded face: flat accent, or a terminal color shaded bright to deep at 135 degrees.
enum NAvatarFace {
    /// Avatar.svelte's `color-mix` shares of the terminal color over the theme's terminal black.
    static let brightShare = 0.88
    static let deepShare = 0.72

    @MainActor
    static func draw(
        shape: NAvatar.Shape, color: NAvatar.Color, size: CGSize, palette: Palette, in cg: CGContext
    ) {
        let box = CGRect(origin: .zero, size: size)
        let radius = shape == .tile ? GMAvatarTokens.tileRadius : 0
        cg.addPath(
            shape == .tile
                ? CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
                : CGPath(ellipseIn: box, transform: nil))
        guard let shades = color.shades else {
            cg.setFillColor(palette.cgColor(.accent))
            cg.fillPath()
            return
        }
        guard let gradient = gradient(color, shades, palette) else {
            return
        }
        cg.clip()
        // CSS's 135 degree line on a square runs from the top left corner to the bottom right one.
        cg.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
    }

    /// Made once per theme and color: making one per drawing cost more than the whole web tile.
    @MainActor private static var gradients: [String: CGGradient] = [:]

    @MainActor private static func gradient(
        _ color: NAvatar.Color, _ shades: (bright: GMColorToken, deep: GMColorToken), _ palette: Palette
    ) -> CGGradient? {
        let key = palette.themeId + "/" + color.rawValue
        if let made = gradients[key] {
            return made
        }
        let black = palette.cgColor(.termBlack)
        let colors = [
            mix(palette.cgColor(shades.bright), black, share: brightShare),
            mix(palette.cgColor(shades.deep), black, share: deepShare),
        ]
        let made = CGGradient(
            colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors as CFArray, locations: [0, 1])
        gradients[key] = made
        return made
    }

    /// `color-mix(in srgb, color share, other)`.
    static func mix(_ color: CGColor, _ other: CGColor, share: Double) -> CGColor {
        let (a, b) = (color.components ?? [0, 0, 0, 1], other.components ?? [0, 0, 0, 1])
        guard a.count == 4, b.count == 4 else {
            return color
        }
        return CGColor(
            srgbRed: a[0] * share + b[0] * (1 - share), green: a[1] * share + b[1] * (1 - share),
            blue: a[2] * share + b[2] * (1 - share), alpha: a[3] * share + b[3] * (1 - share))
    }
}

/// The token's square, whatever a stack offers; it also keeps where the letters' layout is.
private struct NAvatarFrame: Layout {
    let spec: NTextSpec
    let side: CGFloat

    private func measure() {
        if spec.state.layout == nil {
            spec.state.layout = MainActor.assumeIsolated { spec.layout(width: nil) }
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        measure()
        return CGSize(width: side, height: side)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        measure()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
