import AppKit
import NibtreeTokens
import SwiftUI

/// How many lines a text area shows when its height comes from `rows`: small 2, normal 3, large 5, xlarge 8.
public enum NTextAreaRows: String, CaseIterable, Sendable {
    case small, normal, large, xlarge

    var count: Int {
        switch self {
        case .small: GMTextRows.small
        case .normal: GMTextRows.normal
        case .large: GMTextRows.large
        case .xlarge: GMTextRows.xlarge
        }
    }
}

/// A text area's height: from `rows`, or a set one, `short` or `tall` (the commit message), as wide as its parent.
public enum NTextAreaHeight: String, CaseIterable, Sendable {
    case rows, short, tall
}

/// Whether the user can drag a text area taller: `vertical` draws WebKit's grip in its corner.
public enum NTextAreaResize: String, CaseIterable, Sendable {
    case none, vertical
}

/// A multi-line text field, like the commit message box: the Swift side of ui/web `TextArea`
/// (docs/components/TextArea.md). `tools` puts small buttons in its top right corner (Message History, Templates) and
/// the text keeps clear of them. Like `NInput`, one canvas draws it at rest; a click, or typing or Return while it has
/// the keyboard's focus, turns it into SwiftUI's own text editor until focus leaves. Unlike an input, a disabled text
/// area is not faded, as the web's has no rule for it.
public struct NTextArea<Tools: View>: View {
    @Binding private var value: String
    private let look: NTextAreaLook
    private let tools: Tools
    @State private var editing = false
    /// How far the user dragged the grip, added to the height.
    @State private var grown: CGFloat = 0
    @FocusState private var typing: Bool

    public init(
        value: Binding<String>, rows: NTextAreaRows = .normal, height: NTextAreaHeight = .rows,
        resize: NTextAreaResize = .none, invalid: Bool = false, mono: Bool = false, placeholder: String = "",
        disabled: Bool = false, @ViewBuilder tools: () -> Tools
    ) {
        _value = value
        look = NTextAreaLook(
            rows: rows, height: height, resize: resize, invalid: invalid, mono: mono, placeholder: placeholder,
            disabled: disabled)
        self.tools = tools()
    }

    public var body: some View {
        let look = look
        NTextAreaFrame(look: look, grown: grown) {
            NTextAreaFace(look: look, value: editing ? "" : value, focused: editing)
            if editing {
                TextEditor(text: $value)
                    .font(NTypography.font(look.font))
                    .scrollContentBackground(.hidden)
                    .focused($typing)
                    .onAppear {
                        typing = true
                        DispatchQueue.main.async {
                            (NSApp.keyWindow?.firstResponder as? NSTextView)?.moveToEndOfDocument(nil)
                        }
                    }
                    .onChange(of: typing) { _, now in
                        if !now {
                            editing = false
                        }
                    }
                    .layoutValue(key: NTextAreaPart.self, value: .editor)
            }
            tools.layoutValue(key: NTextAreaPart.self, value: .tools)
            if look.resize == .vertical {
                NTextAreaGrip(grown: $grown).layoutValue(key: NTextAreaPart.self, value: .grip)
            }
        }
        .focusable(!look.disabled && !editing, interactions: .edit)
        .onKeyPress(phases: .down) { press in
            guard !look.disabled, NInput.startsEditing(press.characters, isReturn: press.key == .return) else {
                return .ignored
            }
            if press.key != .return {
                value += press.characters
            }
            editing = true
            return .handled
        }
        .onTapGesture {
            if !look.disabled {
                editing = true
            }
        }
        .accessibilityRepresentation {
            TextEditor(text: $value).disabled(look.disabled)
        }
    }
}

extension NTextArea where Tools == EmptyView {
    /// A text area without corner buttons.
    public init(
        value: Binding<String>, rows: NTextAreaRows = .normal, height: NTextAreaHeight = .rows,
        resize: NTextAreaResize = .none, invalid: Bool = false, mono: Bool = false, placeholder: String = "",
        disabled: Bool = false
    ) {
        self.init(
            value: value, rows: rows, height: height, resize: resize, invalid: invalid, mono: mono,
            placeholder: placeholder, disabled: disabled) { EmptyView() }
    }
}

/// The corner the user drags to make the text area taller, never shorter than its own height.
private struct NTextAreaGrip: View {
    @Binding var grown: CGFloat
    @State private var start: CGFloat?

    var body: some View {
        Color.clear
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { drag in
                        let from = start ?? grown
                        start = from
                        grown = max(0, from + drag.translation.height)
                    }
                    .onEnded { _ in start = nil }
            )
            .accessibilityHidden(true)
    }
}
