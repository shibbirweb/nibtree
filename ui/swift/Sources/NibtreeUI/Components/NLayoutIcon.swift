import NibtreeTokens
import SwiftUI

/// The drawn layout glyphs of the header and the Changes title bar: the Swift side of ui/web `LayoutIcon`
/// (docs/components/LayoutIcon.md). A window with its left or right sidebar (filled while `active`), and the commit
/// box layouts (one at the foot, or one per repository). Like the web's `currentColor` it takes the color of what it
/// sits in (`nibtreeCurrentColor`), the text color by default; drawn by Core Graphics into a kept bitmap like `NIcon`.
public struct NLayoutIcon: View {
    public enum Kind: String, CaseIterable, Sendable {
        case sidebarLeft = "sidebar-left"
        case sidebarRight = "sidebar-right"
        case commitSingle = "commit-single"
        case commitPerRepo = "commit-per-repo"
    }

    private let kind: Kind
    private let active: Bool
    private let size: NIconSize

    public init(kind: Kind, active: Bool = false, size: NIconSize = .large) {
        self.kind = kind
        self.active = active
        self.size = size
    }

    public var body: some View {
        let (kind, active, points) = (kind, active, size.points)
        Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
            let color = context.environment.nibtreePalette.cgColor(context.environment.nibtreeCurrentColor)
            let scale = max(1, context.environment.displayScale)
            let key = NLayoutIconImages.Key(
                kind: kind, active: active, points: points, scale: scale, rgba: NIconImages.Key.pack(color))
            guard let image = NLayoutIconImages.image(key, color: color) else {
                return
            }
            context.withCGContext { cg in
                cg.translateBy(x: 0, y: points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            }
        }
        .frame(width: points, height: points)
        .accessibilityHidden(true)
    }
}

/// The glyphs as kept bitmaps, by kind, fill, size, color and screen scale.
enum NLayoutIconImages {
    struct Key: Hashable {
        let kind: NLayoutIcon.Kind
        let active: Bool
        let points: CGFloat
        let scale: CGFloat
        let rgba: UInt32
    }

    /// LayoutIcon.svelte's `stroke-width`.
    static let lineWidth: CGFloat = 1.8

    private final class Store: @unchecked Sendable {
        let lock = NSLock()
        var images: [Key: CGImage] = [:]
    }

    private static let store = Store()

    static func image(_ key: Key, color: CGColor) -> CGImage? {
        store.lock.lock()
        defer { store.lock.unlock() }
        if let image = store.images[key] {
            return image
        }
        let image = NIconImages.bitmap(points: key.points, scale: key.scale) { cg in
            paint(key.kind, active: key.active, color: color, in: cg)
        }
        // Four kinds, two fills, both themes: a handful per size, so the store never needs emptying.
        store.images[key] = image
        return image
    }

    /// The SVG's shapes on its 24-point grid: SVG's default butt caps and miter joins.
    private static func paint(_ kind: NLayoutIcon.Kind, active: Bool, color: CGColor, in cg: CGContext) {
        cg.setStrokeColor(color)
        cg.setFillColor(color)
        cg.setLineWidth(lineWidth)
        cg.addPath(CGPath(
            roundedRect: CGRect(x: 3, y: 4, width: 18, height: 16), cornerWidth: 2, cornerHeight: 2, transform: nil))
        switch kind {
        case .sidebarLeft, .sidebarRight:
            let left = kind == .sidebarLeft
            line(cg, from: CGPoint(x: left ? 9 : 15, y: 4), to: CGPoint(x: left ? 9 : 15, y: 20))
            cg.strokePath()
            if active {
                cg.fill(CGRect(x: left ? 4 : 15, y: 5, width: 5, height: 14))
            }
        case .commitPerRepo:
            line(cg, from: CGPoint(x: 3, y: 12), to: CGPoint(x: 21, y: 12))
            cg.strokePath()
            bar(cg, top: 6.5)
            bar(cg, top: 14.5)
        case .commitSingle:
            line(cg, from: CGPoint(x: 7, y: 8.5), to: CGPoint(x: 17, y: 8.5))
            line(cg, from: CGPoint(x: 7, y: 11.5), to: CGPoint(x: 14, y: 11.5))
            cg.strokePath()
            bar(cg, top: 14.5)
        }
    }

    private static func line(_ cg: CGContext, from start: CGPoint, to end: CGPoint) {
        cg.move(to: start)
        cg.addLine(to: end)
    }

    /// A filled 12 by 3 bar with rounded ends.
    private static func bar(_ cg: CGContext, top: CGFloat) {
        cg.addPath(CGPath(
            roundedRect: CGRect(x: 6, y: top, width: 12, height: 3), cornerWidth: 1, cornerHeight: 1, transform: nil))
        cg.fillPath()
    }
}
