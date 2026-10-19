import NibtreeTokens
import SwiftUI

/// A keyboard shortcut as a key cap: the Swift side of ui/web `Kbd` (docs/components/Kbd.md). Pass the text from the
/// app's command keys, never typed by hand. Like the web's `<kbd>` in a column it is as wide as the stack, its text
/// centered; in a row, as wide as its text (at least `GMKbdTokens.minWidth`).
public struct NKbd: View {
    private let spec: NTextSpec

    public init(keys: String) {
        let font = NTypography.FontKey(GMTextStyles.small, size: GMFontSize.small)
        spec = NTextSpec(
            text: keys, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
    }

    public var body: some View {
        NKbdFrame(spec: spec) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NKbdCap.draw(size: size, in: cg, border: palette.cgColor(.borderStrong),
                            fill: palette.cgColor(.panelAlt))
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // The text sits at fractions of a point, as WebKit draws it; SwiftUI rounded the cap's spot.
                        let origin = spec.state.origin
                        let inside = size.width - 2 * NKbdCap.inset
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + NKbdCap.inset
                                + max(0, (inside - layout.width) / 2),
                            y: origin.y - (origin.y * scale).rounded() / scale + NKbdCap.top)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(spec.text)
    }
}

/// The cap's shape: a 1 point border, 2 points at the bottom, around the key color; the text's inset from its edges.
enum NKbdCap {
    static let inset = GMKbdTokens.paddingX + 1
    static let top = GMKbdTokens.paddingY + 1
    static let height = GMKbdTokens.paddingY * 2 + 1 + GMBorderWidth.thick

    static func draw(size: CGSize, in cg: CGContext, border: CGColor, fill: CGColor) {
        let radius = GMKbdTokens.radius
        cg.setFillColor(border)
        cg.addPath(CGPath(
            roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius,
            transform: nil))
        cg.fillPath()
        // CSS's inner corners: the radius less the border on each side, so the bottom ones are flatter.
        let inner = CGRect(x: 1, y: 1, width: size.width - 2, height: size.height - 1 - GMBorderWidth.thick)
        let (rx, top, bottom) = (radius - 1, radius - 1, radius - GMBorderWidth.thick)
        let path = CGMutablePath()
        path.move(to: CGPoint(x: inner.minX + rx, y: inner.minY))
        path.addLine(to: CGPoint(x: inner.maxX - rx, y: inner.minY))
        corner(path, CGPoint(x: inner.maxX - rx, y: inner.minY + top), rx, top, from: -.pi / 2, to: 0)
        path.addLine(to: CGPoint(x: inner.maxX, y: inner.maxY - bottom))
        corner(path, CGPoint(x: inner.maxX - rx, y: inner.maxY - bottom), rx, bottom, from: 0, to: .pi / 2)
        path.addLine(to: CGPoint(x: inner.minX + rx, y: inner.maxY))
        corner(path, CGPoint(x: inner.minX + rx, y: inner.maxY - bottom), rx, bottom, from: .pi / 2, to: .pi)
        path.addLine(to: CGPoint(x: inner.minX, y: inner.minY + top))
        corner(path, CGPoint(x: inner.minX + rx, y: inner.minY + top), rx, top, from: .pi, to: .pi * 1.5)
        path.closeSubpath()
        cg.setFillColor(fill)
        cg.addPath(path)
        cg.fillPath()
    }

    /// A quarter ellipse around `center` with radii `rx`, `ry`.
    private static func corner(
        _ path: CGMutablePath, _ center: CGPoint, _ rx: CGFloat, _ ry: CGFloat, from start: CGFloat, to end: CGFloat
    ) {
        path.addArc(
            center: .zero, radius: 1, startAngle: start, endAngle: end, clockwise: false,
            transform: CGAffineTransform(translationX: center.x, y: center.y).scaledBy(x: rx, y: ry))
    }
}

/// Sizes the cap like the web's `<kbd>` (border-box, no wrapping): the text plus padding and border, at least the
/// minimum width, or the width a stack stretches it to; as tall as the line plus padding and border, or stretched.
private struct NKbdFrame: Layout {
    let spec: NTextSpec

    private func natural() -> (layout: NTextEngine.Layout, size: CGSize) {
        let layout = spec.state.layout ?? MainActor.assumeIsolated { spec.layout(width: nil) }
        spec.state.layout = layout
        let width = max(GMKbdTokens.minWidth, layout.width + 2 * NKbdCap.inset)
        return (layout, CGSize(width: width, height: spec.line.height + NKbdCap.height))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = natural().size
        // A finite offer is a stack stretching the cap (CSS stretch, the text may overflow); none keeps it natural.
        guard let width = proposal.width, width.isFinite else {
            return CGSize(width: size.width, height: height(proposal.height, size.height))
        }
        return CGSize(width: max(width, GMKbdTokens.minWidth), height: height(proposal.height, size.height))
    }

    private func height(_ offer: CGFloat?, _ natural: CGFloat) -> CGFloat {
        guard let offer, offer.isFinite else {
            return natural
        }
        return max(offer, natural)
    }

    /// The key's text baseline, so a row lined up on baselines (a list row's shortcut) puts it where CSS does.
    func explicitAlignment(
        of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews,
        cache: inout ()
    ) -> CGFloat? {
        guide == .firstTextBaseline || guide == .lastTextBaseline ? bounds.minY + NKbdCap.top + spec.line.baseline : nil
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = natural()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
