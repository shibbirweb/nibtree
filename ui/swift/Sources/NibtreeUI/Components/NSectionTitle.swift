import NibtreeTokens
import SwiftUI

/// A section title's look: `bar` is a full-height bar with a line under it (the Changes tab's lists), `list` heads a
/// list inside a tab, `caption` is a quiet line over files, `caps` small capitals (AI panel folders), `day` groups by
/// date (Local History), `group` a group of settings, `band` a tinted band across a list, `picker` a group in a
/// picker popup, and `divided` a normal-weight title with a line under it (MCP tool groups).
public enum NSectionTitleVariant: String, CaseIterable, Sendable {
    case bar, list, caption, caps, day, divided, group, band, picker
}

/// A section title's heading level for screen readers, like Settings' group titles.
public enum NSectionTitleHeading: Int, CaseIterable, Sendable {
    case two = 2, three, four
}

/// A small heading over a group of rows, with an optional count and buttons at its end: the Swift side of ui/web
/// `SectionTitle` (docs/components/SectionTitle.md). `titleMatches` marks the words a search found in the title.
/// One canvas draws the band or line, the title and the count; the title ends in an ellipsis when the room runs out.
/// A `group` keeps room above itself in a stack, less when it is the stack's first child.
public struct NSectionTitle<Actions: View>: View {
    private let look: NSectionTitleLook
    private let heading: NSectionTitleHeading?
    private let actions: Actions

    public init(
        title: String, titleMatches: [Range<Int>] = [], variant: NSectionTitleVariant = .list, count: Int? = nil,
        heading: NSectionTitleHeading? = nil, @ViewBuilder actions: () -> Actions
    ) {
        look = NSectionTitleLook(title: title, matches: titleMatches, variant: variant, count: count)
        self.heading = heading
        self.actions = actions()
    }

    public var body: some View {
        let look = look
        NSectionTitleLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NSectionTitleFace.draw(look, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
            actions
        }
        .layoutValue(
            key: NStackMargin.self,
            value: look.variant == .group
                ? NStackMargin(first: GMSectionTitleTokens.groupFirstTop, other: GMSectionTitleTokens.groupTop) : nil)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.title)
        .accessibilityAddTraits(heading == nil ? [] : .isHeader)
    }
}

extension NSectionTitle where Actions == EmptyView {
    /// A title without buttons.
    public init(
        title: String, titleMatches: [Range<Int>] = [], variant: NSectionTitleVariant = .list, count: Int? = nil,
        heading: NSectionTitleHeading? = nil
    ) {
        self.init(title: title, titleMatches: titleMatches, variant: variant, count: count, heading: heading) {
            EmptyView()
        }
    }
}

enum NSectionTitleFace {
    /// HighlightText's `search` tint behind a match: `color-mix(in srgb, var(--warning) 40%, transparent)`.
    static let matchShare = 0.4

    @MainActor
    static func draw(_ look: NSectionTitleLook, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        switch look.variant {
        case .band:
            cg.setFillColor(palette.cgColor(.panelAlt))
            cg.fill(CGRect(origin: .zero, size: size))
            cg.setFillColor(palette.cgColor(.border))
            cg.fill(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1))
        case .bar, .divided:
            cg.setFillColor(palette.cgColor(look.variant == .bar ? .borderStrong : .border))
            cg.fill(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1))
        default:
            break
        }
        let placed = look.placed
        let origin = placed.origin
        let padding = look.padding
        let content = size.height - padding.top - padding.bottom
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + padding.left,
            y: origin.y - (origin.y * scale).rounded() / scale + padding.top + (content - look.line.height) / 2)
        let color = palette.cgColor(look.tone)
        if let line = placed.title {
            let baseline = (look.line.baseline * scale).rounded() / scale
            let warning = palette.cgColor(.warning)
            for run in CTLineGetGlyphRuns(line) as? [CTRun] ?? [] {
                guard (CTRunGetAttributes(run) as NSDictionary)[NHighlightLook.matchKey] != nil else {
                    continue
                }
                let range = CTRunGetStringRange(run)
                let start = CTLineGetOffsetForStringIndex(line, range.location, nil)
                let end = CTLineGetOffsetForStringIndex(line, range.location + range.length, nil)
                var ascent: CGFloat = 0
                var descent: CGFloat = 0
                _ = CTRunGetTypographicBounds(run, CFRange(location: 0, length: 0), &ascent, &descent, nil)
                cg.setFillColor(warning.copy(alpha: warning.alpha * matchShare) ?? warning)
                cg.fill(CGRect(x: start, y: baseline - ascent, width: end - start, height: ascent + descent))
            }
            NTextEngine.draw(
                NTextEngine.Layout(lines: [line], width: 0), line: look.line, color: color, strike: nil, scale: scale,
                in: cg)
        }
        if let count = placed.count, let countLine = placed.countLine {
            cg.translateBy(x: placed.countLeft, y: (look.line.height - countLine.height) / 2)
            NTextEngine.draw(count, line: countLine, color: color, strike: nil, scale: scale, in: cg)
        }
    }
}
