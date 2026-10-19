import Foundation

/// Image zoom for media previews, the Swift side of ui/web `logic/zoom.ts`: fixed steps for zoom in and out, the zoom
/// that fits an image (or both images of a compare) in its box, and the zoom's words.
public enum NZoom {
    public static let steps: [Double] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]

    /// The next zoom step above (`up`) or below the current zoom, which may sit between steps.
    public static func next(_ current: Double, up: Bool) -> Double {
        if up {
            return steps.first { $0 > current + 0.001 } ?? steps[steps.count - 1]
        }
        return steps.last { $0 < current - 0.001 } ?? steps[0]
    }

    /// The zoom that fits the whole image in the box; small images keep their real size.
    public static func fit(_ natural: CGSize?, box: CGSize) -> Double {
        guard let natural, natural.width > 0, natural.height > 0, box.width > 0, box.height > 0 else {
            return 1
        }
        return min(1, box.width / natural.width, box.height / natural.height)
    }

    /// One zoom for several images, so a compare shows them at the same scale: the smallest fit.
    public static func sharedFit(_ naturals: [CGSize?], box: CGSize) -> Double {
        naturals.compactMap { $0 }.map { fit($0, box: box) }.min() ?? 1
    }

    /// The zoom in percent, like "150%".
    public static func label(_ zoom: Double) -> String {
        "\(Int((zoom * 100).rounded()))%"
    }
}
