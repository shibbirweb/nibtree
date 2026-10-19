import NibtreeTokens
import SwiftUI

/// A search's options: Match Case, Words and Regex.
public struct NSearchOptions: Equatable, Sendable {
    public var matchCase: Bool
    public var wholeWords: Bool
    public var regex: Bool

    public init(matchCase: Bool = false, wholeWords: Bool = false, regex: Bool = false) {
        self.matchCase = matchCase
        self.wholeWords = wholeWords
        self.regex = regex
    }
}

/// The toggles' tooltips, with their keys (from the command runtime, never typed by hand); nil keeps the plain name.
public struct NSearchToggleTitles: Equatable, Sendable {
    public var matchCase: String?
    public var wholeWords: String?
    public var regex: String?

    public init(matchCase: String? = nil, wholeWords: String? = nil, regex: String? = nil) {
        self.matchCase = matchCase
        self.wholeWords = wholeWords
        self.regex = regex
    }
}

/// Match Case, Words and Regex toggles inside a search field (editor find bar, Find in Files): the Swift side of ui/web
/// `SearchToggles` (docs/components/SearchToggles.md). One canvas draws the three; the one under the pointer lights up
/// and shows its tooltip, and a click flips it.
public struct NSearchToggles: View {
    @Binding private var options: NSearchOptions
    private let look: NSearchTogglesLook
    private let titles: [String]
    @State private var hovered: Int?

    public init(options: Binding<NSearchOptions>, compact: Bool = false, titles: NSearchToggleTitles = .init()) {
        _options = options
        let on = options.wrappedValue
        look = NSearchTogglesLook(compact: compact, on: [on.matchCase, on.wholeWords, on.regex])
        self.titles = [
            titles.matchCase ?? "Match Case", titles.wholeWords ?? "Words", titles.regex ?? "Regex",
        ]
    }

    public var body: some View {
        let (look, hot) = (look, hovered)
        NSearchTogglesFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovered: hot, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onContinuousHover { phase in
            var index: Int?
            if case .active(let spot) = phase {
                index = look.index(at: spot.x)
            }
            guard index != hovered else {
                return
            }
            if let old = hovered {
                NHoverHelpHost.hide(titles[old])
            }
            hovered = index
            if let index {
                NHoverHelpHost.show(titles[index])
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in
            switch look.index(at: spot.x) {
            case 0: options.matchCase.toggle()
            case 1: options.wholeWords.toggle()
            case 2: options.regex.toggle()
            default: break
            }
        }
        .accessibilityRepresentation {
            HStack {
                Toggle("Match Case", isOn: $options.matchCase)
                Toggle("Words", isOn: $options.wholeWords)
                Toggle("Regex", isOn: $options.regex)
            }
            .toggleStyle(.button)
        }
    }
}

/// The three toggles' words, sizes and colors, from SearchToggles.svelte's classes.
struct NSearchTogglesLook: Sendable {
    static let labels = ["Cc", "W", ".*"]

    let compact: Bool
    let on: [Bool]
    let words: [NTextSpec]
    let placed = NTextState()

    @MainActor
    init(compact: Bool, on: [Bool]) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: compact ? GMFontSize.mini : GMFontSize.compact, mono: true)
        let line = NTextMetrics.lineBox(
            font, lineHeight: compact ? Double(GMSearchTogglesTokens.lineHeight / font.size) : nil)
        words = Self.labels.map {
            NTextSpec(
                text: $0, font: font, kerning: 0, tabular: false, truncate: false, line: line, tone: .textDim,
                strike: false)
        }
        self.compact = compact
        self.on = on
    }

    var height: CGFloat { compact ? GMSearchTogglesTokens.compactHeight : GMSearchTogglesTokens.height }

    /// Each toggle's left edge and width: at least the token width, else its words, padding and border.
    @MainActor
    var frames: [(x: CGFloat, width: CGFloat)] {
        let (least, padding) =
            compact
            ? (GMSearchTogglesTokens.compactWidth, GMSearchTogglesTokens.compactPaddingX)
            : (GMSearchTogglesTokens.width, GMSearchTogglesTokens.paddingX)
        var x: CGFloat = 0
        return words.map { spec in
            let layout = spec.state.layout ?? spec.layout(width: nil)
            spec.state.layout = layout
            let width = max(least, layout.width + 2 * (padding + 1))
            defer { x += width + GMSpace.s1 }
            return (x, width)
        }
    }

    @MainActor
    func index(at x: CGFloat) -> Int? {
        frames.firstIndex { x >= $0.x && x < $0.x + $0.width }
    }

    @MainActor
    func draw(hovered: Int?, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let origin = placed.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let radius = compact ? GMSearchTogglesTokens.compactRadius : GMSearchTogglesTokens.radius
        for (index, frame) in frames.enumerated() {
            let box = CGRect(x: frame.x, y: 0, width: frame.width, height: height)
            let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
            // `.on` comes after `:hover` with the same weight, so an on toggle keeps its look under the pointer.
            let fill: GMColorToken? = on[index] ? .selected : hovered == index ? .hover : nil
            if let fill {
                cg.addPath(outer)
                cg.setFillColor(palette.cgColor(fill))
                cg.fillPath()
            }
            if on[index] {
                cg.addPath(outer)
                cg.addPath(
                    CGPath(
                        roundedRect: box.insetBy(dx: 1, dy: 1), cornerWidth: radius - 1, cornerHeight: radius - 1,
                        transform: nil))
                cg.setFillColor(palette.cgColor(.accent))
                cg.fillPath(using: .evenOdd)
            }
            let spec = words[index]
            guard let layout = spec.state.layout else {
                continue
            }
            let tone: GMColorToken = on[index] ? .accent : hovered == index ? .text : .textDim
            cg.saveGState()
            cg.translateBy(
                x: box.minX + (box.width - layout.width) / 2 + phase.x, y: (height - spec.line.height) / 2 + phase.y)
            NTextEngine.draw(layout, line: spec.line, color: palette.cgColor(tone), strike: nil, scale: scale, in: cg)
            cg.restoreGState()
        }
    }
}

/// The three toggles side by side, `--space-1` apart.
private struct NSearchTogglesFrame: Layout {
    let look: NSearchTogglesLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let last = MainActor.assumeIsolated { look.frames.last }
        return CGSize(width: last.map { $0.x + $0.width } ?? 0, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
