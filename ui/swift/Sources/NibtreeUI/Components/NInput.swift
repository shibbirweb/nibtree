import AppKit
import NibtreeTokens
import SwiftUI

/// A single-line text field: the Swift side of ui/web `Input` (docs/components/Input.md). `invalid` draws a red
/// border (pair it with `NField` for the message), `mono` is for hashes and paths. At rest one canvas draws the box and
/// the text (or the placeholder); a click turns it into SwiftUI's own text field until focus leaves. The keyboard
/// reaches it with Tab like any field, and typing or Return starts editing: a focus watch on every input cost a column
/// of five more than the web's. `type`, `suggestions` and the other HTML attributes follow with the screens that use
/// them.
public struct NInput: View {
    @Binding private var value: String
    private let look: NInputLook
    @State private var editing = false
    @FocusState private var typing: Bool

    public init(
        value: Binding<String>, invalid: Bool = false, mono: Bool = false, width: NControlWidth = .auto,
        placeholder: String = "", disabled: Bool = false, label: String? = nil
    ) {
        _value = value
        look = NInputLook(
            invalid: invalid, mono: mono, width: width, placeholder: placeholder, disabled: disabled, label: label)
    }

    /// A key pressed while the input has the keyboard's focus at rest: printable text and Return start editing (the
    /// text typed so far kept), anything else (Tab, arrows, Escape) goes on to the window.
    private func start(typing press: KeyPress) -> KeyPress.Result {
        guard !look.disabled, Self.startsEditing(press.characters, isReturn: press.key == .return) else {
            return .ignored
        }
        if press.key != .return {
            value += press.characters
        }
        editing = true
        return .handled
    }

    /// Whether a key starts editing: Return, or printable text. Not Tab, Escape or other control characters, nor
    /// arrows and function keys, which AppKit sends as characters U+F700 to U+F8FF.
    static func startsEditing(_ characters: String, isReturn: Bool) -> Bool {
        let printable = characters.unicodeScalars.allSatisfy {
            $0.value >= 32 && $0.value != 127 && !(0xF700...0xF8FF).contains($0.value)
        }
        return isReturn || (!characters.isEmpty && printable)
    }

    /// An input already editing, for tests.
    init(value: Binding<String>, editing: Bool) {
        self.init(value: value)
        _editing = State(initialValue: editing)
    }

    public var body: some View {
        let look = look
        NInputFrame(look: look) {
            NInputFace(look: look, value: editing ? "" : value, focused: editing)
            if editing {
                TextField(look.label ?? look.placeholder, text: $value, prompt: Text(look.placeholder))
                    .textFieldStyle(.plain)
                    .font(NTypography.font(look.font))
                    .focused($typing)
                    .onAppear {
                        typing = true
                        // AppKit selects a field's whole text when it takes the focus; the caret goes to the end
                        // instead, after what was typed.
                        DispatchQueue.main.async {
                            (NSApp.keyWindow?.firstResponder as? NSTextView)?.moveToEndOfDocument(nil)
                        }
                    }
                    .onChange(of: typing) { _, now in
                        if !now {
                            editing = false
                        }
                    }
                    .onSubmit { editing = false }
            }
        }
        .opacity(look.disabled ? NInputLook.disabledOpacity : 1)
        .focusable(!look.disabled && !editing, interactions: .edit)
        .onKeyPress(phases: .down, action: start(typing:))
        .onTapGesture {
            if !look.disabled {
                editing = true
            }
        }
        .accessibilityRepresentation {
            TextField(look.label ?? look.placeholder, text: $value).disabled(look.disabled)
        }
    }
}
