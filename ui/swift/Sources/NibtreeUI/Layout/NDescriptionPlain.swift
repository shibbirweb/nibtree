import NibtreeTokens
import SwiftUI

/// A description list of plain values: every label and value drawn by one canvas, until the pointer comes over the
/// list (or VoiceOver is on), when the values become selectable text. A selectable text for each value, each watching
/// the pointer, cost a commit's three rows more than the web's whole list.
struct NDescriptionPlain: View {
    let look: NDescriptionLook
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var live = false

    var body: some View {
        if live || voiceOver {
            NDescriptionLayout {
                ForEach(look.items, id: \.label) { item in
                    NText(item.label, tone: .dim, size: .small)
                    NText(item.value, size: .small, mono: item.mono, selectable: true)
                }
            }
        } else {
            let look = look
            NDescriptionPlainFrame(look: look) {
                Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                    MainActor.assumeIsolated {
                        let palette = context.environment.nibtreePalette
                        let scale = max(1, context.environment.displayScale)
                        context.withCGContext { cg in
                            look.draw(palette: palette, scale: scale, in: cg)
                        }
                    }
                }
            }
            .onHover { inside in
                if inside {
                    live = true
                }
            }
        }
    }
}

/// The list's texts and, once laid out, where each one goes.
struct NDescriptionLook: Sendable {
    let items: [NDescriptionItem]
    let labels: [NTextSpec]
    let values: [NTextSpec]
    let state = NDescriptionState()

    @MainActor
    init(items: [NDescriptionItem]) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        let mono = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small, mono: true)
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        self.items = items
        labels = items.map { spec($0.label, font, .textDim) }
        values = items.map { spec($0.value, $0.mono ? mono : font, .text) }
    }

    /// The labels' column, each value laid out in the rest of `width`, and each row's height.
    @MainActor
    func measure(width: CGFloat?) -> (label: CGFloat, values: [NTextEngine.Layout], rows: [CGFloat]) {
        let labelLayouts = labels.map { $0.layout(width: nil) }
        let column = labelLayouts.map(\.width).max() ?? 0
        let room = width.map { max(0, $0 - column - GMDescriptionListTokens.columnGap) }
        let valueLayouts = values.map { $0.layout(width: room) }
        let rows = zip(labels.indices, valueLayouts).map { index, layout in
            max(labels[index].line.height, CGFloat(layout.lines.count) * values[index].line.height)
        }
        return (column, valueLayouts, rows)
    }

    @MainActor
    func draw(palette: Palette, scale: CGFloat, in cg: CGContext) {
        guard let placed = state.placed else {
            return
        }
        let origin = state.origin
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        var y: CGFloat = 0
        for (index, row) in placed.rows.enumerated() {
            let label = labels[index]
            cg.saveGState()
            cg.translateBy(x: 0, y: y)
            if let layout = label.state.layout {
                NTextEngine.draw(
                    layout, line: label.line, color: palette.cgColor(label.tone), strike: nil, scale: scale, in: cg)
            }
            cg.translateBy(x: placed.label + GMDescriptionListTokens.columnGap, y: 0)
            NTextEngine.draw(
                placed.values[index], line: values[index].line, color: palette.cgColor(.text), strike: nil,
                scale: scale, in: cg)
            cg.restoreGState()
            y += row + GMDescriptionListTokens.rowGap
        }
    }
}

/// Where the list was placed and its laid-out values.
final class NDescriptionState: @unchecked Sendable {
    var origin = CGPoint.zero
    var placed: (label: CGFloat, values: [NTextEngine.Layout], rows: [CGFloat])?
}

/// Sizes the list like CSS grid's `auto 1fr`: as wide as offered (or its widest row), its rows stacked.
private struct NDescriptionPlainFrame: Layout {
    let look: NDescriptionLook

    private static func height(_ rows: [CGFloat]) -> CGFloat {
        rows.reduce(0, +) + CGFloat(max(0, rows.count - 1)) * GMDescriptionListTokens.rowGap
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return MainActor.assumeIsolated {
            let measured = look.measure(width: width)
            let natural = measured.label + GMDescriptionListTokens.columnGap + (measured.values.map(\.width).max() ?? 0)
            return CGSize(width: width ?? natural, height: Self.height(measured.rows))
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let measured = look.measure(width: bounds.width)
            for label in look.labels {
                label.state.layout = label.layout(width: nil)
            }
            look.state.placed = measured
        }
        look.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
