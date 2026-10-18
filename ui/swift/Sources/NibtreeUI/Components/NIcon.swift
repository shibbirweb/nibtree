import NibtreeTokens
import SwiftUI

/// A stroke icon on a 24-point grid: the Swift side of ui/web `Icon` (docs/components/Icon.md). The outlines are
/// generated from the web icons (GMIconName) and stroked by Core Graphics into a kept bitmap (NIconImages). With no
/// `tone` it takes the color of what it sits in (the web's `currentColor`, `nibtreeCurrentColor` here), the text
/// color by default.
public struct NIcon: View {
    private let name: GMIconName
    private let size: NIconSize
    private let stroke: NIconStroke
    private let tone: NText.Tone?

    /// `tone` nil is the web's `inherit`.
    public init(_ name: GMIconName, size: NIconSize = .large, stroke: NIconStroke = .normal, tone: NText.Tone? = nil) {
        self.name = name
        self.size = size
        self.stroke = stroke
        self.tone = tone
    }

    public var body: some View {
        let name = name
        let tone = tone?.token
        let lineWidth = name == .more ? GMIconStroke.heavy : stroke.width
        let points = size.points
        // The palette and the inherited color are read while drawing, so the view itself has no environment reads.
        Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
            let color = context.environment.nibtreePalette.cgColor(tone ?? context.environment.nibtreeCurrentColor)
            let scale = max(1, context.environment.displayScale)
            let key = NIconImages.Key(name: name, points: points, lineWidth: lineWidth, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                let frame = CGRect(x: 0, y: 0, width: points, height: points)
                context.draw(Image(decorative: image, scale: scale), in: frame)
            }
        }
        .frame(width: points, height: points)
        .accessibilityHidden(true)
    }
}
