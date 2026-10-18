import NibtreeTokens
import SwiftUI

/// A small label beside a name, like "primary" or "folder" in the AI panel: the Swift side of ui/web `Tag`
/// (docs/components/Tag.md). `outline` is a bordered kind label such as "submodule"; `small` fits tight rows, such as
/// a file's LFS mark. Like the web's block in a flex box it is as wide as a column that stretches it, its word at the
/// start; only `small` (no height of its own) grows with a row. The web's `title` is SwiftUI's own `.help(...)`.
public struct NTag: View {
    public enum Tone: String, CaseIterable, Sendable {
        case neutral, accent, danger, success, warning

        var color: GMColorToken {
            switch self {
            case .neutral: .textDim
            case .accent: .accent
            case .danger: .danger
            case .success: .success
            case .warning: .warning
            }
        }
    }

    public enum Variant: String, CaseIterable, Sendable {
        case fill, outline
    }

    public enum Size: String, CaseIterable, Sendable {
        case normal, small
    }

    /// Tag.svelte's `color-mix(... 14%, transparent)` behind a toned word.
    static let toneShare = 0.14

    private let spec: NTextSpec
    private let tone: Tone
    private let variant: Variant
    private let size: Size

    public init(_ text: String, tone: Tone = .neutral, variant: Variant = .fill, size: Size = .normal) {
        let small = size == .small
        let font = NTypography.FontKey(
            GMTextStyles.body, size: small ? GMFontSize.micro : GMFontSize.tiny,
            weight: small || variant == .outline ? GMFontWeight.semibold : GMFontWeight.regular)
        // The outline's border comes off the normal line (`calc(height - 2px)`); `small` sets its own line after it.
        let line = small ? GMTagTokens.smallLineHeight : GMTagTokens.height - 2 * NTagBox(variant: variant).border
        spec = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: Double(line / font.size)), tone: tone.color, strike: false)
        self.tone = tone
        self.variant = variant
        self.size = size
    }

    public var body: some View {
        NTagFrame(spec: spec, box: NTagBox(variant: variant, size: size)) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let start = NTagBox(variant: variant, size: size).textOrigin
                    context.withCGContext { cg in
                        NTagBox.draw(size: box, in: cg, fill: fill(palette), border: border(palette))
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // The word sits at fractions of a point, as WebKit draws it; SwiftUI rounded the box's spot.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + start.x,
                            y: origin.y - (origin.y * scale).rounded() / scale + start.y)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(spec.text)
    }

    private func fill(_ palette: Palette) -> CGColor? {
        if variant == .outline {
            return nil
        }
        if tone == .neutral {
            return palette.cgColor(.hover)
        }
        let color = palette.cgColor(tone.color)
        return color.copy(alpha: color.alpha * Self.toneShare)
    }

    private func border(_ palette: Palette) -> CGColor? {
        variant == .outline ? palette.cgColor(.borderStrong) : nil
    }
}

/// The tag's box: a 1 point border for `outline`, the padding before the word, and the rounded face.
struct NTagBox {
    var variant: NTag.Variant
    var size: NTag.Size = .normal

    var border: CGFloat { variant == .outline ? 1 : 0 }

    /// Where the word's line box starts: inside the border and the side padding, at the top.
    var textOrigin: CGPoint {
        CGPoint(x: border + (size == .small ? GMTagTokens.smallPaddingX : GMTagTokens.paddingX), y: border)
    }

    static func draw(size: CGSize, in cg: CGContext, fill: CGColor?, border: CGColor?) {
        let radius = GMTagTokens.radius
        let outer = CGPath(
            roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius, transform: nil)
        if let fill {
            cg.setFillColor(fill)
            cg.addPath(outer)
            cg.fillPath()
        }
        guard let border else {
            return
        }
        cg.addPath(outer)
        cg.addPath(CGPath(
            roundedRect: CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1), cornerWidth: radius - 1,
            cornerHeight: radius - 1, transform: nil))
        cg.setFillColor(border)
        cg.fillPath(using: .evenOdd)
    }
}

/// Sizes the tag like the web's border-box: the word plus padding and border wide, or the width a column stretches it
/// to; `normal` is always the token height, `small` its line plus border, or the height a row stretches it to.
private struct NTagFrame: Layout {
    let spec: NTextSpec
    let box: NTagBox

    private func natural() -> CGSize {
        let layout = spec.state.layout ?? MainActor.assumeIsolated { spec.layout(width: nil) }
        spec.state.layout = layout
        let start = box.textOrigin
        let height = box.size == .small ? spec.line.height + 2 * box.border : GMTagTokens.height
        return CGSize(width: layout.width + 2 * start.x, height: height)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = natural()
        // A finite offer is a stack stretching the tag (CSS stretch); none keeps it natural.
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural.width
        guard box.size == .small, let height = proposal.height, height.isFinite else {
            return CGSize(width: width, height: natural.height)
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = natural()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
