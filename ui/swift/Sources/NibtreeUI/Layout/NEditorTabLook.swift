import NibtreeTokens
import SwiftUI

/// Everything an editor tab draws, worked out once from its props as EditorTab.svelte's classes do, and where its
/// parts go.
struct NEditorTabLook: Sendable {
    /// The CSS `1px solid` border.
    nonisolated static let border: CGFloat = 1
    /// The icon's `opacity: 0.8`.
    nonisolated static let iconOpacity = 0.8
    /// The rounded active tab's `color-mix(in srgb, var(--accent) 50%, var(--editor-bg))` outline.
    nonisolated static let roundedShare = 0.5
    /// How far a name may pass its room and still be drawn whole (pixel rounding of the tab's width).
    nonisolated static let fitSlack: CGFloat = 0.5

    let tab: NEditorTabData
    let active: Bool
    let focused: Bool
    let layout: NEditorTabLayout
    let look: NEditorTabLookStyle
    let lifted: Bool
    let closable: Bool
    let name: NTextSpec
    let hint: NTextSpec?

    @MainActor
    init(
        tab: NEditorTabData, active: Bool, focused: Bool, layout: NEditorTabLayout, look: NEditorTabLookStyle,
        lifted: Bool, closable: Bool
    ) {
        let font = NTypography.FontKey(
            GMTextStyles.body, weight: layout == .single ? GMFontWeight.medium : nil, mono: tab.mono,
            italic: tab.preview)
        name = NTextSpec(
            text: tab.label, font: font, kerning: 0, tabular: false, truncate: true,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        let hintFont = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.compact)
        hint = tab.hint.flatMap { $0.isEmpty ? nil : $0 }.map {
            NTextSpec(
                text: $0, font: hintFont, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(hintFont, lineHeight: nil), tone: .textFaint, strike: false)
        }
        self.tab = tab
        self.active = active
        self.focused = focused
        self.layout = layout
        self.look = look
        self.lifted = lifted
        self.closable = closable
    }

    var rounded: Bool { look == .rounded }
    /// The tab's own left padding (single) and border on each side.
    var outerLeft: CGFloat {
        (layout == .single ? GMTabStripTokens.singlePaddingLeft : 0) + (rounded ? Self.border : 0)
    }
    var outerRight: CGFloat {
        GMSpace.s2 + (rounded ? Self.border : layout == .single ? 0 : Self.border)
    }
    /// The button's padding around the icon, name and hint.
    var mainLeft: CGFloat {
        layout == .single
            ? GMTabStripTokens.tabPaddingRight : rounded ? GMEditorTabTokens.roundedPaddingLeft
            : GMTabStripTokens.tabPaddingLeft
    }
    var mainRight: CGFloat { GMTabStripTokens.tabPaddingRight }

    /// The wrapped tab's bottom line, which its content sits above.
    var bottomLine: CGFloat { layout == .wrap && !rounded ? Self.border : 0 }

    /// The words color: the text on the open tab of a focused strip, dim otherwise.
    var tone: GMColorToken { active && focused ? .text : .textDim }

    @MainActor
    var nameWidth: CGFloat { NTextMetrics.width(of: name.text, font: name.font, kerning: 0) }

    /// The tab's width with nothing in its way: its parts side by side, at most the strip's tab width.
    @MainActor
    func width(offer: CGFloat?) -> CGFloat {
        let gap = GMTabStripTokens.gap
        let icon = tab.icon == nil ? 0 : NIconSize.medium.points + gap
        let hintWidth = hint.map { gap + NTextMetrics.width(of: $0.text, font: $0.font, kerning: 0) } ?? 0
        let natural = outerLeft + mainLeft + icon + nameWidth + hintWidth + mainRight
            + (closable ? GMTabStripTokens.closeSize : 0) + outerRight
        let most: CGFloat =
            switch layout {
            case .scroll: GMTabStripTokens.tabMaxWidth
            case .wrap: min(GMTabStripTokens.tabMaxWidth, offer ?? .infinity)
            case .single: offer ?? .infinity
            }
        return min(natural, most)
    }

    /// The tab's height: the strip's row (on offer) in the scroll and single layouts, else the token's.
    func height(offer: CGFloat?) -> CGFloat {
        if rounded {
            return GMEditorTabTokens.roundedHeight
        }
        if layout == .wrap {
            return GMTabStripTokens.height
        }
        return offer ?? max(name.line.height, GMTabStripTokens.closeSize)
    }
}

/// Where the layout put the tab, for its words' fractions.
final class NEditorTabPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
}
