import NibtreeTokens
import SwiftUI

/// Which views of a text area are the editor and the caller's corner tools.
enum NTextAreaPart: LayoutValueKey {
    static let defaultValue = Part.face

    enum Part {
        case face, editor, tools, grip
    }
}

/// Everything a text area draws at rest, worked out once from its props as TextArea.svelte's classes do.
struct NTextAreaLook: Sendable {
    let rows: NTextAreaRows
    let height: NTextAreaHeight
    let resize: NTextAreaResize
    let invalid: Bool
    let placeholder: String
    let disabled: Bool
    let font: NTypography.FontKey
    let line: NLineBox
    /// Where the text goes and how far right it may run; set by the frame.
    let placed = NTextAreaPlaced()

    @MainActor
    init(
        rows: NTextAreaRows, height: NTextAreaHeight, resize: NTextAreaResize, invalid: Bool, mono: Bool,
        placeholder: String, disabled: Bool
    ) {
        font = NTypography.FontKey(GMTextStyles.body, size: mono ? GMFontSize.small : nil, mono: mono)
        // A mono text area and a set height use the normal line height; a plain one the font's own.
        line = NTextMetrics.lineBox(font, lineHeight: mono || height != .rows ? GMLineHeight.normal : nil)
        self.rows = rows
        self.height = height
        self.resize = resize
        self.invalid = invalid
        self.placeholder = placeholder
        self.disabled = disabled
    }

    /// The box's height: the rows' lines with padding and border, or the set height.
    var boxHeight: CGFloat {
        switch height {
        case .rows: CGFloat(rows.count) * line.height + 2 * (GMInputTokens.paddingY + NInputLook.border)
        case .short: GMTextAreaTokens.shortHeight
        case .tall: GMTextAreaTokens.tallHeight
        }
    }

    /// WebKit's text area with nothing setting its width: 20 of its font's zeros (whole points), padding and border.
    @MainActor
    var naturalWidth: CGFloat {
        let zero = NTextMetrics.width(of: "0", font: font, kerning: 0)
        return (NInputLook.defaultCharacters * zero).rounded(.up) + 2 * (GMInputTokens.paddingX + NInputLook.border)
    }

    /// The text's lines in `width` points: each paragraph wrapped on its own, an empty one kept as an empty line.
    @MainActor
    func lines(_ text: String, width: CGFloat) -> [CTLine] {
        text.components(separatedBy: "\n").flatMap { paragraph -> [CTLine] in
            if paragraph.isEmpty {
                return [CTLineCreateWithAttributedString(NSAttributedString(string: ""))]
            }
            return NTextEngine.layout(
                paragraph, font: font, kerning: 0, tabular: false, truncate: false, width: max(1, width)
            ).lines
        }
    }

    @MainActor
    func draw(value: String, focused: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let radius = GMInputTokens.radius
        let box = CGRect(origin: .zero, size: size)
        let border = NInputLook.border
        if focused {
            let ring = palette.cgColor(invalid ? .danger : .accent)
            let spread = GMInputTokens.focusRing
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: -spread, dy: -spread), cornerWidth: radius + spread,
                    cornerHeight: radius + spread, transform: nil))
            cg.setFillColor(ring.copy(alpha: ring.alpha * NInputLook.ringShare) ?? ring)
            cg.fillPath()
        }
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(.panel))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: border, dy: border), cornerWidth: radius - border,
                cornerHeight: radius - border, transform: nil))
        cg.setFillColor(palette.cgColor(invalid ? .danger : focused ? .accent : .borderStrong))
        cg.fillPath(using: .evenOdd)
        if resize == .vertical {
            let color = NWebKitColors.grip(dark: palette.isDark)
            Self.grip(corner: CGPoint(x: size.width, y: size.height), color: color, in: cg)
        }
        let shown = value.isEmpty ? placeholder : value
        let origin = placed.origin
        cg.saveGState()
        // The text scrolls inside the padding box; what runs past it is cut.
        cg.clip(to: box.insetBy(dx: border, dy: border))
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + border + GMInputTokens.paddingX,
            y: origin.y - (origin.y * scale).rounded() / scale + border + GMInputTokens.paddingY)
        if !shown.isEmpty {
            let color = value.isEmpty ? NWebKitColors.placeholder : palette.cgColor(.text)
            let layout = NTextEngine.Layout(lines: lines(shown, width: placed.room), width: placed.room)
            NTextEngine.draw(layout, line: line, color: color, strike: nil, scale: scale, in: cg)
        }
        cg.restoreGState()
    }
}

extension NTextAreaLook {
    /// WebKit's resize grip, two short diagonal strokes measured from its pictures: 1 point wide, round ended, from 6
    /// points left of and above the box's bottom right corner.
    static func grip(corner: CGPoint, color: CGColor, in cg: CGContext) {
        cg.saveGState()
        cg.setStrokeColor(color)
        cg.setLineWidth(1)
        cg.setLineCap(.round)
        for length in [8.0, 4.0] {
            cg.move(to: CGPoint(x: corner.x - 6 - length, y: corner.y - 6))
            cg.addLine(to: CGPoint(x: corner.x - 6, y: corner.y - 6 - length))
        }
        cg.strokePath()
        cg.restoreGState()
    }
}

/// The text's spot and room, set by the frame.
final class NTextAreaPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var room: CGFloat = 0
}

/// The text area's box at rest: border, background, focus ring and text in one canvas.
struct NTextAreaFace: View {
    let look: NTextAreaLook
    let value: String
    let focused: Bool

    var body: some View {
        let (look, value, focused) = (look, value, focused)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    look.draw(value: value, focused: focused, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
    }
}

/// The box's size: its height from the rows or the set one; its width the parent's for a set height (or a column
/// that stretches it), else WebKit's own. The tools sit in the top right corner and the text keeps clear of them.
struct NTextAreaFrame: Layout {
    let look: NTextAreaLook
    let grown: CGFloat
    /// The grip's square in the bottom right corner.
    static let grip: CGFloat = 16

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.naturalWidth }
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return CGSize(width: offer ?? natural, height: look.boxHeight + grown)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let tools = subviews.filter { $0[NTextAreaPart.self] == .tools }
        let sizes = tools.map { $0.sizeThatFits(.unspecified) }
        let gaps = CGFloat(max(0, sizes.count - 1)) * GMTextAreaTokens.toolsGap
        let toolsWidth = sizes.reduce(0) { $0 + $1.width } + gaps
        let paddingRight = tools.isEmpty ? GMInputTokens.paddingX : toolsWidth + GMTextAreaTokens.toolsRoom
        look.placed.origin = bounds.origin
        look.placed.room = max(0, bounds.width - 2 * NInputLook.border - GMInputTokens.paddingX - paddingRight)
        var x = bounds.maxX - GMTextAreaTokens.toolsInset - toolsWidth
        for (tool, size) in zip(tools, sizes) {
            tool.place(
                at: CGPoint(x: x, y: bounds.minY + GMTextAreaTokens.toolsInset), anchor: .topLeading,
                proposal: ProposedViewSize(size))
            x += size.width + GMTextAreaTokens.toolsGap
        }
        let inset = NInputLook.border + GMInputTokens.paddingY
        for subview in subviews {
            switch subview[NTextAreaPart.self] {
            case .face:
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            case .editor:
                subview.place(
                    at: CGPoint(x: bounds.minX + NInputLook.border + GMInputTokens.paddingX, y: bounds.minY + inset),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(width: look.placed.room, height: bounds.height - 2 * inset))
            case .grip:
                subview.place(
                    at: CGPoint(x: bounds.maxX, y: bounds.maxY), anchor: .bottomTrailing,
                    proposal: ProposedViewSize(width: Self.grip, height: Self.grip))
            case .tools:
                break
            }
        }
    }
}
