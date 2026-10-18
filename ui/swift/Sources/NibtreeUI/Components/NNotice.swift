import NibtreeTokens
import SwiftUI

public enum NNoticeTone: String, CaseIterable, Sendable {
    case danger, warning, info, success
}

public enum NNoticeVariant: String, CaseIterable, Sendable {
    case card, banner
}

/// A tinted message with an icon, like the merge tool's "File changed on disk": the Swift side of ui/web `Notice`
/// (docs/components/Notice.md). A `card` is rounded, in a view; a `banner` is a full-width bar at a view's top with a
/// line under it. The tone picks the color and the default icon; an `action` (a button) sits on the right. A plain
/// message is drawn in the notice's own canvas; the web's `children` are the `message` view. VoiceOver reads the
/// message and the action.
public struct NNotice<Message: View, Action: View>: View {
    public typealias Tone = NNoticeTone
    public typealias Variant = NNoticeVariant

    private let look: NNoticeLook
    private let message: Message
    private let action: Action
}

extension NNotice where Message == EmptyView, Action == EmptyView {
    public init(_ text: String, tone: Tone = .info, variant: Variant = .card, icon: GMIconName? = nil) {
        self.init(with: NNoticeLook(text: text, tone: tone, variant: variant, icon: icon), message: EmptyView(),
            action: EmptyView())
    }
}

extension NNotice where Message == EmptyView {
    public init(
        _ text: String, tone: Tone = .info, variant: Variant = .card, icon: GMIconName? = nil,
        @ViewBuilder action: () -> Action
    ) {
        self.init(with: NNoticeLook(text: text, tone: tone, variant: variant, icon: icon), message: EmptyView(),
            action: action())
    }
}

extension NNotice where Action == EmptyView {
    public init(
        tone: Tone = .info, variant: Variant = .card, icon: GMIconName? = nil, @ViewBuilder message: () -> Message
    ) {
        self.init(with: NNoticeLook(text: nil, tone: tone, variant: variant, icon: icon), message: message(),
            action: EmptyView())
    }
}

extension NNotice {
    public init(
        tone: Tone = .info, variant: Variant = .card, icon: GMIconName? = nil, @ViewBuilder message: () -> Message,
        @ViewBuilder action: () -> Action
    ) {
        self.init(with: NNoticeLook(text: nil, tone: tone, variant: variant, icon: icon), message: message(),
            action: action())
    }

    private init(with look: NNoticeLook, message: Message, action: Action) {
        self.look = look
        self.message = message
        self.action = action
    }

    public var body: some View {
        NNoticeFrame(look: look) {
            NNoticeFace(look: look)
                .accessibilityLabel(look.words?.text ?? "")
                .accessibilityHidden(look.words == nil)
            message
                .environment(\.nibtreeCurrentColor, .text)
                .layoutValue(key: NNoticePart.self, value: .message)
            action.layoutValue(key: NNoticePart.self, value: .action)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The tinted background, the banner's bottom line, the icon and a plain message, in one canvas.
private struct NNoticeFace: View {
    let look: NNoticeLook

    var body: some View {
        let look = look
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    Self.draw(look, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
    }

    @MainActor
    private static func draw(_ look: NNoticeLook, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let box = CGRect(origin: .zero, size: size)
        let radius = look.banner ? 0 : min(GMNoticeTokens.radius, size.height / 2, size.width / 2)
        cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
        cg.setFillColor(look.background(palette))
        cg.fillPath()
        if look.banner {
            cg.setFillColor(palette.cgColor(.borderStrong))
            cg.fill(CGRect(x: 0, y: size.height - look.bottom, width: size.width, height: look.bottom))
        }
        let middle = (size.height - look.bottom) / 2
        let tone = palette.cgColor(look.tone)
        let points = look.iconPoints
        let key = NIconImages.Key(
            name: look.icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: tone)
        if let image = NIconImages.image(key, color: tone) {
            let y = ((middle - points / 2) * scale).rounded() / scale
            cg.saveGState()
            cg.translateBy(x: look.padding.width, y: y + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        guard let words = look.words, let layout = words.state.layout else {
            return
        }
        let origin = words.state.origin
        let height = CGFloat(layout.lines.count) * words.line.height
        cg.translateBy(
            x: look.padding.width + points + look.gap + origin.x - (origin.x * scale).rounded() / scale,
            y: middle - height / 2 + origin.y - (origin.y * scale).rounded() / scale)
        NTextEngine.draw(layout, line: words.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
    }
}
