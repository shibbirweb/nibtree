import NibtreeTokens
import SwiftUI

extension NFileRowLook {
    /// The whole row but its buttons: background, checkbox, status letter, file icon, words and tag.
    @MainActor
    func draw(hovering: Bool, placed: NFileRowPlaced, size: CGSize, in context: GraphicsContext) {
        let palette = context.environment.nibtreePalette
        let scale = max(1, context.environment.displayScale)
        let parts = parts(width: size.width, actions: hovering ? placed.actions : nil)
        if selected || hovering {
            context.withCGContext { cg in
                cg.setFillColor(palette.cgColor(selected ? .selectedInactive : .hover))
                cg.fill(CGRect(origin: .zero, size: size))
            }
        }
        if let checked, let x = parts.checkbox {
            var box = context
            box.translateBy(x: x, y: (size.height - NCheckboxBox.side) / 2)
            NCheckboxBox.paint(
                box, NWebKitColors.colors(dark: palette.isDark), mark: checked ? .check : nil, strength: 1)
        }
        context.withCGContext { cg in
            paint(parts: parts, placed: placed, size: size, palette: palette, scale: scale, in: cg)
        }
    }

    /// Everything after the checkbox, drawn with Core Graphics.
    @MainActor
    private func paint(
        parts: Parts, placed: NFileRowPlaced, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let shift = CGSize(width: origin.x - pixel(origin.x), height: origin.y - pixel(origin.y))
        // `top` is the line's top in the row; nil centers the words' own line. Returns the width drawn.
        let words = {
            (spec: NTextSpec, x: CGFloat, room: CGFloat?, color: CGColor, strike: CGColor?, top: CGFloat?) -> CGFloat in
            let layout = NTextEngine.layout(
                spec.text, font: spec.font, kerning: 0, tabular: false, truncate: room != nil, width: room)
            let top = top ?? (size.height - spec.line.height) / 2
            cg.saveGState()
            cg.translateBy(x: shift.width + x, y: shift.height + top)
            NTextEngine.draw(
                layout, line: spec.line, color: color, strike: strike, scale: scale, in: cg, phase: shift.height + top)
            cg.restoreGState()
            return layout.width
        }
        let letterWidth = width(letter)
        _ = words(
            letter, parts.letter + (GMFileRowTokens.letterWidth - letterWidth) / 2, nil,
            NStatusLetter.color(kind, palette), nil, nil)
        if let icon, let x = parts.icon {
            let points = NIconSize.normal.points
            let color: CGColor? = if case .mask(_, let tone) = icon { palette.cgColor(tone) } else { nil }
            if let image = NFileIconImages.image(icon, points: points, scale: scale, color: color) {
                // WebKit puts an image on whole device pixels: its spot on the page, rounded, less the canvas's own.
                let left = pixel(origin.x + x) - pixel(origin.x)
                let top = pixel(origin.y + (size.height - points) / 2) - pixel(origin.y)
                cg.saveGState()
                cg.translateBy(x: left, y: top + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        paintText(parts: parts, words: words, palette: palette, size: size, cg: cg)
        if let tag, let x = parts.tag, let tagWidth {
            let box = CGRect(
                x: shift.width + x, y: shift.height + (size.height - tag.line.height - 2 * Self.tagBorder) / 2,
                width: tagWidth, height: tag.line.height + 2 * Self.tagBorder)
            let radius = GMRadius.small
            let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
            let inner = CGPath(
                roundedRect: box.insetBy(dx: Self.tagBorder, dy: Self.tagBorder), cornerWidth: radius - Self.tagBorder,
                cornerHeight: radius - Self.tagBorder, transform: nil)
            cg.addPath(outer)
            cg.addPath(inner)
            cg.setFillColor(palette.cgColor(.borderStrong))
            cg.fillPath(using: .evenOdd)
            _ = words(
                tag, x + Self.tagBorder + GMFileRowTokens.tagPaddingX, nil, palette.cgColor(.textDim), nil,
                (size.height - tag.line.height) / 2)
        }
    }

    /// The name, then the folder and the note on its baseline, cut with an ellipsis where the room ends.
    @MainActor
    private func paintText(
        parts: Parts, words: (NTextSpec, CGFloat, CGFloat?, CGColor, CGColor?, CGFloat?) -> CGFloat,
        palette: Palette, size: CGSize, cg: CGContext
    ) {
        guard parts.textWidth > 0 else {
            return
        }
        cg.saveGState()
        cg.clip(to: CGRect(x: parts.text, y: 0, width: parts.textWidth, height: size.height))
        let top = (size.height - name.line.height) / 2
        let strike = deleted ? palette.cgColor(.textFaint) : nil
        var used = words(name, parts.text, parts.textWidth, palette.cgColor(name.tone), strike, top)
        for spec in [directory, note].compactMap({ $0 }) {
            let room = parts.textWidth - used - directoryMargin
            guard room > 0 else {
                break
            }
            let x = parts.text + used + directoryMargin
            let drawn = words(
                spec, x, room, palette.cgColor(spec.tone), nil, top + name.line.baseline - spec.line.baseline)
            used += directoryMargin + drawn
        }
        cg.restoreGState()
    }
}
