import NibtreeTokens
import SwiftUI

public enum NEmptyStateVariant: String, CaseIterable, Sendable {
    case area, panel, notice, pane
}

public enum NEmptyStateIconStyle: String, CaseIterable, Sendable {
    case plain, circle, largeCircle = "large-circle"
}

public enum NEmptyStateIconTone: String, CaseIterable, Sendable {
    case inherit, faint, accent, success
}

public enum NEmptyStateTitleSize: String, CaseIterable, Sendable {
    case normal, large
}

public enum NEmptyStateTitleTone: String, CaseIterable, Sendable {
    case `default`, dim, danger
}

/// The centered message of an empty panel or tab, with an optional icon, hint and action: the Swift side of ui/web
/// `EmptyState` (docs/components/EmptyState.md). An `area` is centered in an editor or list and grows in its stack;
/// a `panel` sits at a side panel's top in small dim words; a `notice` is a panel in a dashed box; a `pane` is
/// centered in a whole side panel. `delayed` fades it in after a moment, so a quick load does not flash it. The
/// web's `overlay` is SwiftUI's `.overlay { }` on the view it covers. The icon and words are drawn in one canvas.
public struct NEmptyState<Action: View>: View {
    public typealias Variant = NEmptyStateVariant
    public typealias IconStyle = NEmptyStateIconStyle
    public typealias IconTone = NEmptyStateIconTone
    public typealias TitleSize = NEmptyStateTitleSize
    public typealias TitleTone = NEmptyStateTitleTone

    private let look: NEmptyStateLook
    private let delayed: Bool
    private let grows: Bool
    private let action: Action
}

extension NEmptyState where Action == EmptyView {
    public init(
        title: String, hint: String = "", icon: GMIconName? = nil, variant: Variant = .area,
        iconStyle: IconStyle = .plain, iconTone: IconTone = .inherit, strong: Bool = false,
        titleSize: TitleSize = .normal, titleTone: TitleTone = .default, delayed: Bool = false
    ) {
        self.init(
            with: NEmptyStateLook(
                title: title, hint: hint, icon: icon, variant: variant, iconStyle: iconStyle, iconTone: iconTone,
                strong: strong, titleSize: titleSize, titleTone: titleTone),
            delayed: delayed, grows: variant == .area || variant == .pane, action: EmptyView())
    }
}

extension NEmptyState {
    /// With a button under the words.
    public init(
        title: String, hint: String = "", icon: GMIconName? = nil, variant: Variant = .area,
        iconStyle: IconStyle = .plain, iconTone: IconTone = .inherit, strong: Bool = false,
        titleSize: TitleSize = .normal, titleTone: TitleTone = .default, delayed: Bool = false,
        @ViewBuilder action: () -> Action
    ) {
        self.init(
            with: NEmptyStateLook(
                title: title, hint: hint, icon: icon, variant: variant, iconStyle: iconStyle, iconTone: iconTone,
                strong: strong, titleSize: titleSize, titleTone: titleTone),
            delayed: delayed, grows: variant == .area || variant == .pane, action: action())
    }

    private init(with look: NEmptyStateLook, delayed: Bool, grows: Bool, action: Action) {
        self.look = look
        self.delayed = delayed
        self.grows = grows
        self.action = action
    }

    public var body: some View {
        shown.layoutValue(key: NStackGrows.self, value: grows)
    }

    @ViewBuilder private var shown: some View {
        if delayed {
            frame.modifier(NDelayedAppear())
        } else {
            frame
        }
    }

    private var frame: some View {
        NEmptyStateFrame(look: look) {
            NEmptyStateFace(look: look)
                .accessibilityLabel(
                    [look.title.text, look.hint?.text ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
            action
        }
        .accessibilityElement(children: .contain)
    }
}

/// The notice's dashed box, the icon and the words, in one canvas.
private struct NEmptyStateFace: View {
    let look: NEmptyStateLook

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
    private static func draw(
        _ look: NEmptyStateLook, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        if look.dashed {
            dashedBox(size: size, color: palette.cgColor(.borderStrong), in: cg)
        }
        let origin = look.title.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        if let glyph = look.glyph {
            drawGlyph(glyph, top: look.placed.icon, width: size.width, phase: phase, palette: palette, scale: scale,
                in: cg)
        }
        let inset = look.padding.width + look.border
        let room = size.width - 2 * inset
        for (spec, top) in [(look.title, look.placed.title), (look.hint, look.placed.hint)] {
            guard let spec, let layout = spec.state.layout else {
                continue
            }
            cg.saveGState()
            cg.translateBy(x: inset + phase.x, y: top + phase.y)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg,
                centeredIn: room)
            cg.restoreGState()
        }
    }

    /// WebKit's dashed rounded border: the box's outline (a Core Graphics rounded rect, which starts halfway down the
    /// right side) stroked 2.2 border widths wide with dashes three widths long from phase three, clipped to the
    /// border's ring. A gap grows a little when the dashes would not fit the outline evenly.
    private static func dashedBox(size: CGSize, color: CGColor, in cg: CGContext) {
        let width = NEmptyStateLook.cssBorder
        let radius = min(GMEmptyStateTokens.noticeRadius, size.height / 2, size.width / 2)
        let box = CGRect(origin: .zero, size: size)
        let outline = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        let inner = max(0, radius - width)
        let ring = CGMutablePath()
        ring.addPath(outline)
        ring.addPath(
            CGPath(roundedRect: box.insetBy(dx: width, dy: width), cornerWidth: inner, cornerHeight: inner,
                transform: nil))
        let dash = 3 * width
        let count = (2 * (size.width + size.height) - 8 * radius + 2 * .pi * radius) / dash
        var gap = dash
        if count >= 4, Int(count) % 2 != 0, count != count.rounded(.down) {
            gap += dash / (count / 2)
        }
        cg.saveGState()
        cg.addPath(ring)
        cg.clip(using: .evenOdd)
        cg.addPath(outline)
        cg.setStrokeColor(color)
        cg.setLineWidth(width * 2 * 1.1)
        cg.setLineDash(phase: dash, lengths: [dash, gap])
        cg.strokePath()
        cg.restoreGState()
    }

    private static func drawGlyph(
        _ glyph: NEmptyStateLook.Glyph, top: CGFloat, width: CGFloat, phase: CGPoint, palette: Palette, scale: CGFloat,
        in cg: CGContext
    ) {
        let tone = palette.cgColor(glyph.tone)
        if let circle = glyph.circle {
            let tint = tone.copy(alpha: tone.alpha * glyph.circleShare) ?? tone
            cg.setFillColor(tint)
            let x = (width - circle) / 2 + phase.x
            cg.fillEllipse(in: CGRect(x: x, y: top + phase.y, width: circle, height: circle))
        }
        let key = NIconImages.Key(name: glyph.name, points: glyph.points, lineWidth: glyph.stroke, scale: scale,
            color: tone)
        guard let image = NIconImages.image(key, color: tone) else {
            return
        }
        // WebKit puts an SVG on whole device pixels.
        func snap(_ value: CGFloat) -> CGFloat { (value * scale).rounded() / scale }
        let x = snap((width - glyph.points) / 2 + phase.x)
        let y = snap(top + (glyph.height - glyph.points) / 2 + phase.y)
        cg.saveGState()
        cg.translateBy(x: x, y: y + glyph.points)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(x: 0, y: 0, width: glyph.points, height: glyph.points))
        cg.restoreGState()
    }
}
