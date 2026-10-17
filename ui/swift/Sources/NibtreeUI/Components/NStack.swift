import NibtreeTokens
import SwiftUI

public enum NStackDirection: String, CaseIterable, Sendable { case row, column }
/// Cross-axis alignment (ui/web also has `baseline`, which comes with the rows that need it).
public enum NStackAlign: String, CaseIterable, Sendable { case start, center, end, stretch }
public enum NStackJustify: String, CaseIterable, Sendable { case start, center, end, between }
public enum NStackSurface: String, CaseIterable, Sendable { case none, editor, panel, alt }
public enum NStackLine: String, CaseIterable, Sendable { case none, top, bottom }
public enum NStackScroll: String, CaseIterable, Sendable { case none, y, x, both }

/// Lays out its children in a row or a column with a gap from the space tokens: the Swift side of ui/web `Stack`
/// (docs/components/Stack.md). The web-only props (`element`, `role`, `label`, `responsive`, `hideAt`...) are left
/// out; `wrap`, `shrink`, `width`, `maxHeight`, `maxWidth`, `height`, `sticky` and `busy` follow with the screens
/// that use them.
public struct NStack<Content: View>: View {
    public typealias Direction = NStackDirection
    public typealias Align = NStackAlign
    public typealias Justify = NStackJustify
    public typealias Surface = NStackSurface
    public typealias Line = NStackLine
    public typealias Scroll = NStackScroll

    private let direction: Direction
    private let gap: NSpacing
    private let padding: NSpacing
    private let paddingX: NSpacing?
    private let paddingY: NSpacing?
    private let align: Align
    private let justify: Justify
    private let grow: Bool
    private let scroll: Scroll
    private let surface: Surface
    private let line: Line
    private let content: Content
    @Environment(\.nibtreePalette) private var palette

    public init(
        direction: Direction = .column, gap: NSpacing = .md, padding: NSpacing = .none, paddingX: NSpacing? = nil,
        paddingY: NSpacing? = nil, align: Align = .stretch, justify: Justify = .start, grow: Bool = false,
        scroll: Scroll = .none, surface: Surface = .none, line: Line = .none, @ViewBuilder content: () -> Content
    ) {
        self.direction = direction
        self.gap = gap
        self.padding = padding
        self.paddingX = paddingX
        self.paddingY = paddingY
        self.align = align
        self.justify = justify
        self.grow = grow
        self.scroll = scroll
        self.surface = surface
        self.line = line
        self.content = content()
    }

    /// The theme color behind it, or nil for none.
    var surfaceToken: GMColorToken? {
        switch surface {
        case .none: nil
        case .editor: .editorBg
        case .panel: .panel
        case .alt: .panelAlt
        }
    }

    public var body: some View {
        let layout = NStackLayout(
            axis: direction == .row ? .horizontal : .vertical, spacing: gap.points, align: align, justify: justify,
            insets: insets, fills: grow)
        scrolled(layout { content })
            .modifier(
                NStackChrome(
                    fill: surfaceToken.map { palette.cgColor($0) }, line: line,
                    lineColor: palette.cgColor(.borderStrong), grow: grow))
    }

    /// Padding, plus the line's 1 point at its edge (it adds to the height, like a CSS border).
    private var insets: EdgeInsets {
        let horizontal = (paddingX ?? padding).points
        let vertical = (paddingY ?? padding).points
        return EdgeInsets(
            top: vertical + (line == .top ? 1 : 0), leading: horizontal,
            bottom: vertical + (line == .bottom ? 1 : 0), trailing: horizontal)
    }

    /// A scroll view only when the content does not fit, like `overflow: auto`: a region that fits draws as a plain
    /// stack, and a scroll view (an AppKit view) costs many times a stack.
    @ViewBuilder
    private func scrolled(_ inner: some View) -> some View {
        switch scroll {
        case .none: inner
        case .y: ViewThatFits(in: .vertical) { inner; ScrollView(.vertical) { inner } }
        case .x: ViewThatFits(in: .horizontal) { inner; ScrollView(.horizontal) { inner } }
        case .both: ViewThatFits(in: [.horizontal, .vertical]) { inner; ScrollView([.horizontal, .vertical]) { inner } }
        }
    }
}

/// The surface and the line, drawn by one canvas behind the children, and the mark that makes a growing stack share
/// its parent's free length: added only when set, since most stacks are plain.
private struct NStackChrome: ViewModifier {
    let fill: CGColor?
    let line: NStackLine
    let lineColor: CGColor
    let grow: Bool

    func body(content: Content) -> some View {
        if grow {
            decorated(content).layoutValue(key: NStackGrows.self, value: true)
        } else {
            decorated(content)
        }
    }

    @ViewBuilder
    private func decorated(_ content: Content) -> some View {
        if fill == nil && line == .none {
            content
        } else {
            content
                .background {
                    Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                        context.withCGContext { cg in
                            if let fill {
                                cg.setFillColor(fill)
                                cg.fill(CGRect(origin: .zero, size: size))
                            }
                            if line != .none {
                                cg.setFillColor(lineColor)
                                let top = line == .top ? 0 : size.height - 1
                                cg.fill(CGRect(x: 0, y: top, width: size.width, height: 1))
                            }
                        }
                    }
                }
        }
    }
}
