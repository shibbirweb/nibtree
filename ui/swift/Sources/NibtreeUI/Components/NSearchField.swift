import AppKit
import NibtreeTokens
import SwiftUI

/// A search field's size: `normal` like Settings' search, `large` like the Welcome page's (on the editor background),
/// `compact` for a panel's filter and `small` for the Git Console's (a set width, smaller text).
public enum NSearchFieldSize: String, CaseIterable, Sendable {
    case normal, large, compact, small
}

/// A filter box with a magnifier and a clear button, like Settings' search: the Swift side of ui/web `SearchField`
/// (docs/components/SearchField.md). Escape clears it, then leaves it. At rest one canvas draws the box, the
/// magnifier and the text (or the placeholder); a click, typing or `autofocus` turns it into SwiftUI's own text field
/// until focus leaves, as `NInput` does. `element` and `onkeydown` are web-only (the DOM element and raw key events).
public struct NSearchField: View {
    @Binding private var value: String
    private let look: NSearchFieldLook
    private let autofocus: Bool
    private let onInput: ((String) -> Void)?
    private let origin = NTextState()
    @State private var editing = false
    @FocusState private var typing: Bool

    public init(
        value: Binding<String>, placeholder: String = "Search", label: String, autofocus: Bool = false,
        size: NSearchFieldSize = .normal, width: NControlWidth = .auto, onInput: ((String) -> Void)? = nil
    ) {
        _value = value
        look = NSearchFieldLook(placeholder: placeholder, label: label, size: size, width: width)
        self.autofocus = autofocus
        self.onInput = onInput
    }

    private func clear() {
        value = ""
        onInput?("")
    }

    /// A key pressed while the field has the keyboard's focus at rest: printable text and Return start editing, Escape
    /// clears, anything else goes on to the window.
    private func start(typing press: KeyPress) -> KeyPress.Result {
        if press.key == .escape, !value.isEmpty {
            clear()
            return .handled
        }
        guard NInput.startsEditing(press.characters, isReturn: press.key == .return) else {
            return .ignored
        }
        if press.key != .return {
            value += press.characters
            onInput?(value)
        }
        editing = true
        return .handled
    }

    public var body: some View {
        let (look, origin, value) = (look, origin, value)
        // An autofocused field draws its focus at once; the text field takes over after the first frame.
        let focused = editing || autofocus
        NSearchFieldFrame(look: look, clearing: !value.isEmpty, origin: origin) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(
                            value: editing ? "" : value, focused: focused, origin: origin.origin, size: size,
                            palette: palette, scale: scale, in: cg)
                    }
                }
            }
            .layoutValue(key: NSearchFieldPart.self, value: .face)
            if editing {
                TextField(look.label, text: $value, prompt: Text(look.placeholder))
                    .textFieldStyle(.plain)
                    .font(NTypography.font(look.font))
                    .focused($typing)
                    .onAppear { typing = true }
                    .onChange(of: typing) { _, now in
                        if !now {
                            editing = false
                        }
                    }
                    .onChange(of: self.value) { _, now in onInput?(now) }
                    .onExitCommand {
                        if self.value.isEmpty {
                            typing = false
                        } else {
                            clear()
                        }
                    }
            }
            if !value.isEmpty {
                NSearchFieldClear(side: look.clearSide, action: clear)
                    .layoutValue(key: NSearchFieldPart.self, value: .clear)
            }
        }
        // `width: 100%` fills a column even where the column keeps its children at their own width.
        .layoutValue(key: NStackAlignSelf.self, value: look.width == .fill ? .stretch : nil)
        .focusable(!editing, interactions: .edit)
        .onKeyPress(phases: .down, action: start(typing:))
        .onTapGesture { editing = true }
        .onAppear {
            if autofocus {
                // After the first frame: a picture drawn at once (ImageRenderer cannot draw an AppKit field) keeps the
                // canvas's look.
                DispatchQueue.main.async { editing = true }
            }
        }
        .accessibilityRepresentation {
            TextField(look.label, text: $value)
        }
    }
}

/// The clear button: a small x that darkens its square on hover, with its "Clear" tooltip.
private struct NSearchFieldClear: View {
    let side: CGFloat
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        let hovered = hovering
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    if hovered {
                        let radius = GMRadius.small
                        cg.addPath(
                            CGPath(
                                roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius,
                                cornerHeight: radius, transform: nil))
                        cg.setFillColor(palette.cgColor(.hover))
                        cg.fillPath()
                    }
                    let points = NIconSize.compact.points
                    let color = palette.cgColor(.textDim)
                    let key = NIconImages.Key(
                        name: .x, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
                    guard let image = NIconImages.image(key, color: color) else {
                        return
                    }
                    let corner = ((size.width - points) / 2 * scale).rounded() / scale
                    cg.translateBy(x: corner, y: corner + points)
                    cg.scaleBy(x: 1, y: -1)
                    cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                }
            }
        }
        .frame(width: side, height: side)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .onHover { inside in
            hovering = inside
            if inside {
                NHoverHelpHost.show(Self.title)
            } else {
                NHoverHelpHost.hide(Self.title)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Self.title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }

    private static let title = "Clear"
}
