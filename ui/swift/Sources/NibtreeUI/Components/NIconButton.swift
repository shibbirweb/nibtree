import NibtreeTokens
import SwiftUI

public enum NIconButtonSize: String, CaseIterable, Sendable {
    case large, normal, header, compact, small, chevron, inline, mini, micro, tool, row
}

public enum NIconButtonTone: String, CaseIterable, Sendable {
    case `default`, dim, faint, dimDanger = "dim-danger", success, danger
}

/// A borderless button with an icon or a layout glyph, and optional text after it: the Swift side of ui/web
/// `IconButton` (docs/components/IconButton.md). `label` is its VoiceOver name and its tooltip unless `title` is
/// given. Dim and faint tones brighten under the pointer; `active` is a toggle's pressed look. Drawn like `NButton`,
/// in one canvas. `type`, `keepFocus` and `element` are HTML's.
public struct NIconButton<Label: View>: View {
    private let look: NButtonLook
    private let name: String
    private let tooltip: String
    private let disabled: Bool
    private let action: () -> Void
    private let label: Label
    @State private var hovering = false
}

extension NIconButton where Label == EmptyView {
    public init(
        icon: GMIconName? = nil, layout: NLayoutIcon.Kind? = nil, label: String, iconSize: NIconSize = .large,
        size: NIconButtonSize = .normal, tone: NIconButtonTone = .default, active: Bool = false,
        spinning: Bool = false, count: String = "", title: String? = nil, disabled: Bool = false,
        action: @escaping () -> Void
    ) {
        self.init(
            icon: icon, layout: layout, name: label, iconSize: iconSize, size: size, tone: tone, active: active,
            spinning: spinning, count: count, title: title, disabled: disabled, action: action
        ) {
            EmptyView()
        }
    }
}

extension NIconButton {
    /// Text views after the icon and count, such as a row's sync counts written out.
    public init(
        icon: GMIconName? = nil, layout: NLayoutIcon.Kind? = nil, name: String, iconSize: NIconSize = .large,
        size: NIconButtonSize = .normal, tone: NIconButtonTone = .default, active: Bool = false,
        spinning: Bool = false, count: String = "", title: String? = nil, disabled: Bool = false,
        action: @escaping () -> Void, @ViewBuilder label: () -> Label
    ) {
        look = NButtonLook(
            icon: icon, layout: layout, iconSize: iconSize, size: size, tone: tone, active: active,
            spinning: spinning, count: count, labelled: Label.self != EmptyView.self)
        self.name = name
        tooltip = title ?? name
        self.disabled = disabled
        self.action = action
        self.label = label()
    }

    public var body: some View {
        NButtonFrame(look: look) {
            NButtonFace(look: look, hovering: hovering && !disabled)
            label
                .environment(\.nibtreeCurrentColor, look.colors.text)
                .layoutValue(key: NButtonPart.self, value: .label)
            if look.spinning {
                NButtonExtras(look: look, spinning: true, badge: nil)
            }
        }
        .opacity(disabled ? look.disabledOpacity : 1)
        .onHover { inside in
            hovering = inside
            // The tooltip is AppKit's own on the view under the pointer: a `.help` on every icon button cost a fifth
            // of its time.
            if inside {
                NHoverHelpHost.show(tooltip)
            } else {
                NHoverHelpHost.hide(tooltip)
            }
        }
        .onTapGesture(perform: press)
        .accessibilityRepresentation {
            Button(name, action: press)
                .disabled(disabled)
                .accessibilityAddTraits(look.pressed ? .isSelected : [])
        }
    }

    private func press() {
        if disabled {
            return
        }
        action()
    }
}
