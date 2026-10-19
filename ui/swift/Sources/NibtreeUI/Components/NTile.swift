import NibtreeTokens
import SwiftUI

/// A big start action with its icon on a rounded tile and its name under it, like Open, Clone and New on the Welcome
/// page: the Swift side of ui/web `Tile` (docs/components/Tile.md). The tile turns accent under the pointer. The
/// web's `title` is SwiftUI's own `.help(...)` on the tile. One canvas draws the tile, the icon and the name (centered,
/// wrapped to the tile's width).
public struct NTile: View {
    private let spec: NTextSpec
    private let icon: GMIconName
    private let action: () -> Void
    @State private var hovering = false

    public init(icon: GMIconName, label: String, action: @escaping () -> Void) {
        let font = NTypography.FontKey(GMTextStyles.body)
        spec = NTextSpec(
            text: label, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.icon = icon
        self.action = action
    }

    public var body: some View {
        let (spec, icon, hot) = (spec, icon, hovering)
        NTileFrame(spec: spec) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NTileFace.draw(
                            spec: spec, icon: icon, hovering: hot, size: size, palette: palette, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .onHover { hovering = $0 }
        .onTapGesture(perform: action)
        .accessibilityElement()
        .accessibilityLabel(spec.text)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

enum NTileFace {
    @MainActor
    static func draw(
        spec: NTextSpec, icon: GMIconName, hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat,
        in cg: CGContext
    ) {
        let side = GMTileTokens.iconSize
        let left = (size.width - side) / 2
        let box = CGRect(x: left, y: 0, width: side, height: side)
        let radius = GMTileTokens.iconRadius
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(.panelAlt))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: 1, dy: 1), cornerWidth: radius - 1, cornerHeight: radius - 1,
                transform: nil))
        cg.setFillColor(palette.cgColor(hovering ? .accent : .borderStrong))
        cg.fillPath(using: .evenOdd)
        let color = palette.cgColor(hovering ? .accent : .text)
        let origin = spec.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let points = NIconSize.huge.points
        let key = NIconImages.Key(
            name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            // Centered in the tile, on whole device pixels as WebKit puts an SVG.
            let x = ((left + (side - points) / 2 + phase.x) * scale).rounded() / scale
            let y = (((side - points) / 2 + phase.y) * scale).rounded() / scale
            cg.saveGState()
            cg.translateBy(x: x, y: y + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        guard let layout = spec.state.layout else {
            return
        }
        cg.translateBy(x: phase.x, y: side + GMTileTokens.gap + phase.y)
        NTextEngine.draw(
            layout, line: spec.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg,
            centeredIn: size.width)
    }
}

/// The tile's fixed width, and its height: the icon tile, the gap and the name's lines.
private struct NTileFrame: Layout {
    let spec: NTextSpec

    private func height() -> CGFloat {
        let layout = MainActor.assumeIsolated { spec.state.layout ?? spec.layout(width: GMTileTokens.width) }
        spec.state.layout = layout
        return GMTileTokens.iconSize + GMTileTokens.gap + CGFloat(layout.lines.count) * spec.line.height
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: GMTileTokens.width, height: height())
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = height()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
