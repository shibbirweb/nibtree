import AppKit
import NibtreeTokens

/// File type icons drawn from their SVG files into bitmaps, kept by file, size, screen scale and (for a mask) color,
/// like `NIconImages`. AppKit reads SVG itself, so the native app shows the same Material and Minimal files as the
/// web one.
enum NFileIconImages {
    struct Key: Hashable {
        let view: NFileIconView
        let points: CGFloat
        let scale: CGFloat
        /// A mask's color as 8-bit RGBA; 0 for an image, which keeps its own colors.
        let rgba: UInt32
    }

    private final class Store: @unchecked Sendable {
        let lock = NSLock()
        var images: [Key: CGImage] = [:]
        var files: [URL: NSImage] = [:]
    }

    private static let store = Store()

    static func image(_ view: NFileIconView, points: CGFloat, scale: CGFloat, color: CGColor?) -> CGImage? {
        let key = Key(view: view, points: points, scale: scale, rgba: color.map(NIconImages.Key.pack) ?? 0)
        store.lock.lock()
        defer { store.lock.unlock() }
        if let image = store.images[key] {
            return image
        }
        guard let image = draw(view, points: points, scale: scale, color: color) else {
            return nil
        }
        if store.images.count >= NIconImages.limit {
            store.images.removeAll(keepingCapacity: true)
            store.files.removeAll(keepingCapacity: true)
        }
        store.images[key] = image
        return image
    }

    private static func file(_ url: URL) -> NSImage? {
        if let image = store.files[url] {
            return image
        }
        let image = NSImage(contentsOf: url)
        store.files[url] = image
        return image
    }

    private static func draw(_ view: NFileIconView, points: CGFloat, scale: CGFloat, color: CGColor?) -> CGImage? {
        let url: URL = switch view {
        case .image(let url), .mask(let url, _): url
        }
        let pixels = Int((points * scale).rounded(.up))
        guard let svg = file(url), pixels > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
            let cg = CGContext(
                data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else {
            return nil
        }
        let box = CGRect(x: 0, y: 0, width: pixels, height: pixels)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: false)
        // `contain`: the whole picture, centered, as big as the square allows.
        let fit = min(box.width / max(1, svg.size.width), box.height / max(1, svg.size.height))
        let size = CGSize(width: svg.size.width * fit, height: svg.size.height * fit)
        svg.draw(in: CGRect(x: (box.width - size.width) / 2, y: (box.height - size.height) / 2, width: size.width,
            height: size.height))
        NSGraphicsContext.restoreGraphicsState()
        if let color {
            // A mask: the theme color wherever the picture is.
            cg.setBlendMode(.sourceIn)
            cg.setFillColor(color)
            cg.fill(box)
        }
        return cg.makeImage()
    }
}
