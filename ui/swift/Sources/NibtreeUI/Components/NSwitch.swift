import AppKit
import NibtreeTokens
import SwiftUI

/// An on/off switch for a setting that applies at once: the Swift side of ui/web `Switch` (docs/components/Switch.md).
/// `label` names it for VoiceOver, which reads it as a switch and can flip it. The web's `onchange` is the binding's
/// own setter. The knob slides as the web's does, unless Reduce Motion is on.
public struct NSwitch: View {
    @Binding private var checked: Bool
    private let label: String
    private let disabled: Bool

    public init(checked: Binding<Bool>, label: String, disabled: Bool = false) {
        _checked = checked
        self.label = label
        self.disabled = disabled
    }

    public var body: some View {
        NSwitchFace(progress: checked ? 1 : 0, disabled: disabled)
            .frame(width: GMSwitchTokens.width, height: GMSwitchTokens.height)
            .onTapGesture(perform: flip)
            .accessibilityRepresentation {
                Toggle(label, isOn: $checked).toggleStyle(.switch).disabled(disabled)
            }
    }

    private func flip() {
        if disabled {
            return
        }
        let still = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        withAnimation(still ? nil : .easeInOut(duration: GMMotion.normal)) {
            checked.toggle()
        }
    }
}

/// The track and knob, `progress` 0 off to 1 on: an animatable value, so the knob slides and the track's color fades
/// like the web's transitions.
private struct NSwitchFace: View, Animatable {
    var progress: Double
    let disabled: Bool

    /// Switch.svelte's knob is plain white in every theme.
    static let knob = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
    /// Switch.svelte's `opacity: 0.5` while disabled.
    static let disabledOpacity = 0.5

    nonisolated var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        let (progress, disabled) = (progress, disabled)
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                // A disabled group (a fieldset) disables the switch too, as the web's `:disabled` does.
                let disabled = disabled || !context.environment.isEnabled
                context.withCGContext { cg in
                    if disabled {
                        cg.setAlpha(Self.disabledOpacity)
                        cg.beginTransparencyLayer(auxiliaryInfo: nil)
                    }
                    let off = palette.cgColor(.borderStrong)
                    let on = palette.cgColor(.accent)
                    let track = progress <= 0 ? off : progress >= 1 ? on : NAvatarFace.mix(on, off, share: progress)
                    let radius = GMSwitchTokens.radius
                    cg.addPath(CGPath(
                        roundedRect: CGRect(origin: .zero, size: box), cornerWidth: radius, cornerHeight: radius,
                        transform: nil))
                    cg.setFillColor(track)
                    cg.fillPath()
                    let (inset, side) = (GMSwitchTokens.inset, GMSwitchTokens.knob)
                    let travel = box.width - side - 2 * inset
                    let shadow = GMShadows.knob
                    let shade = palette.isDark ? shadow.dark : shadow.light
                    let color = CGColor(
                        srgbRed: shade.red / 255, green: shade.green / 255, blue: shade.blue / 255, alpha: shade.alpha)
                    // A canvas's device space runs down like CSS, so the offset is the web's as it is.
                    cg.setShadow(offset: CGSize(width: shadow.x, height: shadow.y), blur: shadow.blur, color: color)
                    cg.setFillColor(Self.knob)
                    cg.fillEllipse(in: CGRect(x: inset + travel * progress, y: inset, width: side, height: side))
                    if disabled {
                        cg.endTransparencyLayer()
                    }
                }
            }
        }
    }
}
