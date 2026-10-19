import NibtreeTokens
import SwiftUI

/// A field's look: `normal`, or `compact` like the Git dialogs' fields: a smaller, dim label and a faint hint.
public enum NFieldLook: String, CaseIterable, Sendable {
    case normal, compact
}

/// A labelled form field: the label above, the control, then a hint or an error under it: the Swift side of ui/web
/// `Field` (docs/components/Field.md). An error takes the hint's place. The control is the caller's view, as wide as
/// the field. One canvas draws the label and the hint or error around it: a stack of texts cost a field more than its
/// input.
public struct NField<Content: View>: View {
    private let look: NFieldTexts
    private let content: Content

    public init(
        label: String = "", hint: String = "", error: String? = nil, look: NFieldLook = .normal,
        @ViewBuilder content: () -> Content
    ) {
        self.look = NFieldTexts(label: label, hint: hint, error: error, look: look)
        self.content = content()
    }

    public var body: some View {
        let look = look
        NFieldLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
            content
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.label?.text ?? "")
    }
}

/// The field's label and its hint or error, laid out for the width the field gets.
struct NFieldTexts: Sendable {
    let label: NTextSpec?
    /// The hint, or the error in its place.
    let note: NTextSpec?
    let gap: CGFloat
    /// The room between the control and the note: the error keeps `--field-error-gap` whatever the field's gap.
    let noteGap: CGFloat
    let origin = NTextState()
    /// Where the note starts, from the field's top; set by the layout.
    let noteTop = NTextState()

    @MainActor
    init(label: String, hint: String, error: String?, look: NFieldLook) {
        let compact = look == .compact
        let body = NTypography.FontKey(GMTextStyles.body)
        let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        let hintFont = NTypography.FontKey(GMTextStyles.hint)
        let spec = { (text: String, font: NTypography.FontKey, line: Double?, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: line), tone: tone, strike: false)
        }
        self.label = label.isEmpty ? nil : spec(label, compact ? small : body, nil, compact ? .textDim : .text)
        gap = compact ? GMCompactFieldTokens.gap : GMFieldTokens.gap
        if let error, !error.isEmpty {
            note = spec(error, small, nil, .danger)
            noteGap = gap + GMFieldTokens.errorGap - GMFieldTokens.gap
        } else if !hint.isEmpty {
            note = spec(hint, hintFont, GMTextStyles.hint.lineHeight, compact ? .textFaint : .textDim)
            noteGap = gap
        } else {
            note = nil
            noteGap = 0
        }
    }

    /// The label's and the note's heights in `width`, laying them out (wrapped) for drawing.
    @MainActor
    func measure(width: CGFloat?) -> (label: CGFloat, note: CGFloat) {
        let height = { (spec: NTextSpec?) -> CGFloat in
            guard let spec else {
                return 0
            }
            let layout = spec.layout(width: width)
            spec.state.layout = layout
            return CGFloat(layout.lines.count) * spec.line.height
        }
        return (height(label), height(note))
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let origin = origin.origin
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        if let label, let layout = label.state.layout {
            NTextEngine.draw(
                layout, line: label.line, color: palette.cgColor(label.tone), strike: nil, scale: scale, in: cg)
        }
        if let note, let layout = note.state.layout {
            cg.translateBy(x: 0, y: noteTop.origin.y)
            NTextEngine.draw(
                layout, line: note.line, color: palette.cgColor(note.tone), strike: nil, scale: scale, in: cg)
        }
    }
}

/// The field's column: the label, the gap, the control, the note's gap and the note; the canvas under all of it.
private struct NFieldLayout: Layout {
    let look: NFieldTexts

    private func layout(_ subviews: Subviews, width: CGFloat?) -> (label: CGFloat, control: CGFloat, note: CGFloat) {
        let texts = MainActor.assumeIsolated { look.measure(width: width) }
        // Several controls stack with the field's gap between them, as its flex column has.
        let controls = subviews.dropFirst()
        let control = controls.reduce(0) {
            $0 + $1.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        } + CGFloat(max(0, controls.count - 1)) * look.gap
        return (texts.label, control, texts.note)
    }

    private func height(_ parts: (label: CGFloat, control: CGFloat, note: CGFloat)) -> CGFloat {
        (look.label == nil ? 0 : parts.label + look.gap) + parts.control
            + (look.note == nil ? 0 : look.noteGap + parts.note)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let parts = layout(subviews, width: width)
        let natural = subviews.dropFirst().map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return CGSize(width: width ?? natural, height: height(parts))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let parts = layout(subviews, width: bounds.width)
        look.origin.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        var y = bounds.minY + (look.label == nil ? 0 : parts.label + look.gap)
        for control in subviews.dropFirst() {
            let size = control.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            control.place(
                at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: size.height))
            y += size.height + look.gap
        }
        look.noteTop.origin.y = (look.label == nil ? 0 : parts.label + look.gap) + parts.control + look.noteGap
    }
}
