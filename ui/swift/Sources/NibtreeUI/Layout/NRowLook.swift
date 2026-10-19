import NibtreeTokens
import SwiftUI

/// Which of a row's views are its face and its actions; the others are its content.
enum NRowPart: LayoutValueKey {
    static let defaultValue = Part.content

    enum Part {
        case face, content, actions
    }
}

/// Everything a row draws and measures, from Row.svelte's classes.
struct NRowLook: Sendable {
    let size: NRowSize
    let selected: Bool
    let disabled: Bool
    let depth: Int
    let expanded: NRowExpanded?
    let align: NRowAlign
    let alwaysShown: Bool
    let line: Bool
    let mark: Bool
    let interactive: Bool
    /// Whether the row has actions.
    let acts: Bool
    let placed = NRowPlaced()

    var gap: CGFloat {
        typealias T = GMRowTokens
        return switch size {
        case .tree: T.treeGap
        case .list: T.listGap
        case .history: T.historyGap
        case .entry: T.entryGap
        case .large: T.largeGap
        case .section: T.sectionGap
        case .group: T.groupGap
        }
    }

    /// The padding on each side; an indent adds `depth` steps to the start.
    var padding: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat) {
        typealias T = GMRowTokens
        let (y, start, end): (CGFloat, CGFloat, CGFloat) =
            switch size {
            case .tree: (0, T.treePaddingX, T.treePaddingX)
            case .list: (0, T.listPaddingX, T.listPaddingX)
            case .history: (0, T.historyPaddingX, T.historyPaddingX)
            case .entry: (T.entryPaddingY, T.entryPaddingX, T.entryPaddingX)
            case .large: (T.largePaddingY, T.largePaddingX, T.largePaddingX)
            case .section: (0, T.sectionPaddingX, T.sectionPaddingX)
            case .group: (0, T.groupPaddingLeft, T.groupPaddingRight)
            }
        return (y, start + CGFloat(max(0, depth)) * T.indent, y + (line ? 1 : 0), end)
    }

    /// The row's height for content this tall: the token height, or the content and padding (at least the minimum).
    func height(content: CGFloat) -> CGFloat {
        typealias T = GMRowTokens
        let padding = self.padding
        let natural = content + padding.top + padding.bottom
        return switch size {
        case .tree: T.treeHeight
        case .list: T.listHeight
        case .history: T.historyHeight
        case .group: T.groupHeight
        case .entry: natural
        case .large: max(T.largeMinHeight, natural)
        case .section: max(T.sectionHeight, natural)
        }
    }

    @MainActor
    func draw(hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let box = CGRect(origin: .zero, size: size)
        let hover: GMColorToken? = hovering && interactive ? .hover : nil
        let fill: GMColorToken? = disabled ? nil : selected ? .selectedInactive : hover
        if let fill {
            let radius = self.size == .large ? GMRowTokens.largeRadius : 0
            cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
            cg.setFillColor(palette.cgColor(fill))
            cg.fillPath()
        }
        if line {
            cg.setFillColor(palette.cgColor(.border))
            cg.fill(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1))
        }
        if mark {
            let inset = GMRowTokens.markInset
            let stripe = CGRect(x: 0, y: inset, width: GMRowTokens.markWidth, height: size.height - 2 * inset)
            let tiny = GMRadius.tiny
            let path = CGMutablePath()
            path.move(to: CGPoint(x: stripe.minX, y: stripe.minY))
            // Square on the left edge, rounded on the right (`border-radius: 0 tiny tiny 0`).
            let topRight = CGPoint(x: stripe.maxX, y: stripe.minY)
            let bottomRight = CGPoint(x: stripe.maxX, y: stripe.maxY)
            path.addArc(tangent1End: topRight, tangent2End: bottomRight, radius: tiny)
            path.addArc(tangent1End: bottomRight, tangent2End: CGPoint(x: stripe.minX, y: stripe.maxY), radius: tiny)
            path.addLine(to: CGPoint(x: stripe.minX, y: stripe.maxY))
            path.closeSubpath()
            cg.addPath(path)
            cg.setFillColor(palette.cgColor(.accent))
            cg.fillPath()
        }
        guard let expanded, expanded != .leaf, let chevronTop = placed.chevronTop else {
            return
        }
        let points = NIconSize.compact.points
        let color = palette.cgColor(.textDim)
        let key = NIconImages.Key(
            name: expanded == .open ? .chevronDown : .chevronRight, points: points,
            lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        guard let image = NIconImages.image(key, color: color) else {
            return
        }
        // On whole device pixels as WebKit puts an SVG, from the canvas's own (rounded) corner.
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let x = pixel(padding.left + (GMRowTokens.chevron - points) / 2 + origin.x) - pixel(origin.x)
        let y = pixel(chevronTop + origin.y) - pixel(origin.y)
        cg.translateBy(x: x, y: y + points)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
    }
}

/// Where the row was placed and its chevron's top.
final class NRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var chevronTop: CGFloat?
}
