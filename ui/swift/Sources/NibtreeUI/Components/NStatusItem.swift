import NibtreeTokens
import SwiftUI

/// A status item's color: `default` takes the bar's (the color it sits in), the others their own.
public enum NStatusItemTone: String, CaseIterable, Sendable {
    case `default`, accent, warning, danger
}

/// `quiet` is smaller dim words that brighten when `active`, like Keep Awake.
public enum NStatusItemVariant: String, CaseIterable, Sendable {
    case `default`, quiet
}

/// The longest a status item's words get before they end in an ellipsis: a branch's or an operation's.
public enum NStatusItemLimit: String, CaseIterable, Sendable {
    case none, branch, operation
}

/// One status bar item: an icon and short text, a button when it has an `action`: the Swift side of ui/web
/// `StatusItem` (docs/components/StatusItem.md). `open` keeps it highlighted while its popover shows, `spin` turns its
/// icon while work runs. `leading` and `trailing` are the caller's views around the icon and words. The web's `title`
/// is SwiftUI's own `.help(...)` on the item. One canvas draws the background, the icon and the words.
public struct NStatusItem<Leading: View, Trailing: View>: View {
    private let look: NStatusItemLook
    private let label: String?
    private let action: (() -> Void)?
    private let leading: Leading
    private let trailing: Trailing

    public init(
        text: String = "", icon: GMIconName? = nil, label: String? = nil, tone: NStatusItemTone = .default,
        open: Bool = false, spin: Bool = false, variant: NStatusItemVariant = .default, active: Bool = false,
        disabled: Bool = false, limit: NStatusItemLimit = .none, action: (() -> Void)? = nil,
        @ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing
    ) {
        let leading = leading()
        let trailing = trailing()
        look = NStatusItemLook(
            text: text, icon: icon, tone: tone, open: open, spin: spin, variant: variant, active: active,
            disabled: disabled && action != nil, limit: limit,
            iconOnly: text.isEmpty && Leading.self == EmptyView.self && Trailing.self == EmptyView.self)
        self.label = label
        self.action = action
        self.leading = leading
        self.trailing = trailing
    }

    public var body: some View {
        if action != nil {
            NStatusItemHovering(look: look, label: label, action: action, leading: leading, trailing: trailing)
        } else {
            NStatusItemBody(
                look: look, hovering: false, label: label, action: nil, leading: leading, trailing: trailing)
        }
    }
}

extension NStatusItem where Leading == EmptyView, Trailing == EmptyView {
    /// An item of an icon and words only.
    public init(
        text: String = "", icon: GMIconName? = nil, label: String? = nil, tone: NStatusItemTone = .default,
        open: Bool = false, spin: Bool = false, variant: NStatusItemVariant = .default, active: Bool = false,
        disabled: Bool = false, limit: NStatusItemLimit = .none, action: (() -> Void)? = nil
    ) {
        self.init(
            text: text, icon: icon, label: label, tone: tone, open: open, spin: spin, variant: variant, active: active,
            disabled: disabled, limit: limit, action: action, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// An item that is a button: its background and words change under the pointer.
private struct NStatusItemHovering<Leading: View, Trailing: View>: View {
    let look: NStatusItemLook
    let label: String?
    let action: (() -> Void)?
    let leading: Leading
    let trailing: Trailing
    @State private var hovering = false

    var body: some View {
        NStatusItemBody(
            look: look, hovering: hovering && !look.disabled, label: label, action: action, leading: leading,
            trailing: trailing
        )
        .onHover { hovering = $0 }
    }
}

private struct NStatusItemBody<Leading: View, Trailing: View>: View {
    let look: NStatusItemLook
    let hovering: Bool
    let label: String?
    let action: (() -> Void)?
    let leading: Leading
    let trailing: Trailing

    var body: some View {
        let (look, hovering) = (look, hovering)
        NStatusItemFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let inherited = context.environment.nibtreeCurrentColor
                    context.withCGContext { cg in
                        look.draw(
                            size: size, hovering: hovering, inherited: inherited, palette: palette, scale: scale,
                            in: cg)
                    }
                }
            }
            leading.layoutValue(key: NStatusItemPart.self, value: .leading)
            if look.spin, let icon = look.icon {
                NStatusItemSpin(name: icon, size: look.iconSize, tone: look.spinTone)
                    .layoutValue(key: NStatusItemPart.self, value: .spin)
            }
            trailing.layoutValue(key: NStatusItemPart.self, value: .trailing)
        }
        .opacity(look.dimmed ? NStatusItemLook.disabledOpacity : 1)
        .onTapGesture {
            if !look.disabled {
                action?()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label ?? look.words.text)
        .accessibilityAddTraits(action == nil ? [] : .isButton)
    }
}

/// The icon turning once every 0.8 seconds, like the web's `spin` keyframes; still in pictures.
private struct NStatusItemSpin: View {
    let name: GMIconName
    let size: NIconSize
    let tone: NText.Tone?
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    var body: some View {
        NIcon(name, size: size, tone: tone)
            .rotationEffect(.degrees(started && !still ? 360 : 0))
            .animation(.linear(duration: NSpinner.turn).repeatForever(autoreverses: false), value: started)
            .onAppear { started = true }
    }
}
