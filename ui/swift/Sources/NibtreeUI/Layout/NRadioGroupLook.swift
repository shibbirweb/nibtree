import NibtreeTokens
import SwiftUI

/// Everything a radio group draws, worked out once from its props as RadioGroup.svelte's classes do: per option the
/// radio, its label and its description (or, in `columns`, the hint in its own column).
struct NRadioGroupLook: Sendable {
    struct Item: Sendable {
        let label: NTextSpec
        let note: NTextSpec?
        let disabled: Bool
    }

    /// RadioGroup.svelte's `opacity: 0.5` on a disabled choice.
    nonisolated static let disabledOpacity = 0.5
    /// WebKit's radio: 12 points round, a 1.5 point ring, and a 3.5 point dot when chosen.
    nonisolated static let side = 12.0
    nonisolated static let ring = 1.5
    nonisolated static let dot = 3.5

    let items: [Item]
    let chosen: Int?
    let row: Bool
    let columns: Bool
    let labelWidth: CGFloat
    let placed = NRadioGroupPlaced()

    @MainActor
    init(
        labels: [String], notes: [String?], danger: [Bool], disabled: [Bool], chosen: Int?,
        direction: NRadioGroupDirection, layout: NRadioGroupLayout, labelWidth: NLabelColumn
    ) {
        let columns = layout == .columns
        let body = NTypography.FontKey(GMTextStyles.body)
        let medium = NTypography.FontKey(GMTextStyles.body, weight: GMFontWeight.medium)
        let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        items = labels.indices.map { index in
            let note = notes[index]
            // A choice with a description (and every one in columns) reads as a heading: medium weight.
            let heading = columns || note != nil
            return Item(
                label: spec(labels[index], heading ? medium : body, danger[index] ? .danger : .text),
                note: note.map { spec($0, small, columns ? .textFaint : .textDim) }, disabled: disabled[index])
        }
        self.chosen = chosen
        row = direction == .row
        self.columns = columns
        self.labelWidth = labelWidth.points
    }

    /// The gap between choices, and inside one between the radio and its words.
    var gap: CGFloat { row ? GMSpace.s7 : GMSpace.s4 }

    /// One choice's frame parts in a group `width` wide: the radio's top, the label's and note's origins, the size.
    @MainActor
    func measure(_ item: Item, width: CGFloat?) -> NRadioGroupPlaced.Choice {
        let words = Self.side + GMSpace.s3
        let label = item.label.layout(width: nil)
        item.label.state.layout = label
        if columns {
            // A grid row: the radio, the label column, then the hint; each centered on the row.
            let noteLeft = words + labelWidth + GMSpace.s3
            let note = item.note.map { $0.layout(width: width.map { max(1, $0 - noteLeft) }) }
            item.note?.state.layout = note
            let noteHeight = note.map { CGFloat($0.lines.count) * (item.note?.line.height ?? 0) } ?? 0
            let height = max(Self.side, item.label.line.height, noteHeight)
            return .init(
                radioTop: (height - Self.side) / 2, label: CGPoint(x: words, y: (height - item.label.line.height) / 2),
                note: CGPoint(x: noteLeft, y: (height - noteHeight) / 2),
                size: CGSize(width: width ?? noteLeft + (note?.width ?? 0), height: height))
        }
        let note = item.note.map { $0.layout(width: width.map { max(1, $0 - words) }) }
        item.note?.state.layout = note
        let noteHeight = note.map { GMSpace.s1 + CGFloat($0.lines.count) * (item.note?.line.height ?? 0) } ?? 0
        let wordsWidth = max(label.width, note?.width ?? 0)
        let height = max(GMSpace.s1 + Self.side, item.label.line.height + noteHeight)
        return .init(
            radioTop: GMSpace.s1, label: CGPoint(x: words, y: 0),
            note: CGPoint(x: words, y: item.label.line.height + GMSpace.s1),
            size: CGSize(width: words + wordsWidth, height: height))
    }

    @MainActor
    func draw(palette: Palette, scale: CGFloat, environment: EnvironmentValues, in cg: CGContext) {
        let colors = NWebKitColors.colors(dark: palette.isDark)
        let origin = placed.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        for (index, item) in items.enumerated() where index < placed.choices.count {
            let choice = placed.choices[index]
            cg.saveGState()
            cg.translateBy(x: choice.origin.x, y: choice.origin.y)
            if item.disabled {
                cg.setAlpha(Self.disabledOpacity)
                cg.beginTransparencyLayer(auxiliaryInfo: nil)
            }
            let strength = item.disabled ? Self.disabledOpacity : 1
            radio(
                on: index == chosen, top: choice.radioTop, colors: colors, strength: strength, environment: environment,
                in: cg)
            for (spec, spot) in [(item.label, choice.label), (item.note, choice.note)] {
                guard let spec, let layout = spec.state.layout else {
                    continue
                }
                cg.saveGState()
                cg.translateBy(x: spot.x + phase.x, y: spot.y + phase.y)
                NTextEngine.draw(
                    layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg)
                cg.restoreGState()
            }
            if item.disabled {
                cg.endTransparencyLayer()
            }
            cg.restoreGState()
        }
    }

    /// WebKit's radio in the system's colors, at half strength when disabled.
    private func radio(
        on: Bool, top: CGFloat, colors: NWebKitColors, strength: Double, environment: EnvironmentValues,
        in cg: CGContext
    ) {
        let box = CGRect(x: 0, y: top, width: Self.side, height: Self.side)
        // The system colors resolved in the canvas's own appearance, as SwiftUI fills them for the checkbox.
        let cgColor = { (color: Color) in color.opacity(strength).resolve(in: environment).cgColor }
        if on {
            cg.setFillColor(cgColor(colors.accent))
            cg.fillEllipse(in: box)
            cg.setFillColor(CGColor(gray: 1, alpha: strength))
            cg.fillEllipse(
                in: CGRect(x: box.midX - Self.dot / 2, y: box.midY - Self.dot / 2, width: Self.dot, height: Self.dot))
            return
        }
        // The control background sits half a point in, so the ring's outer edge shows the panel through it.
        cg.setFillColor(cgColor(colors.inside))
        cg.fillEllipse(in: box.insetBy(dx: 0.5, dy: 0.5))
        cg.addEllipse(in: box)
        cg.addEllipse(in: box.insetBy(dx: Self.ring, dy: Self.ring))
        cg.setFillColor(cgColor(colors.ring))
        cg.fillPath(using: .evenOdd)
    }
}

/// Where each choice went, set by the frame.
final class NRadioGroupPlaced: @unchecked Sendable {
    struct Choice: Sendable {
        let radioTop: CGFloat
        let label: CGPoint
        let note: CGPoint
        let size: CGSize
        var origin = CGPoint.zero
    }

    var origin = CGPoint.zero
    var choices: [Choice] = []

    /// The choice at `spot` from the group's corner, if any.
    func index(at spot: CGPoint) -> Int? {
        choices.firstIndex { CGRect(origin: $0.origin, size: $0.size).contains(spot) }
    }
}
