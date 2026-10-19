import NibtreeTokens
import SwiftUI

/// A card over a dimmed window while something long happens, like opening a big folder: a spinner, a title, the
/// current step and a hint: the Swift side of ui/web `LoadingOverlay` (docs/components/LoadingOverlay.md). Put it in an
/// overlay of the window's content: like the web's `position: fixed` backdrop it takes the whole room and centers the
/// card. It does not take the keyboard; the work ends it. One canvas draws the backdrop, the card and its words; the
/// spinner is the only other view, so turning it redraws nothing.
public struct NLoadingOverlay: View {
    private let open: Bool
    private let texts: NLoadingOverlayTexts

    public init(open: Bool = true, title: String, step: String = "", hint: String = "") {
        self.open = open
        texts = NLoadingOverlayTexts(title: title, step: step, hint: hint)
    }

    public var body: some View {
        if open {
            let texts = texts
            NLoadingOverlayLayout(texts: texts) {
                Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                    MainActor.assumeIsolated {
                        let palette = context.environment.nibtreePalette
                        let scale = max(1, context.environment.displayScale)
                        context.withCGContext { cg in
                            texts.draw(size: size, palette: palette, scale: scale, in: cg)
                        }
                    }
                }
                NLoadingOverlaySpinner()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(texts.spoken)
            .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

/// The card's ring: Spinner's look at the overlay's size, with the thick border.
private struct NLoadingOverlaySpinner: View {
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    var body: some View {
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                context.withCGContext { cg in
                    NSpinnerRing.draw(
                        size: box.width, in: cg, track: palette.cgColor(.borderStrong),
                        head: palette.cgColor(.accent), border: GMBorderWidth.thick)
                }
            }
        }
        .rotationEffect(.degrees(started && !still ? 360 : 0))
        .animation(.linear(duration: NSpinner.turn).repeatForever(autoreverses: false), value: started)
        .onAppear { started = true }
    }
}

/// The card's title, step and hint, laid out for the card's width, and where the layout put the card.
struct NLoadingOverlayTexts: Sendable {
    let title: NTextSpec
    let step: NTextSpec?
    let hint: NTextSpec?
    /// Where the layout put the card and the words.
    let placed = NLoadingOverlayPlaced()

    static let border = NPopupBox.border
    static let textLeft = border + GMLoadingOverlayTokens.paddingX + GMLoadingOverlayTokens.spinner
        + GMLoadingOverlayTokens.gap

    @MainActor
    init(title: String, step: String, hint: String) {
        let spec = { (text: String, font: NTypography.FontKey, line: Double?, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: line), tone: tone, strike: false)
        }
        self.title = spec(title, NTypography.FontKey(GMTextStyles.bodyStrong), nil, .text)
        // The step keeps the UI font; only its size is the small code size.
        let stepFont = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.codeSmall)
        self.step = step.isEmpty ? nil : spec(step, stepFont, nil, .textDim)
        let hintFont = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        self.hint = hint.isEmpty ? nil : spec(hint, hintFont, Self.hintLine, .textFaint)
    }

    /// The card's width in a room `room` wide: the token's width, less on a window too narrow to keep the side room.
    static func cardWidth(room: CGFloat) -> CGFloat {
        max(0, min(GMLoadingOverlayTokens.width, room - 2 * GMSpace.s8))
    }

    /// The hint's CSS `line-height: 1.4`.
    static let hintLine = 1.4

    var spoken: String {
        [title.text, step?.text ?? "", hint?.text ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// The tops of the step and the hint under the title, and the column's height, wrapping each at `width`.
    @MainActor
    func measure(width: CGFloat) -> (step: CGFloat, hint: CGFloat, height: CGFloat) {
        let height = { (spec: NTextSpec) -> CGFloat in
            let layout = spec.layout(width: width)
            spec.state.layout = layout
            return CGFloat(layout.lines.count) * spec.line.height
        }
        var y = height(title)
        var stepTop = y
        if let step {
            stepTop = y + GMLoadingOverlayTokens.textGap
            y = stepTop + height(step)
        }
        var hintTop = y
        if let hint {
            hintTop = y + GMLoadingOverlayTokens.textGap + GMSpace.s3
            y = hintTop + height(hint)
        }
        return (stepTop, hintTop, y)
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        cg.setFillColor(palette.cgColor(.overlay))
        cg.fill(CGRect(origin: .zero, size: size))
        let card = placed.card
        NPopupBox.draw(card, radius: GMLoadingOverlayTokens.radius, palette: palette, in: cg)
        // The canvas covers the room from its corner: the words go at the card's exact, fractional spot like WebKit's.
        let x = card.minX + Self.textLeft
        let top = card.minY + Self.border + GMLoadingOverlayTokens.paddingY
        let place = { (spec: NTextSpec?, y: CGFloat) in
            guard let spec, let layout = spec.state.layout else {
                return
            }
            cg.saveGState()
            cg.translateBy(x: x, y: top + y)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg,
                phase: top + y)
            cg.restoreGState()
        }
        place(title, 0)
        place(step, placed.stepTop)
        place(hint, placed.hintTop)
    }
}

/// The card's frame in the overlay and the tops of the step and the hint under the title.
final class NLoadingOverlayPlaced: @unchecked Sendable {
    var card = CGRect.zero
    var stepTop = 0.0
    var hintTop = 0.0
}

/// The whole room on offer, the card centered in it: as wide as the token allows (minus the side room on a narrow
/// window) and as tall as its padding and the taller of the spinner and the words.
private struct NLoadingOverlayLayout: Layout {
    let texts: NLoadingOverlayTexts

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let border = NLoadingOverlayTexts.border
        let width = NLoadingOverlayTexts.cardWidth(room: bounds.width)
        let columnWidth = max(0, width - NLoadingOverlayTexts.textLeft - GMLoadingOverlayTokens.paddingX - border)
        let column = MainActor.assumeIsolated { texts.measure(width: columnWidth) }
        let spinner = GMLoadingOverlayTokens.spinner
        let height = 2 * (border + GMLoadingOverlayTokens.paddingY) + max(spinner + Self.spinnerDrop, column.height)
        let card = CGRect(
            x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width: width, height: height)
        texts.placed.card = card
        texts.placed.stepTop = column.step
        texts.placed.hintTop = column.hint
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        subviews.dropFirst().first?.place(
            at: CGPoint(
                x: bounds.minX + card.minX + border + GMLoadingOverlayTokens.paddingX,
                y: bounds.minY + card.minY + border + GMLoadingOverlayTokens.paddingY + Self.spinnerDrop),
            anchor: .topLeading, proposal: ProposedViewSize(width: spinner, height: spinner))
    }

    /// The spinner's CSS `margin-top: 1px`.
    private static let spinnerDrop = 1.0
}
