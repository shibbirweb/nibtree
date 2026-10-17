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
            axis: direction == .row ? .horizontal : .vertical, spacing: gap.points, align: align, justify: justify)
        scrolled(layout { content })
            .padding(.horizontal, (paddingX ?? padding).points)
            .padding(.vertical, (paddingY ?? padding).points)
            .frame(maxWidth: grow && direction == .row ? .infinity : nil, maxHeight: grow ? .infinity : nil)
            .background(surfaceToken.map { palette.color($0) } ?? .clear)
            .overlay(alignment: line == .top ? .top : .bottom) {
                if line != .none {
                    Rectangle().fill(palette.color(.borderStrong)).frame(height: 1)
                }
            }
    }

    @ViewBuilder
    private func scrolled(_ inner: some View) -> some View {
        switch scroll {
        case .none: inner
        case .y: ScrollView(.vertical) { inner }
        case .x: ScrollView(.horizontal) { inner }
        case .both: ScrollView([.horizontal, .vertical]) { inner }
        }
    }
}
