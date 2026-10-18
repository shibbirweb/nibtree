import NibtreeTokens
import SwiftUI

/// The icon the app's resolver picked for a file: a picture from the Material set, or a glyph of the Minimal set
/// filled with a theme color (the web's mask class, whose color is a token).
public enum NFileIconView: Hashable, Sendable {
    case image(URL)
    case mask(URL, tone: GMColorToken)
}

/// A file's type icon: the Swift side of ui/web `FileIcon` (docs/components/FileIcon.md). The app works out which icon
/// a file gets (Settings > Appearance > File icons) and passes it as `view`; without one it shows the plain file icon,
/// or nothing when `plain` is false. The picture is drawn from its SVG file once per size and kept.
public struct NFileIcon: View {
    private let view: NFileIconView?
    private let size: NIconSize
    private let plain: Bool

    public init(view: NFileIconView?, size: NIconSize = .normal, plain: Bool = true) {
        self.view = view
        self.size = size
        self.plain = plain
    }

    public var body: some View {
        if let view {
            NFileIconFace(view: view).frame(width: size.points, height: size.points).accessibilityHidden(true)
        } else if plain {
            NIcon(.file, size: size)
        }
    }
}

private struct NFileIconFace: View {
    let view: NFileIconView

    var body: some View {
        let view = view
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            let palette = context.environment.nibtreePalette
            let scale = max(1, context.environment.displayScale)
            let color: CGColor? = if case .mask(_, let tone) = view { palette.cgColor(tone) } else { nil }
            guard let image = NFileIconImages.image(view, points: size.width, scale: scale, color: color) else {
                return
            }
            context.withCGContext { cg in
                // A bitmap's y runs up, the canvas's down.
                cg.translateBy(x: 0, y: size.height)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(origin: .zero, size: size))
            }
        }
    }
}
