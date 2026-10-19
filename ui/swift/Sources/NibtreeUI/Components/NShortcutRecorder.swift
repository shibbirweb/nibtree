import NibtreeTokens
import SwiftUI

/// A command's keys that can be changed: the Swift side of ui/web `ShortcutRecorder`
/// (docs/components/ShortcutRecorder.md). It shows the keys (or None); a click starts `recording`, and the next key
/// press goes to `onRecord` while the field shows `pending` (what was pressed). Escape cancels. The app turns the press
/// into keys and checks them; the field only draws and listens. One canvas draws it; only a recording field watches
/// the keyboard's focus.
public struct NShortcutRecorder: View {
    @Binding private var recording: Bool
    private let label: String
    private let onRecord: (KeyPress) -> Void
    private let onCancel: (() -> Void)?
    private let look: NShortcutRecorderLook

    public init(
        keys: String, recording: Binding<Bool>, pending: String? = nil, label: String,
        onRecord: @escaping (KeyPress) -> Void, onCancel: (() -> Void)? = nil
    ) {
        _recording = recording
        self.label = label
        self.onRecord = onRecord
        self.onCancel = onCancel
        look = NShortcutRecorderLook(keys: keys, pending: pending, recording: recording.wrappedValue)
    }

    public var body: some View {
        if look.recording {
            NShortcutRecording(look: look) { press in
                if press.key == .escape {
                    recording = false
                    onCancel?()
                } else {
                    onRecord(press)
                }
            }
            .accessibilityLabel("Press the new keys for \(label)")
        } else {
            NShortcutKeys(look: look) { recording = true }
                .accessibilityLabel("Change the keys of \(label)")
                .accessibilityValue(look.keys.text)
        }
    }
}

/// The resting field: the keys in a key cap at its end, or a dim None; its border shows under the pointer.
private struct NShortcutKeys: View {
    let look: NShortcutRecorderLook
    let start: () -> Void
    @State private var hovering = false

    var body: some View {
        let (look, hot) = (look, hovering)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    look.draw(hovering: hot, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
        .frame(width: GMShortcutRecorderTokens.width, height: look.height)
        .contentShape(Rectangle())
        .onHover { inside in
            hovering = inside
            if inside {
                NHoverHelpHost.show(Self.title)
            } else {
                NHoverHelpHost.hide(Self.title)
            }
        }
        .onTapGesture(perform: start)
        .accessibilityElement()
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { start() }
    }

    private static let title = "Change the keys"
}

/// The recording field: an accent box with "Press keys" (or what was pressed) that takes the keyboard's focus.
private struct NShortcutRecording: View {
    let look: NShortcutRecorderLook
    let press: (KeyPress) -> Void
    @FocusState private var focused: Bool

    var body: some View {
        let look = look
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    look.draw(hovering: false, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
        .frame(width: GMShortcutRecorderTokens.width, height: look.height)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onAppear { focused = true }
        .onKeyPress(phases: .down) { event in
            press(event)
            return .handled
        }
        .accessibilityElement()
    }
}

/// What the field draws, worked out once from its props as ShortcutRecorder.svelte's classes do.
struct NShortcutRecorderLook: Sendable {
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0
    /// The key cap's `padding: 1px var(--space-3)`.
    nonisolated static let capPaddingY = 1.0
    nonisolated static let capInset = GMSpace.s3 + 1

    let recording: Bool
    let keys: NTextSpec
    /// "Press keys" or what was pressed while recording; None when there are no keys.
    let words: NTextSpec?

    @MainActor
    init(keys: String, pending: String?, recording: Bool) {
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        let body = NTypography.FontKey(GMTextStyles.body)
        self.keys = spec(keys, NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small), .text)
        if recording {
            words = spec(pending ?? "Press keys", body, .text)
        } else {
            words = keys.isEmpty ? spec("None", body, .textDim) : nil
        }
        self.recording = recording
    }

    /// The key cap's height: its line, padding and borders (2 points at the bottom).
    var capHeight: CGFloat { keys.line.height + 2 * Self.capPaddingY + 1 + GMBorderWidth.thick }

    /// The field's height: at least the token, or its content and border.
    var height: CGFloat {
        let content = words != nil ? (words?.line.height ?? 0) : capHeight
        return max(GMShortcutRecorderTokens.minHeight, content + 2 * Self.border)
    }

    @MainActor
    func draw(hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let radius = GMRadius.control
        let box = CGRect(origin: .zero, size: size)
        if recording || hovering {
            let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
            if recording {
                cg.addPath(outer)
                cg.setFillColor(palette.cgColor(.panel))
                cg.fillPath()
            }
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                    cornerHeight: radius - Self.border, transform: nil))
            cg.setFillColor(palette.cgColor(recording ? .accent : .borderStrong))
            cg.fillPath(using: .evenOdd)
        }
        let right = size.width - Self.border - GMShortcutRecorderTokens.paddingX
        if let words {
            let layout = words.layout(width: nil)
            let x = recording ? (size.width - layout.width) / 2 : right - layout.width
            let top = (size.height - words.line.height) / 2
            cg.saveGState()
            cg.translateBy(x: x, y: top)
            NTextEngine.draw(
                layout, line: words.line, color: palette.cgColor(words.tone), strike: nil, scale: scale, in: cg,
                phase: top)
            cg.restoreGState()
            return
        }
        let layout = keys.layout(width: nil)
        let cap = CGSize(width: layout.width + 2 * Self.capInset, height: capHeight)
        let corner = CGPoint(x: right - cap.width, y: (size.height - cap.height) / 2)
        cg.saveGState()
        cg.translateBy(x: corner.x, y: corner.y)
        NKbdCap.draw(size: cap, in: cg, border: palette.cgColor(.borderStrong), fill: palette.cgColor(.panelAlt))
        let top = 1 + Self.capPaddingY
        cg.translateBy(x: Self.capInset, y: top)
        NTextEngine.draw(
            layout, line: keys.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg,
            phase: corner.y + top)
        cg.restoreGState()
    }
}
