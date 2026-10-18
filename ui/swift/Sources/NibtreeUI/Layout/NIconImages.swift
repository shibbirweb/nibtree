import CoreGraphics
import Foundation
import NibtreeTokens

/// Icons stroked by Core Graphics into bitmaps, kept by icon, size, stroke, color and screen scale. SwiftUI's own
/// renderer flattens curves into chords inside the curve, so its circles and rounded corners came out a tenth of a
/// pixel smaller than WebKit's (Core Graphics); a bitmap matches WebKit exactly, and drawing a kept bitmap is faster
/// than stroking the path again. The store is small (a 16-point icon is 4 KB at 2x) and starts over when full.
enum NIconImages {
    struct Key: Hashable {
        let name: GMIconName
        let points: CGFloat
        let lineWidth: CGFloat
        let scale: CGFloat
        let rgba: [CGFloat]

        init(name: GMIconName, points: CGFloat, lineWidth: CGFloat, scale: CGFloat, color: CGColor) {
            self.name = name
            self.points = points
            self.lineWidth = lineWidth
            self.scale = scale
            rgba = color.components ?? []
        }
    }

    /// Enough for every icon a window shows in both themes; past it the store empties and refills.
    static let limit = 512

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
        guard let image = draw(key, color: color) else {
            return nil
        }
        if store.images.count >= limit {
            store.images.removeAll(keepingCapacity: true)
        }
        store.images[key] = image
        return image
    }

    private static func draw(_ key: Key, color: CGColor) -> CGImage? {
        let pixels = Int((key.points * key.scale).rounded(.up))
        guard pixels > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
            let cg = CGContext(
                data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else {
            return nil
        }
        // The grid's y runs down like SVG's; a bitmap's runs up.
        cg.translateBy(x: 0, y: CGFloat(pixels))
        cg.scaleBy(x: key.points * key.scale / 24, y: -key.points * key.scale / 24)
        cg.addPath(NIconOutlines.path(key.name))
        cg.setStrokeColor(color)
        cg.setLineWidth(key.lineWidth)
        cg.setLineCap(.round)
        cg.setLineJoin(.round)
        cg.strokePath()
        return cg.makeImage()
    }
}

/// Each icon's CGPath, built from its generated steps the first time it draws and kept (a CGPath is immutable).
enum NIconOutlines {
    private final class Store: @unchecked Sendable {
        let lock = NSLock()
        var paths: [GMIconName: CGPath] = [:]
    }

    private static let store = Store()

    static func path(_ name: GMIconName) -> CGPath {
        store.lock.lock()
        defer { store.lock.unlock() }
        if let path = store.paths[name] {
            return path
        }
        let path = build(name.ops)
        store.paths[name] = path
        return path
    }

    static func build(_ ops: [GMIconOp]) -> CGPath {
        let path = CGMutablePath()
        for step in ops {
            switch step {
            case .m(let x, let y): path.move(to: CGPoint(x: x, y: y))
            case .l(let x, let y): path.addLine(to: CGPoint(x: x, y: y))
            case .c(let x1, let y1, let x2, let y2, let x, let y):
                path.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: x1, y: y1), control2: CGPoint(x: x2, y: y2))
            case .z: path.closeSubpath()
            }
        }
        return path
    }
}
