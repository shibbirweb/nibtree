import AppKit
import NibtreeTokens
import SwiftUI

/// A name being edited in place, such as a terminal's: a small field with an accent border that takes Return to keep
/// the name and Escape to cancel: the Swift side of ui/web `RenameField` (docs/components/RenameField.md). `invalid`
/// (a name already taken) turns the border red. It takes the focus when it appears, with the whole name selected;
/// Return, Escape and leaving the field each end the rename, and only the first one counts: `onRename` gets the
/// trimmed name, or nil for a cancel or an empty name. In a row it grows into the room left, like the web's `flex: 1`.
/// One canvas draws the field's first look, the name all selected as the web's `select()` shows it; once the view is
/// on screen SwiftUI's own text field takes the text's place (AppKit selects a field's whole text when it takes the
/// focus). A text field in every first frame cost four times the web's.
public struct NRenameField: View {
    private let look: NRenameFieldLook
    private let label: String
    private let onRename: (String?) -> Void
    private let onInput: ((String) -> Void)?
    @State private var text: String
    @State private var done = false
    @State private var live = false
    @FocusState private var focused: Bool

    public init(
        value: String, label: String = "New name", invalid: Bool = false, onRename: @escaping (String?) -> Void,
        onInput: ((String) -> Void)? = nil
    ) {
        look = NRenameFieldLook(value: value, invalid: invalid)
        _text = State(initialValue: value)
        self.label = label
        self.onRename = onRename
        self.onInput = onInput
    }

    private func finish(_ name: String?) {
        guard !done else {
            return
        }
        done = true
        onRename(Self.kept(name))
    }

    /// The name a rename keeps: trimmed, or nil for a cancel or a name of only spaces.
    static func kept(_ name: String?) -> String? {
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    public var body: some View {
        let look = look
        NRenameFieldFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let dark = palette.isDark
                    context.withCGContext { cg in
                        look.draw(size: size, palette: palette, scale: scale, text: !live, dark: dark, in: cg)
                    }
                }
            }
            if live {
                TextField(label, text: $text)
                    .textFieldStyle(.plain)
                    .font(NTypography.font(look.font))
                    .focused($focused)
                    .onAppear { focused = true }
                    .onChange(of: text) { _, now in onInput?(now) }
                    .onChange(of: focused) { _, now in
                        if !now {
                            finish(text)
                        }
                    }
                    .onSubmit { finish(text) }
                    .onExitCommand { finish(nil) }
            }
        }
        .layoutValue(key: NStackGrows.self, value: true)
        .onAppear {
            // After the first frame: a picture drawn at once (ImageRenderer cannot draw an AppKit field) keeps the
            // canvas's look.
            DispatchQueue.main.async { live = true }
        }
        .accessibilityElement(children: live ? .contain : .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(text)
    }
}

/// The field's box and, until the text field takes over, its first look: the name selected.
struct NRenameFieldLook: Sendable {
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0
    /// The text's left edge in the box.
    nonisolated static let inset = border + GMRenameFieldTokens.paddingX

    let invalid: Bool
    let spec: NTextSpec
    var font: NTypography.FontKey { spec.font }

    @MainActor
    init(value: String, invalid: Bool) {
        let font = NTypography.FontKey(GMTextStyles.body)
        spec = NTextSpec(
            text: value, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.invalid = invalid
    }

    /// The width with nothing on offer: WebKit's 20 characters plus padding and border.
    @MainActor
    var naturalWidth: CGFloat {
        NInputLook.fieldWidth(font) + 2 * Self.inset
    }

    /// The selection's height: the font's ascent and descent together, rounded (WebKit), centered in the line.
    @MainActor
    var selectionHeight: CGFloat {
        let appKit = NTypography.nsFont(font)
        return (appKit.ascender - appKit.descender).rounded()
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, scale: CGFloat, text: Bool, dark: Bool, in cg: CGContext) {
        let radius = GMRenameFieldTokens.radius
        let box = CGRect(origin: .zero, size: size)
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(.editorBg))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                cornerHeight: radius - Self.border, transform: nil))
        cg.setFillColor(palette.cgColor(invalid ? .danger : .accent))
        cg.fillPath(using: .evenOdd)
        guard text, !spec.text.isEmpty else {
            return
        }
        let origin = spec.state.origin
        let layout = spec.state.layout ?? spec.layout(width: nil)
        let room = max(0, size.width - 2 * Self.inset)
        // The text box clips what does not fit, as a text field scrolls its text.
        cg.clip(to: CGRect(x: Self.inset, y: 0, width: room, height: size.height))
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + Self.inset,
            y: origin.y - (origin.y * scale).rounded() / scale + (size.height - spec.line.height) / 2)
        let high = selectionHeight
        cg.setFillColor(NWebKitColors.selection(dark: dark))
        cg.fill(CGRect(x: 0, y: (spec.line.height - high) / 2, width: layout.width, height: high))
        let color = NWebKitColors.selectedText(dark: dark) ?? palette.cgColor(.text)
        NTextEngine.draw(layout, line: spec.line, color: color, strike: nil, scale: scale, in: cg)
    }
}

/// The field's size: the token height, and the width on offer (a row's share) or WebKit's own; SwiftUI's text field
/// sits in the text's place.
private struct NRenameFieldFrame: Layout {
    let look: NRenameFieldLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = offer ?? MainActor.assumeIsolated { look.naturalWidth }
        return CGSize(width: width, height: GMRenameFieldTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        let inset = NRenameFieldLook.inset
        subviews.dropFirst().first?.place(
            at: CGPoint(x: bounds.minX + inset, y: bounds.midY), anchor: .leading,
            proposal: ProposedViewSize(width: max(0, bounds.width - 2 * inset), height: nil))
    }
}
