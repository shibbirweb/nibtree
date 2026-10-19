import NibtreeTokens
import SwiftUI

extension NEditorTabLook {
    /// The tab's fill: the open tab's, the pointer's, or none (a single tab has no frame).
    func fill(hovering: Bool) -> GMColorToken? {
        if layout == .single {
            return nil
        }
        if rounded {
            if active {
                return focused ? .selected : .selectedInactive
            }
            return hovering ? .hover : nil
        }
        return active || lifted ? .editorBg : hovering ? .hover : nil
    }

    /// The tab but its close button: shadow, fill, lines, icon, name and hint, in a canvas `reach` larger on each
    /// side than the tab when it is lifted (for the shadow).
    @MainActor
    func draw(hovering: Bool, placed: NEditorTabPlaced, reach: CGFloat, size: CGSize, palette: Palette,
        scale: CGFloat, in cg: CGContext
    ) {
        let box = CGRect(x: reach, y: reach, width: size.width - 2 * reach, height: size.height - 2 * reach)
        let radius = rounded ? GMEditorTabTokens.roundedRadius : 0
        let outline = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        if lifted {
            let shadow = GMShadows.popup
            let shade = palette.isDark ? shadow.dark : shadow.light
            cg.saveGState()
            cg.setShadow(
                offset: CGSize(width: shadow.x, height: shadow.y), blur: shadow.blur,
                color: CGColor(
                    srgbRed: shade.red / 255, green: shade.green / 255, blue: shade.blue / 255, alpha: shade.alpha))
            cg.addPath(outline)
            cg.setFillColor(palette.cgColor(.editorBg))
            cg.fillPath()
            cg.restoreGState()
        }
        if let fill = fill(hovering: hovering) {
            cg.addPath(outline)
            cg.setFillColor(palette.cgColor(fill))
            cg.fillPath()
        }
        lines(box: box, outline: outline, palette: palette, in: cg)
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let shift = CGSize(width: origin.x - pixel(origin.x), height: origin.y - pixel(origin.y))
        var x = box.minX + outerLeft + mainLeft
        let gap = GMTabStripTokens.gap
        if let icon = tab.icon {
            let points = NIconSize.medium.points
            let tone = tab.iconTone.map(\.token) ?? tone
            let color = palette.cgColor(tone).copy(alpha: Self.iconOpacity) ?? palette.cgColor(tone)
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                cg.saveGState()
                cg.translateBy(
                    x: pixel(origin.x + x) - pixel(origin.x),
                    y: pixel(origin.y + box.minY + (box.height - bottomLine - points) / 2) - pixel(origin.y) + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
            x += points + gap
        }
        let hintWidth = hint.map { NTextMetrics.width(of: $0.text, font: $0.font, kerning: 0) } ?? 0
        let end = box.maxX - outerRight - (closable ? GMTabStripTokens.closeSize : 0) - mainRight
        let room = max(0, end - x - (hint == nil ? 0 : gap + hintWidth))
        let words = { (spec: NTextSpec, left: CGFloat, width: CGFloat?, color: CGColor) -> CGFloat in
            let layout = NTextEngine.layout(
                spec.text, font: spec.font, kerning: 0, tabular: false, truncate: width != nil, width: width)
            let top = shift.height + box.minY + (box.height - bottomLine - spec.line.height) / 2
            cg.saveGState()
            cg.translateBy(x: shift.width + left, y: top)
            NTextEngine.draw(layout, line: spec.line, color: color, strike: nil, scale: scale, in: cg, phase: top)
            cg.restoreGState()
            return layout.width
        }
        // SwiftUI rounds the tab to device pixels, which can leave a fitting name a hair short of its room.
        let cut = nameWidth > room + Self.fitSlack ? room : nil
        let drawn = words(name, x, cut, palette.cgColor(tone))
        if let hint {
            _ = words(hint, x + (cut == nil ? drawn : min(drawn, room)) + gap, nil, palette.cgColor(.textFaint))
        }
    }

    /// The tab's frame lines: a flat tab's right line, a wrapped one's bottom line, the open tab's top bar, a rounded
    /// open tab's outline.
    @MainActor
    private func lines(box: CGRect, outline: CGPath, palette: Palette, in cg: CGContext) {
        let strong = palette.cgColor(.borderStrong)
        if rounded {
            guard active, layout != .single else {
                return
            }
            let edge = focused
                ? NAvatarFace.mix(palette.cgColor(.accent), palette.cgColor(.editorBg), share: Self.roundedShare)
                : strong
            let radius = GMEditorTabTokens.roundedRadius - Self.border
            cg.addPath(outline)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius,
                    cornerHeight: radius, transform: nil))
            cg.setFillColor(edge)
            cg.fillPath(using: .evenOdd)
            return
        }
        guard layout != .single else {
            return
        }
        cg.setFillColor(strong)
        cg.fill(CGRect(x: box.maxX - Self.border, y: box.minY, width: Self.border, height: box.height))
        if layout == .wrap {
            cg.fill(CGRect(x: box.minX, y: box.maxY - Self.border, width: box.width, height: Self.border))
        }
        if active {
            cg.setFillColor(focused ? palette.cgColor(.accent) : strong)
            cg.fill(
                CGRect(
                    x: box.minX, y: box.minY, width: box.width - Self.border, height: GMTabStripTokens.indicator))
        }
    }
}
