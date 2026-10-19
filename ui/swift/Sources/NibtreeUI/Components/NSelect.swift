import NibtreeTokens
import SwiftUI

/// A select's size: `normal`, or `small` for a picker inside a settings line, such as Git identity's repository.
public enum NSelectSize: String, CaseIterable, Sendable {
    case normal, small
}

/// One choice of an `NSelect`: its value, its words, and whether it can be picked. `title` is its tooltip, such as
/// what a rebase action does.
public struct NSelectOption<Value: Hashable & Sendable>: Sendable {
    public let value: Value
    public let label: String
    public let disabled: Bool
    public let title: String?

    public init(value: Value, label: String, disabled: Bool = false, title: String? = nil) {
        self.value = value
        self.label = label
        self.disabled = disabled
        self.title = title
    }
}

/// A drop-down list, styled like `NInput`: the Swift side of ui/web `Select` (docs/components/Select.md). Use
/// `NSegmented` for two to four short choices. One canvas draws the box, the chosen words and the chevron; a click
/// opens AppKit's pop-up menu, as a native `<select>` does on macOS, and Up and Down step through the choices while it
/// has the keyboard's focus. AppKit draws the keyboard focus ring: watching the focus to draw the web's own ring cost a
/// column of selects a third more. `title` is the tooltip, such as the chosen repository's full path.
public struct NSelect<Value: Hashable & Sendable>: View {
    private let options: [NSelectOption<Value>]
    @Binding private var value: Value
    private let label: String
    private let disabled: Bool
    private let title: String?
    private let onChange: ((Value) -> Void)?
    private let look: NSelectLook

    public init(
        options: [NSelectOption<Value>], value: Binding<Value>, label: String, disabled: Bool = false,
        width: NControlWidth = .auto, size: NSelectSize = .normal, title: String? = nil,
        onChange: ((Value) -> Void)? = nil
    ) {
        self.options = options
        _value = value
        self.label = label
        self.disabled = disabled
        self.title = title
        self.onChange = onChange
        let chosen = options.first { $0.value == value.wrappedValue }?.label ?? options.first?.label ?? ""
        look = NSelectLook(labels: options.map(\.label), chosen: chosen, size: size, width: width)
    }

    private var items: [NSelectMenu.Item] {
        options.map { NSelectMenu.Item(label: $0.label, disabled: $0.disabled, title: $0.title) }
    }

    private var chosen: Int? { options.firstIndex { $0.value == value } }

    private func pick(_ index: Int) {
        guard options.indices.contains(index), options[index].value != value else {
            return
        }
        value = options[index].value
        onChange?(value)
    }

    public var body: some View {
        let look = look
        NSelectFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(origin: look.spec.state.origin, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .layoutValue(key: NStackAlignSelf.self, value: look.width == .fill ? .stretch : nil)
        .opacity(disabled ? NSelectLook.disabledOpacity : 1)
        .focusable(!disabled)
        .onKeyPress(keys: [.upArrow, .downArrow]) { press in
            pick(NSelectMenu.step(from: chosen, by: press.key == .upArrow ? -1 : 1, items: items) ?? -1)
            return .handled
        }
        .gesture(
            SpatialTapGesture().onEnded { tap in
                if !disabled {
                    NSelectMenu.show(items, chosen: chosen, tap: tap.location, pick: pick)
                }
            }
        )
        .modifier(NSelectHelp(title: title))
        .accessibilityRepresentation {
            Picker(label, selection: $value) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .disabled(disabled)
        }
    }
}

/// The select's tooltip, watched only when it has one.
private struct NSelectHelp: ViewModifier {
    let title: String?

    func body(content: Content) -> some View {
        if let title {
            content.modifier(NHoverHelp(text: title))
        } else {
            content
        }
    }
}
