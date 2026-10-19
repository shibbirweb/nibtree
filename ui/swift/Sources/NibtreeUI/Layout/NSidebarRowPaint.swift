import NibtreeTokens
import SwiftUI

/// Where the layout put a sidebar row and how wide its shown actions are.
final class NSidebarRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var actions: CGFloat?
}

extension NSidebarRowLook {
    /// Whether the row's actions show: under the pointer, on a selected row, and always on a section.
    func showsActions(hovering: Bool) -> Bool { hovering || selected || section }

    /// Whether the detail shows: the row's buttons take its place while they show (not a section's at rest).
    func showsDetail(hovering: Bool, acts: Bool) -> Bool { !(acts && (hovering || selected)) }

    /// The whole row but its buttons: background, chevron, icon, name, path, count, ahead and behind, and detail.
    @MainActor
    func draw(
        hovering: Bool, acts: Bool, placed: NSidebarRowPlaced, size: CGSize, palette: Palette, scale: CGFloat,
        in cg: CGContext
    ) {
        if selected || hovering {
            cg.setFillColor(palette.cgColor(selected ? .selectedInactive : .hover))
            cg.fill(CGRect(origin: .zero, size: size))
        }
        let parts = parts(
            width: size.width, actions: showsActions(hovering: hovering) ? placed.actions : nil,
            actionsAcceptDetail: showsDetail(hovering: hovering, acts: acts))
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        // WebKit puts an SVG on whole device pixels: the icon's spot on the page, rounded, less the canvas's own.
        let glyph = { (name: GMIconName, points: CGFloat, x: CGFloat, tone: GMColorToken) in
            let color = palette.cgColor(tone)
            let key = NIconImages.Key(
                name: name, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            guard let image = NIconImages.image(key, color: color) else {
                return
            }
            let left = pixel(origin.x + x) - pixel(origin.x)
            let top = pixel(origin.y + (size.height - points) / 2) - pixel(origin.y)
            cg.saveGState()
            cg.translateBy(x: left, y: top + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        if let chevron = parts.chevron {
            glyph(expanded == true ? .chevronDown : .chevronRight, NIconSize.compact.points, chevron, .textDim)
        }
        if let icon, let x = parts.icon {
            glyph(icon, NIconSize.normal.points, x, current ? .accent : .text)
        }
        // Words keep the fractions WebKit draws them at; the canvas sits on whole device pixels.
        let shift = CGSize(width: origin.x - pixel(origin.x), height: origin.y - pixel(origin.y))
        let strike = gone ? palette.cgColor(.textFaint) : nil
        // `top` is the line's top in the row; nil centers the words' own line.
        let words = { (spec: NTextSpec, x: CGFloat, room: CGFloat?, strike: CGColor?, top: CGFloat?) -> CGFloat in
            let layout = NTextEngine.layout(
                spec.text, font: spec.font, kerning: spec.kerning, tabular: false, truncate: room != nil, width: room)
            let top = top ?? (size.height - spec.line.height) / 2
            cg.saveGState()
            cg.translateBy(x: shift.width + x, y: shift.height + top)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(spec.tone), strike: strike, scale: scale, in: cg,
                phase: shift.height + top)
            cg.restoreGState()
            return layout.width
        }
        drawLabel(parts: parts, words: words, strike: strike, size: size, cg: cg)
        if let count, let x = parts.count {
            _ = words(count, x, nil, nil, nil)
        }
        if var x = parts.sync {
            for (number, arrow) in [(ahead, GMIconName.arrowUp), (behind, .arrowDown)] {
                guard let number else {
                    continue
                }
                x += words(number, x, nil, nil, nil)
                glyph(arrow, NIconSize.xsmall.points, x, .textDim)
                x += NIconSize.xsmall.points + GMSpace.s2
            }
        }
        if let detail, let x = parts.detail {
            _ = words(detail, x, nil, nil, nil)
        }
    }

    /// The name, cut with an ellipsis to its room, and the path after it while there is room.
    @MainActor
    private func drawLabel(
        parts: Parts, words: (NTextSpec, CGFloat, CGFloat?, CGColor?, CGFloat?) -> CGFloat, strike: CGColor?,
        size: CGSize, cg: CGContext
    ) {
        guard parts.labelWidth > 0 else {
            return
        }
        cg.saveGState()
        cg.clip(to: CGRect(x: parts.label, y: 0, width: parts.labelWidth, height: size.height))
        let top = (size.height - label.line.height) / 2
        let name = words(label, parts.label, parts.labelWidth, strike, top)
        if let path {
            let left = name + GMSpace.s3
            let room = parts.labelWidth - left
            if room > 0 {
                // The path sits on the name's baseline, inside the name's line.
                _ = words(path, parts.label + left, room, strike, top + label.line.baseline - path.line.baseline)
            }
        }
        cg.restoreGState()
    }
}
