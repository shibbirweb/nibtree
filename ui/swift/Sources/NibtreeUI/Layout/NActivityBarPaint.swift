import NibtreeTokens
import SwiftUI

/// The activity bar's drawing: its fill and line, then each entry in the box `NActivityBarPlaced` gives it.
enum NActivityBarPaint {
    /// ActivityBar.svelte's `color-mix(in srgb, var(--accent) 12%, transparent)` behind the open button.
    static let activeShare = 0.12

    @MainActor
    static func draw(
        entries: [NActivityEntry], placed: NActivityBarPlaced, active: String?, hovered: Int?, side: NActivityBarSide,
        size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        cg.setFillColor(palette.cgColor(.panelAlt))
        cg.fill(CGRect(origin: .zero, size: size))
        cg.setFillColor(palette.cgColor(.borderStrong))
        cg.fill(CGRect(x: side == .left ? size.width - 1 : 0, y: 0, width: 1, height: size.height))
        // The buttons are centered in the room the line leaves.
        let left = (side == .left ? 0 : 1) + (size.width - 1 - GMActivityBarTokens.item) / 2
        for (index, entry) in entries.enumerated() where placed.tops.indices.contains(index) {
            let top = placed.tops[index]
            switch entry {
            case .spacer:
                continue
            case .divider:
                let width = GMActivityBarTokens.separatorWidth
                cg.setFillColor(palette.cgColor(.borderStrong))
                cg.fill(
                    CGRect(
                        x: (side == .left ? 0 : 1) + (size.width - 1 - width) / 2,
                        y: top + GMActivityBarTokens.separatorSpace, width: width, height: 1))
            case .item(let item):
                let box = CGRect(
                    x: left, y: top, width: GMActivityBarTokens.item, height: GMActivityBarTokens.item)
                let on = item.active ?? (item.id == active)
                button(item, box: box, on: on, hovered: index == hovered, side: side, palette: palette, scale: scale,
                    in: cg)
            }
        }
    }

    @MainActor
    private static func button(
        _ item: NActivityItem, box: CGRect, on: Bool, hovered: Bool, side: NActivityBarSide, palette: Palette,
        scale: CGFloat, in cg: CGContext
    ) {
        let radius = GMActivityBarTokens.radius
        if on || hovered {
            let fill = on
                ? palette.cgColor(.accent).copy(alpha: activeShare) ?? palette.cgColor(.accent)
                : palette.cgColor(.hover)
            cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
            cg.setFillColor(fill)
            cg.fillPath()
        }
        if on {
            let width = GMActivityBarTokens.indicator
            let bar = CGRect(
                x: side == .left ? box.minX - GMSpace.s2 : box.maxX + GMSpace.s2 - width, y: box.minY + GMSpace.s4,
                width: width, height: box.height - 2 * GMSpace.s4)
            let corner = min(GMRadius.tiny, width / 2)
            cg.addPath(CGPath(roundedRect: bar, cornerWidth: corner, cornerHeight: corner, transform: nil))
            cg.setFillColor(palette.cgColor(.accent))
            cg.fillPath()
        }
        let points = (item.smallIcon ? NIconSize.xlarge : NIconSize.activity).points
        let color = palette.cgColor(on ? .accent : hovered ? .text : .textDim)
        let key = NIconImages.Key(
            name: item.icon, points: points, lineWidth: NIconStroke.light.width, scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            // WebKit puts an SVG on whole device pixels.
            let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
            cg.saveGState()
            cg.translateBy(x: pixel(box.midX - points / 2), y: pixel(box.midY - points / 2) + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        if item.dot {
            let dot = GMActivityBarTokens.dot
            let spot = CGRect(
                x: box.maxX - GMActivityBarTokens.dotInset - dot, y: box.minY + GMActivityBarTokens.dotInset,
                width: dot, height: dot)
            let ring = GMActivityBarTokens.dotRing
            cg.setFillColor(palette.cgColor(.panelAlt))
            cg.fillEllipse(in: spot.insetBy(dx: -ring, dy: -ring))
            cg.setFillColor(palette.cgColor(.accent))
            cg.fillEllipse(in: spot)
        }
        if let badge = item.badge, badge > 0 {
            NBadge.paint(
                count: badge, tone: item.badgeTone,
                corner: CGPoint(x: box.maxX - 1, y: box.maxY - GMActivityBarTokens.badgeBottom), palette: palette,
                scale: scale, in: cg)
        }
    }
}
