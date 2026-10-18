import NibtreeTokens
import SwiftUI

extension NButtonLook {
    /// An icon button's look, as IconButton.svelte's size and tone classes make it: borderless, its content centered,
    /// a dim or faint tone brightening under the pointer.
    @MainActor
    init(
        icon: GMIconName?, layout: NLayoutIcon.Kind?, iconSize: NIconSize, size: NIconButtonSize,
        tone: NIconButtonTone, active: Bool, spinning: Bool, count: String, labelled: Bool
    ) {
        let font = NTypography.FontKey(GMTextStyles.body, size: nil)
        let countFont = NTypography.FontKey(GMTextStyles.body, size: GMIconButtonTokens.countFontSize)
        let colors = Self.iconColors(size: size, tone: tone)
        self.init(
            words: NButtonLook.spec("", font, tone: colors.text),
            count: count.isEmpty ? nil : NButtonLook.spec(count, countFont, tone: colors.text, tabular: true),
            icon: icon, iconSize: iconSize, layout: layout, layoutActive: false, trailingIcon: nil,
            spinning: spinning, pressed: active, fill: false, labelled: labelled, colors: colors,
            height: Self.iconHeight(size), paddingX: Self.iconPadding(size), border: 0,
            fixedWidth: Self.iconFixedWidth(size), maxWidth: .infinity)
        minWidth = Self.iconMinWidth(size)
        radius = switch size {
        case .tool, .row: GMRadius.small
        case .micro: GMIconButtonTokens.microRadius
        default: GMIconButtonTokens.radius
        }
        gap = switch size {
        case .tool: 0
        case .row: GMIconButtonTokens.rowGap
        default: GMIconButtonTokens.gap
        }
        centered = true
        disabledOpacity = Self.iconDisabledOpacity
        countFollowsText = true
        labelLast = true
    }

    /// IconButton.svelte's `opacity: 0.4` while disabled.
    nonisolated static let iconDisabledOpacity = 0.4

    private static func iconColors(size: NIconButtonSize, tone: NIconButtonTone) -> Colors {
        let quiet = size == .tool || size == .row
        let text: GMColorToken = switch tone {
        case .success: .success
        case .danger: .danger
        case .faint: .textFaint
        case .dim, .dimDanger: .textDim
        case .default: quiet ? .textDim : .text
        }
        let hoverText: GMColorToken? = switch tone {
        case .success, .danger: nil
        case .dimDanger: .danger
        default: text == .text ? nil : .text
        }
        let hover: GMColorToken = size == .row || size == .micro ? .borderStrong : .hover
        return Colors(
            background: nil, border: nil, text: text, hover: hover, hoverText: hoverText, pressedBackground: .hover)
    }

    private static func iconHeight(_ size: NIconButtonSize) -> CGFloat {
        switch size {
        case .large: GMIconButtonTokens.sizeLarge
        case .normal: GMIconButtonTokens.size
        case .header: GMIconButtonTokens.sizeHeader
        case .compact, .chevron: GMIconButtonTokens.sizeCompact
        case .small, .inline: GMIconButtonTokens.sizeSmall
        case .mini: GMIconButtonTokens.miniSize
        case .micro: GMIconButtonTokens.microSize
        case .tool: GMIconButtonTokens.toolHeight
        case .row: GMIconButtonTokens.rowSize
        }
    }

    private static func iconMinWidth(_ size: NIconButtonSize) -> CGFloat {
        switch size {
        case .large, .normal: GMIconButtonTokens.size
        case .chevron: GMIconButtonTokens.chevronWidth
        case .micro, .tool: 0
        default: iconHeight(size)
        }
    }

    private static func iconPadding(_ size: NIconButtonSize) -> CGFloat {
        switch size {
        case .small: GMIconButtonTokens.paddingXSmall
        case .chevron: GMIconButtonTokens.chevronPaddingX
        case .mini: GMIconButtonTokens.miniPaddingX
        case .row: GMIconButtonTokens.rowPaddingX
        case .inline, .micro, .tool: 0
        default: GMIconButtonTokens.paddingX
        }
    }

    private static func iconFixedWidth(_ size: NIconButtonSize) -> CGFloat? {
        switch size {
        case .large: GMIconButtonTokens.sizeLarge
        case .inline: GMIconButtonTokens.sizeSmall
        case .micro: GMIconButtonTokens.microSize
        case .tool: GMIconButtonTokens.toolWidth
        default: nil
        }
    }
}
