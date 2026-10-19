import NibtreeTokens
import SwiftUI

/// Text in a named text style, colored from the theme: the Swift side of ui/web `Text` (docs/components/Text.md).
/// Same props as presets; `element`, `wrap`, `giveWay`, `hideAt` and `title` are about HTML and come later with the
/// layouts that need them.
public struct NText: View {
    public enum Variant: String, CaseIterable, Sendable {
        case body, bodyStrong, label, hint, small, caption, sectionLabel, panelTab, title, heading, pageTitle
        case display, paragraph, code, codeSmall, badge

        public var style: GMTextStyle {
            switch self {
            case .body: GMTextStyles.body
            case .bodyStrong: GMTextStyles.bodyStrong
            case .label: GMTextStyles.label
            case .hint: GMTextStyles.hint
            case .small: GMTextStyles.small
            case .caption: GMTextStyles.caption
            case .sectionLabel: GMTextStyles.sectionLabel
            case .panelTab: GMTextStyles.panelTab
            case .title: GMTextStyles.title
            case .heading: GMTextStyles.heading
            case .pageTitle: GMTextStyles.pageTitle
            case .display: GMTextStyles.display
            case .paragraph: GMTextStyles.paragraph
            case .code: GMTextStyles.code
            case .codeSmall: GMTextStyles.codeSmall
            case .badge: GMTextStyles.badge
            }
        }
    }

    public enum Tone: String, CaseIterable, Sendable {
        case `default`, dim, faint, accent, danger, success, warning

        public var token: GMColorToken {
            switch self {
            case .default: .text
            case .dim: .textDim
            case .faint: .textFaint
            case .accent: .accent
            case .danger: .danger
            case .success: .success
            case .warning: .warning
            }
        }
    }

    public enum Size: String, CaseIterable, Sendable {
        case micro, tiny, xsmall, compact, small, codeSmall, ui, code, title, heading, display

        public var points: CGFloat {
            switch self {
            case .micro: GMFontSize.micro
            case .tiny: GMFontSize.tiny
            case .xsmall: GMFontSize.xsmall
            case .compact: GMFontSize.compact
            case .small: GMFontSize.small
            case .codeSmall: GMFontSize.codeSmall
            case .ui: GMFontSize.ui
            case .code: GMFontSize.code
            case .title: GMFontSize.title
            case .heading: GMFontSize.heading
            case .display: GMFontSize.display
            }
        }
    }

    public enum Weight: String, CaseIterable, Sendable {
        case regular, medium, semibold, bold

        public var fontWeight: Font.Weight {
            switch self {
            case .regular: GMFontWeight.regular
            case .medium: GMFontWeight.medium
            case .semibold: GMFontWeight.semibold
            case .bold: GMFontWeight.bold
            }
        }
    }

    private let content: String
    private let variant: Variant
    private let tone: Tone?
    private let size: Size?
    private let weight: Weight?
    private let mono: Bool
    private let truncate: Bool
    private let selectable: Bool
    private let tabular: Bool
    private let strike: Bool

    public init(
        _ content: String, variant: Variant = .body, tone: Tone? = nil, size: Size? = nil, weight: Weight? = nil,
        mono: Bool = false, truncate: Bool = false, selectable: Bool = false, tabular: Bool = false,
        strike: Bool = false
    ) {
        self.content = content
        self.variant = variant
        self.tone = tone
        self.size = size
        self.weight = weight
        self.mono = mono
        self.truncate = truncate
        self.selectable = selectable
        self.tabular = tabular
        self.strike = strike
    }

    /// The tone shown: the one passed, else the style's own (`hint` is dim; the tokens name it by its color token,
    /// `textDim`), else the text color.
    public var resolvedTone: Tone {
        if let tone {
            return tone
        }
        let styleTone = variant.style.tone
        return Tone.allCases.first { $0.token.rawValue == styleTone } ?? .default
    }

    public var body: some View {
        let style = variant.style
        let font = NTypography.FontKey(style, size: size?.points, weight: weight?.fontWeight, mono: mono)
        let line = NTextMetrics.lineBox(font, lineHeight: style.lineHeight)
        let shown = style.uppercase ? content.uppercased() : content
        let kerning = style.letterSpacing * font.size
        if selectable {
            NSelectableText(
                text: shown, font: font, line: line, kerning: kerning, tone: resolvedTone.token, truncate: truncate,
                tabular: tabular, strike: strike)
        } else {
            NTextCanvas(
                spec: NTextSpec(
                    text: shown, font: font, kerning: kerning, tabular: tabular, truncate: truncate, line: line,
                    tone: resolvedTone.token, strike: strike))
                // Read as its text: the canvas itself has no accessibility of its own.
                .accessibilityLabel(content)
        }
    }
}

/// Selection needs a real text view: SwiftUI's Text, moved onto WebKit's line box, which costs about twice a drawn
/// text. So the text is drawn like plain `NText` and becomes a Text the first time the pointer is over it (and stays
/// one, so a selection is kept), or always for VoiceOver.
private struct NSelectableText: View {
    let text: String
    let font: NTypography.FontKey
    let line: NLineBox
    let kerning: CGFloat
    let tone: GMColorToken
    let truncate: Bool
    let tabular: Bool
    let strike: Bool
    @Environment(\.nibtreePalette) private var palette
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var live = false

    var body: some View {
        if live || voiceOver {
            selectable
        } else {
            NTextCanvas(
                spec: NTextSpec(
                    text: text, font: font, kerning: kerning, tabular: tabular, truncate: truncate, line: line,
                    tone: tone, strike: strike))
                .accessibilityLabel(text)
                .onHover { inside in
                    if inside {
                        live = true
                    }
                }
        }
    }

    private var selectable: some View {
        var shown = Text(text).font(NTypography.font(font)).foregroundStyle(palette.color(tone))
        if kerning != 0 {
            shown = shown.kerning(kerning)
        }
        if strike {
            shown = shown.strikethrough()
        }
        return shown
            .lineSpacing(max(0, line.between))
            .lineLimit(truncate ? 1 : nil)
            .padding(EdgeInsets(top: line.top, leading: 0, bottom: line.bottom, trailing: 0))
            .modifier(NTextOptions(selectable: true, tabular: tabular))
            .layoutValue(key: NExactWidth.self, value: NTextMetrics.width(of: text, font: font, kerning: kerning))
    }
}

/// Selection and tabular digits, added only when asked for: most text has neither.
private struct NTextOptions: ViewModifier {
    let selectable: Bool
    let tabular: Bool

    func body(content: Content) -> some View {
        if selectable && tabular {
            content.textSelection(.enabled).monospacedDigit()
        } else if selectable {
            content.textSelection(.enabled)
        } else if tabular {
            content.monospacedDigit()
        } else {
            content
        }
    }
}
