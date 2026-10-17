import NibtreeTokens
import SwiftUI

/// What the text's layout hands its drawing: the lines it laid out, and the part of its position that SwiftUI rounds
/// away (it snaps views to device pixels; WebKit draws text at fractional positions), so the drawing puts it back.
final class NTextState: @unchecked Sendable {
    /// Where the text's layout placed it, fractions kept.
    var origin = CGPoint.zero
    var layout: NTextEngine.Layout?
}

/// Everything `NTextCanvas` needs to lay out and draw one text.
struct NTextSpec {
    let text: String
    let font: NTypography.FontKey
    let kerning: CGFloat
    let tabular: Bool
    let truncate: Bool
    let line: NLineBox
    /// Read from the palette when drawing, so a text has no environment dependency of its own (cheaper to build).
    let tone: GMColorToken
    let strike: Bool
    let state = NTextState()

    @MainActor
    func layout(width: CGFloat?) -> NTextEngine.Layout {
        NTextEngine.layout(text, font: font, kerning: kerning, tabular: tabular, truncate: truncate, width: width)
    }
}

/// Text drawn with Core Text in a Canvas, sized like a CSS block of that text: its exact width on one line, or the
/// width on offer when it wraps or truncates, and one WebKit line box per line.
struct NTextCanvas: View {
    let spec: NTextSpec

    var body: some View {
        NTextFrame(spec: spec) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let layout = spec.state.layout ?? spec.layout(width: size.width)
                    let scale = max(1, context.environment.displayScale)
                    let color = context.environment.nibtreePalette.cgColor(spec.tone)
                    // SwiftUI drew the canvas at its position rounded to device pixels; WebKit draws text at the exact
                    // fractional spot, so move the drawing back by what the rounding took away.
                    let origin = spec.state.origin
                    let shift = CGSize(
                        width: origin.x - (origin.x * scale).rounded() / scale,
                        height: origin.y - (origin.y * scale).rounded() / scale)
                    context.withCGContext { cg in
                        cg.translateBy(x: shift.width, y: shift.height)
                        let strike = spec.strike ? context.environment.nibtreePalette.cgColor(.textFaint) : nil
                        NTextEngine.draw(layout, line: spec.line, color: color, strike: strike, scale: scale, in: cg)
                    }
                }
            }
        }
    }
}

private struct NTextFrame: Layout {
    let spec: NTextSpec

    /// The last offered width and its lines: SwiftUI asks for the size, then places, often with the same offer.
    struct Cache {
        var width: CGFloat?? = .none
        var layout: NTextEngine.Layout?
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    private func layout(_ width: CGFloat?, _ cache: inout Cache) -> NTextEngine.Layout {
        if case .some(let cached) = cache.width, cached == width, let layout = cache.layout {
            return layout
        }
        let layout = MainActor.assumeIsolated { spec.layout(width: width) }
        cache = Cache(width: .some(width), layout: layout)
        return layout
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let layout = layout(proposal.width, &cache)
        let width = proposal.width.map { min($0, layout.width) } ?? layout.width
        return CGSize(width: width, height: CGFloat(layout.lines.count) * spec.line.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        spec.state.layout = layout(proposal.width, &cache)
        spec.state.origin = bounds.origin
        // The canvas may draw a hair past an exact fractional width: give it room, it does not clip.
        let room = ProposedViewSize(width: bounds.width.rounded(.up) + 1, height: bounds.height)
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: room)
    }
}
