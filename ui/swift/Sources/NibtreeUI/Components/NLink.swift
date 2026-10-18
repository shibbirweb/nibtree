import NibtreeTokens
import SwiftUI

/// A button that looks like a link, for a small action in text or under a list, such as "Open settings": the Swift
/// side of ui/web `Link` (docs/components/Link.md). Accent words are underlined under the pointer; dim ones brighten,
/// with an optional icon before them, or a fold chevron when `expanded` is set. The web's `font: inherit` is the
/// body's font here (the surrounding text's size, outside a Text). Its `title` is SwiftUI's `.help` on the link, its
/// `children` are the words. The icon, words and underline are drawn in one canvas, like `NButton`'s.
public struct NLink: View {
    public enum Tone: String, CaseIterable, Sendable {
        case accent, dim
    }

    public enum Size: String, CaseIterable, Sendable {
        case inherit, small
    }

    private let look: NButtonLook
    private let expanded: Bool?
    private let disabled: Bool
    private let action: () -> Void
    @State private var hovering = false

    public init(
        _ title: String, tone: Tone = .accent, size: Size = .inherit, mono: Bool = false, icon: GMIconName? = nil,
        expanded: Bool? = nil, disabled: Bool = false, action: @escaping () -> Void
    ) {
        look = NButtonLook(link: title, tone: tone, size: size, mono: mono, icon: icon, expanded: expanded)
        self.expanded = expanded
        self.disabled = disabled
        self.action = action
    }

    public var body: some View {
        NButtonFrame(look: look) {
            NButtonFace(look: look, hovering: hovering && !disabled)
        }
        .opacity(disabled ? look.disabledOpacity : 1)
        .onHover { hovering = $0 }
        .onTapGesture(perform: press)
        .accessibilityRepresentation {
            Button(action: press) { Text(look.words.text) }
                .disabled(disabled)
                .accessibilityValue(expanded.map { $0 ? "expanded" : "collapsed" } ?? "")
        }
    }

    private func press() {
        if disabled {
            return
        }
        action()
    }
}

extension NButtonLook {
    /// A link's look: no background, border or padding, as tall as its words (or its icon, if taller).
    @MainActor
    init(link text: String, tone: NLink.Tone, size: NLink.Size, mono: Bool, icon: GMIconName?, expanded: Bool?) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: size == .small ? GMFontSize.small : nil, mono: mono)
        let colors = tone == .accent
            ? Colors(background: nil, border: nil, text: .accent, hover: nil)
            : Colors(background: nil, border: nil, text: .textDim, hover: nil, hoverText: .text)
        let words = NButtonLook.spec(text, font, tone: colors.text)
        let glyph = expanded.map { $0 ? GMIconName.chevronDown : .chevronRight } ?? icon
        self.init(
            words: words, count: nil, icon: glyph, iconSize: .compact, layout: nil, layoutActive: false,
            trailingIcon: nil, spinning: false, pressed: false, fill: false, labelled: false, colors: colors,
            height: max(words.line.height, glyph == nil ? 0 : NIconSize.compact.points), paddingX: 0, border: 0,
            fixedWidth: nil, maxWidth: .infinity)
        gap = GMSpace.s3
        underlineOnHover = tone == .accent
    }
}
