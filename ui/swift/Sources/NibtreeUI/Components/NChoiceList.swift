import NibtreeTokens
import SwiftUI

/// One answer of an `NChoiceList`: its value, its label, a line of description, and whether it is a danger (a red
/// label).
public struct NChoice<Value: Hashable & Sendable>: Sendable {
    public let value: Value
    public let label: String
    public let description: String?
    public let danger: Bool

    public init(value: Value, label: String, description: String? = nil, danger: Bool = false) {
        self.value = value
        self.label = label
        self.description = description
        self.danger = danger
    }
}

/// A few answers to pick from, each a card with a label and a line of description, like "How to apply the stash?":
/// the Swift side of ui/web `ChoiceList` (docs/components/ChoiceList.md). A click calls `onPick` with the card's
/// value; with the keyboard's focus, Up and Down light a card and Return or Space picks it. One canvas draws every
/// card; VoiceOver reads them as buttons.
public struct NChoiceList<Value: Hashable & Sendable>: View {
    private let choices: [NChoice<Value>]
    private let label: String
    private let onPick: (Value) -> Void
    private let look: NChoiceListLook
    @State private var hovered: Int?

    public init(choices: [NChoice<Value>], label: String, onPick: @escaping (Value) -> Void) {
        self.choices = choices
        self.label = label
        self.onPick = onPick
        look = NChoiceListLook(
            labels: choices.map(\.label), descriptions: choices.map(\.description), dangers: choices.map(\.danger))
    }

    private func pick(_ index: Int?) {
        if let index, choices.indices.contains(index) {
            onPick(choices[index].value)
        }
    }

    public var body: some View {
        let (look, hot) = (look, hovered)
        NChoiceListFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovered: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onContinuousHover { phase in
            switch phase {
            case .active(let spot):
                hovered = look.placed.index(at: spot.y)
            case .ended:
                hovered = nil
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in pick(look.placed.index(at: spot.y)) }
        .focusable()
        .onKeyPress(keys: [.upArrow, .downArrow, .return, .space]) { press in
            switch press.key {
            case .upArrow: hovered = max(0, (hovered ?? choices.count) - 1)
            case .downArrow: hovered = min(choices.count - 1, (hovered ?? -1) + 1)
            default: pick(hovered)
            }
            return .handled
        }
        .accessibilityRepresentation {
            VStack {
                ForEach(choices.indices, id: \.self) { index in
                    Button(choices[index].label) { pick(index) }
                        .accessibilityHint(choices[index].description ?? "")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }
}

/// The cards' words, laid out for the list's width, and where each card went.
struct NChoiceListLook: Sendable {
    /// The card's `1px solid` border.
    nonisolated static let border = 1.0

    let labels: [NTextSpec]
    let descriptions: [NTextSpec?]
    let dangers: [Bool]
    let placed = NChoiceListPlaced()

    @MainActor
    init(labels: [String], descriptions: [String?], dangers: [Bool]) {
        let spec = { (text: String, font: NTypography.FontKey) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        }
        let label = NTypography.FontKey(GMTextStyles.body, weight: GMFontWeight.medium)
        let body = NTypography.FontKey(GMTextStyles.body)
        self.labels = labels.map { spec($0, label) }
        self.descriptions = descriptions.map { text in text.flatMap { $0.isEmpty ? nil : spec($0, body) } }
        self.dangers = dangers
    }

    /// The room inside a card, left and right.
    static let inset = border + GMChoiceListTokens.paddingX

    /// Each card's height in a list `width` wide, laying the words out (wrapped) for drawing.
    @MainActor
    func heights(width: CGFloat) -> [CGFloat] {
        let room = max(0, width - 2 * Self.inset)
        return labels.indices.map { index in
            let label = labels[index].layout(width: room)
            labels[index].state.layout = label
            var height = CGFloat(label.lines.count) * labels[index].line.height
            if let description = descriptions[index] {
                let layout = description.layout(width: room)
                description.state.layout = layout
                height += GMChoiceListTokens.lineGap + CGFloat(layout.lines.count) * description.line.height
            }
            return height + 2 * (GMChoiceListTokens.paddingY + Self.border)
        }
    }

    @MainActor
    func draw(hovered: Int?, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let shift = CGSize(width: origin.x - pixel(origin.x), height: origin.y - pixel(origin.y))
        let radius = GMRadius.control
        for index in labels.indices where placed.tops.indices.contains(index) {
            let card = CGRect(
                x: shift.width, y: shift.height + placed.tops[index], width: size.width,
                height: placed.heights[index])
            let outer = CGPath(roundedRect: card, cornerWidth: radius, cornerHeight: radius, transform: nil)
            cg.addPath(outer)
            cg.setFillColor(palette.cgColor(index == hovered ? .hover : .panel))
            cg.fillPath()
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: card.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                    cornerHeight: radius - Self.border, transform: nil))
            cg.setFillColor(palette.cgColor(.borderStrong))
            cg.fillPath(using: .evenOdd)
            var top = card.minY + Self.border + GMChoiceListTokens.paddingY
            let words = { (spec: NTextSpec, tone: GMColorToken) in
                guard let layout = spec.state.layout else {
                    return
                }
                cg.saveGState()
                cg.translateBy(x: card.minX + Self.inset, y: top)
                NTextEngine.draw(
                    layout, line: spec.line, color: palette.cgColor(tone), strike: nil, scale: scale, in: cg,
                    phase: top)
                cg.restoreGState()
                top += CGFloat(layout.lines.count) * spec.line.height + GMChoiceListTokens.lineGap
            }
            words(labels[index], dangers[index] ? .danger : .text)
            if let description = descriptions[index] {
                words(description, .textDim)
            }
        }
    }
}

/// Where the list was placed and each card's top and height in it.
final class NChoiceListPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var tops: [CGFloat] = []
    var heights: [CGFloat] = []

    /// The card under `y`, if any (the gaps between cards belong to none).
    func index(at y: CGFloat) -> Int? {
        tops.indices.first { y >= tops[$0] && y < tops[$0] + heights[$0] }
    }
}

/// The list's size: its cards stacked with the gap between them, as wide as the room on offer; the canvas fills it.
private struct NChoiceListFrame: Layout {
    let look: NChoiceListLook

    private func height(_ heights: [CGFloat]) -> CGFloat {
        heights.reduce(0, +) + CGFloat(max(0, heights.count - 1)) * GMChoiceListTokens.gap
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? MainActor.assumeIsolated {
            (look.labels + look.descriptions.compactMap { $0 }).map {
                NTextMetrics.width(of: $0.text, font: $0.font, kerning: 0)
            }.max() ?? 0
        } + 2 * NChoiceListLook.inset
        let heights = MainActor.assumeIsolated { look.heights(width: width) }
        return CGSize(width: width, height: height(heights))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let heights = MainActor.assumeIsolated { look.heights(width: bounds.width) }
        var y: CGFloat = 0
        look.placed.tops = heights.map { height in
            defer { y += height + GMChoiceListTokens.gap }
            return y
        }
        look.placed.heights = heights
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
