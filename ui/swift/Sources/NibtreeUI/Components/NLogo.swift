import NibtreeTokens
import SwiftUI

/// The app's logo: the merge mark on an accent tile, the Swift side of ui/web `Logo` (docs/components/Logo.md).
/// `large` greets on the Welcome page and About, `medium` is Settings' About, and `soft` is the empty editor's quiet
/// mark on a tinted tile. A fixed square whatever the stack around it, drawn in one canvas.
public struct NLogo: View {
    public enum Size: String, CaseIterable, Sendable {
        case normal, medium, large, soft

        var side: CGFloat {
            switch self {
            case .normal: GMLogoTokens.size
            case .medium: GMLogoTokens.mediumSize
            case .large: GMLogoTokens.largeSize
            case .soft: GMLogoTokens.softSize
            }
        }

        var radius: CGFloat {
            switch self {
            case .normal: GMLogoTokens.radius
            case .medium: GMLogoTokens.mediumRadius
            case .large: GMLogoTokens.largeRadius
            case .soft: GMLogoTokens.softRadius
            }
        }

        var icon: NIconSize {
            switch self {
            case .normal, .medium: .emphasis
            case .large: .display
            case .soft: .giant
            }
        }
    }

    /// Logo.svelte's `color-mix(in srgb, var(--accent) 12%, transparent)` behind the soft mark.
    static let softShare = 0.12

    private let size: Size
    private let label: String

    public init(size: Size = .normal, label: String = "Nibtree") {
        self.size = size
        self.label = label
    }

    public var body: some View {
        let size = size
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                let accent = palette.cgColor(.accent)
                let soft = size == .soft
                context.withCGContext { cg in
                    cg.addPath(
                        CGPath(
                            roundedRect: CGRect(origin: .zero, size: box), cornerWidth: size.radius,
                            cornerHeight: size.radius, transform: nil))
                    cg.setFillColor(soft ? accent.copy(alpha: accent.alpha * Self.softShare) ?? accent : accent)
                    cg.fillPath()
                    let color = soft ? accent : palette.cgColor(.accentText)
                    let points = size.icon.points
                    let key = NIconImages.Key(
                        name: .merge, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
                    guard let image = NIconImages.image(key, color: color) else {
                        return
                    }
                    // Centered, on whole device pixels as WebKit puts an SVG.
                    let x = ((box.width - points) / 2 * scale).rounded() / scale
                    let y = ((box.height - points) / 2 * scale).rounded() / scale
                    cg.translateBy(x: x, y: y + points)
                    cg.scaleBy(x: 1, y: -1)
                    cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                }
            }
        }
        .frame(width: size.side, height: size.side)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isImage)
    }
}
