import NibtreeTokens
import SwiftUI

/// Where the segments went, set by the frame: the control's origin and each segment's left edge and width.
final class NSegmentedPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var frames: [(x: CGFloat, width: CGFloat)] = []

    /// The segment at `x` from the control's left, if any.
    func index(at x: CGFloat) -> Int? {
        frames.firstIndex { x >= $0.x && x < $0.x + $0.width }
    }
}

extension NSegmentedLook {
    /// The control's placed segments; one keeper per look, so a control's taps find its own.
    var placed: NSegmentedPlaced { keeper }
}

enum NSegmentedFace {
    @MainActor
    static func draw(
        _ look: NSegmentedLook, hovered: Int?, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let box = CGRect(origin: .zero, size: size)
        let radius = look.variant != .pill ? GMRadius.control : look.small ? GMSegmentedTokens.smallRadius
            : GMSegmentedTokens.radius
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        if look.variant == .pill {
            cg.addPath(outer)
            cg.setFillColor(palette.cgColor(.panelAlt))
            cg.fillPath()
        }
        cg.saveGState()
        // Joined and split boxes clip their square segments to the rounded corners (`overflow: hidden`).
        cg.addPath(outer)
        cg.clip()
        let frames = look.placed.frames
        let top = 1 + look.boxPadding
        for (index, frame) in frames.enumerated() {
            let segment = look.segments[index]
            let on = index == look.chosen
            let rect = CGRect(x: frame.x, y: top, width: frame.width, height: look.segmentHeight)
            cg.saveGState()
            if segment.disabled {
                cg.setAlpha(NSegmentedLook.disabledOpacity)
                cg.beginTransparencyLayer(auxiliaryInfo: nil)
            }
            background(look, on: on, rect: rect, palette: palette, in: cg)
            let color = palette.cgColor(on || (look.small && hovered == index && !segment.disabled) ? .text : .textDim)
            content(look, segment, rect: rect, color: color, scale: scale, in: cg)
            if segment.disabled {
                cg.endTransparencyLayer()
            }
            cg.restoreGState()
            if index > 0, look.separator > 0 {
                cg.setFillColor(palette.cgColor(.borderStrong))
                cg.fill(CGRect(x: frame.x - 1, y: 0, width: 1, height: size.height))
            }
        }
        cg.restoreGState()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: 1, dy: 1), cornerWidth: radius - 1, cornerHeight: radius - 1,
                transform: nil))
        cg.setFillColor(palette.cgColor(.borderStrong))
        cg.fillPath(using: .evenOdd)
    }

    private static func background(
        _ look: NSegmentedLook, on: Bool, rect: CGRect, palette: Palette, in cg: CGContext
    ) {
        switch look.variant {
        case .joined, .split:
            if on || look.variant == .joined {
                cg.setFillColor(palette.cgColor(on ? .selected : .panel))
                cg.fill(rect)
            }
        case .pill:
            guard on else {
                return
            }
            let radius = look.small ? GMSegmentedTokens.smallSegmentRadius : GMSegmentedTokens.segmentRadius
            let shape = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
            cg.saveGState()
            if look.small {
                let text = palette.cgColor(.text)
                cg.setShadow(
                    offset: CGSize(width: 0, height: 1), blur: 2,
                    color: text.copy(alpha: text.alpha * NSegmentedLook.smallShadowShare))
            } else {
                let shadow = GMShadows.segment
                let shade = palette.isDark ? shadow.dark : shadow.light
                cg.setShadow(
                    offset: CGSize(width: shadow.x, height: shadow.y), blur: shadow.blur,
                    color: CGColor(
                        srgbRed: shade.red / 255, green: shade.green / 255, blue: shade.blue / 255, alpha: shade.alpha))
            }
            cg.addPath(shape)
            cg.setFillColor(palette.cgColor(.panel))
            cg.fillPath()
            cg.restoreGState()
        }
    }

    @MainActor
    private static func content(
        _ look: NSegmentedLook, _ segment: NSegmentedLook.Segment, rect: CGRect, color: CGColor, scale: CGFloat,
        in cg: CGContext
    ) {
        let origin = look.placed.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        // Content is centered in its segment (its own width, or a split's equal part).
        var x = rect.minX + (rect.width - look.content(segment)) / 2
        if let icon = segment.icon {
            let points = look.iconSize.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                let left = ((x + phase.x) * scale).rounded() / scale
                let top = ((rect.midY - points / 2 + phase.y) * scale).rounded() / scale
                cg.saveGState()
                cg.translateBy(x: left, y: top + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
            x += points + (segment.words == nil ? 0 : GMSegmentedTokens.iconGap)
        }
        if let words = segment.words, let layout = words.state.layout {
            cg.saveGState()
            cg.translateBy(x: x + phase.x, y: rect.midY - words.line.height / 2 + phase.y)
            NTextEngine.draw(layout, line: words.line, color: color, strike: nil, scale: scale, in: cg)
            cg.restoreGState()
        }
    }
}

/// The control's own width (`width: fit-content`), or a column's whole width for `split`; its look's height.
struct NSegmentedFrame: Layout {
    let look: NSegmentedLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.naturalWidth }
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = look.variant == .split ? max(offer ?? natural, natural) : natural
        return CGSize(width: width, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.placed.origin = bounds.origin
        look.placed.frames = MainActor.assumeIsolated { look.frames(width: bounds.width) }
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
