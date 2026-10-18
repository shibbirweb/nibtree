import NibtreeTokens
import SwiftUI

public enum NButtonVariant: String, CaseIterable, Sendable {
    case `default`, primary, danger, dangerPrimary = "danger-primary", ghost, accent
}

public enum NButtonSize: String, CaseIterable, Sendable {
    case normal, small, tiny, mini
}

public enum NButtonWidth: String, CaseIterable, Sendable {
    case auto, fill
}

/// A text button: the Swift side of ui/web `Button` (docs/components/Button.md). Default, Primary (the main action),
/// Danger (red words), Danger primary (a red, filled destructive confirm), Ghost (borderless, like the header's
/// pickers) or Accent (accent words and border). Small fits toolbars and rows. The words, icons and count are drawn in
/// one canvas; a spinning icon and a corner badge are views of their own, only on buttons that have one. The web's
/// `title` and `aria-label` are SwiftUI's `.help` and `.accessibilityLabel` on the button; `type`, `keepFocus` and
/// `element` are HTML's (a click on a SwiftUI view never takes the focus).
public struct NButton<Label: View>: View {
    private let look: NButtonLook
    private let spinning: Bool
    private let badge: Int?
    private let disabled: Bool
    private let action: () -> Void
    private let label: Label
    @State private var hovering = false
}

extension NButton where Label == EmptyView {
    public init(
        _ title: String = "", variant: NButtonVariant = .default, size: NButtonSize = .normal, icon: GMIconName? = nil,
        trailingIcon: GMIconName? = nil, layout: NLayoutIcon.Kind? = nil, layoutActive: Bool = false,
        spinning: Bool = false, pressed: Bool? = nil, badge: Int? = nil, count: Int? = nil, width: NButtonWidth = .auto,
        disabled: Bool = false, action: @escaping () -> Void
    ) {
        self.init(
            with: NButtonLook(
                words: title, variant: variant, size: size, icon: icon, trailingIcon: trailingIcon, layout: layout,
                layoutActive: layoutActive, spinning: spinning, pressed: pressed == true, count: count,
                fill: width == .fill, labelled: false),
            spinning: spinning, badge: badge, disabled: disabled, action: action, label: EmptyView())
    }
}

extension NButton {
    /// A label of any views, such as a ghost picker's name and counts; the button's color is the views' current color.
    public init(
        variant: NButtonVariant = .default, size: NButtonSize = .normal, icon: GMIconName? = nil,
        trailingIcon: GMIconName? = nil, pressed: Bool? = nil, badge: Int? = nil, count: Int? = nil,
        width: NButtonWidth = .auto, disabled: Bool = false, action: @escaping () -> Void,
        @ViewBuilder label: () -> Label
    ) {
        self.init(
            with: NButtonLook(
                words: "", variant: variant, size: size, icon: icon, trailingIcon: trailingIcon, layout: nil,
                layoutActive: false, spinning: false, pressed: pressed == true, count: count, fill: width == .fill,
                labelled: true),
            spinning: false, badge: badge, disabled: disabled, action: action, label: label())
    }

    private init(
        with look: NButtonLook, spinning: Bool, badge: Int?, disabled: Bool, action: @escaping () -> Void, label: Label
    ) {
        self.look = look
        self.spinning = spinning
        self.badge = badge
        self.disabled = disabled
        self.action = action
        self.label = label
    }

    public var body: some View {
        NButtonFrame(look: look) {
            NButtonFace(look: look, hovering: hovering && !disabled)
            label
                .environment(\.nibtreeCurrentColor, look.colors.text)
                .layoutValue(key: NButtonPart.self, value: .label)
            if spinning || badge != nil {
                NButtonExtras(look: look, spinning: spinning, badge: badge)
            }
        }
        .opacity(disabled ? look.disabledOpacity : 1)
        .onHover { hovering = $0 }
        .onTapGesture(perform: press)
        .accessibilityRepresentation {
            Button(action: press) { Text(look.words.text) }
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

/// A spinning icon over the drawn one's spot, and a count pinned to the top right corner.
struct NButtonExtras: View {
    let look: NButtonLook
    let spinning: Bool
    let badge: Int?

    var body: some View {
        if spinning, let icon = look.icon {
            NButtonSpin(name: icon, size: look.iconSize, tone: look.colors.text)
                .layoutValue(key: NButtonPart.self, value: .spin)
        }
        if let badge, badge != 0 {
            NBadge(count: badge, size: .corner).layoutValue(key: NButtonPart.self, value: .badge)
        }
    }
}

/// The icon turning once every 0.8 seconds, like the web's `spin` keyframes; still in pictures.
private struct NButtonSpin: View {
    let name: GMIconName
    let size: NIconSize
    let tone: GMColorToken
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    var body: some View {
        NIcon(name, size: size)
            .environment(\.nibtreeCurrentColor, tone)
            .rotationEffect(.degrees(started && !still ? 360 : 0))
            .animation(.linear(duration: NSpinner.turn).repeatForever(autoreverses: false), value: started)
            .onAppear { started = true }
    }
}
