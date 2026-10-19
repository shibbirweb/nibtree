import NibtreeTokens
import SwiftUI

/// Everything a dialog head draws, worked out once from its props as DialogHead.svelte's classes do.
struct NDialogHeadLook: Sendable {
    /// DialogHead.svelte's `color-mix(in srgb, var(--tone) 14%, transparent)` behind the icon.
    nonisolated static let tileShare = 0.14

    let title: NTextSpec
    let subtitle: NTextSpec?
    let icon: GMIconName?
    let iconTone: NDialogHeadIconTone
    let size: NDialogHeadSize
    let closes: Bool
    let placed = NDialogHeadPlaced()

    @MainActor
    init(
        title: String, subtitle: String, icon: GMIconName?, iconTone: NDialogHeadIconTone, size: NDialogHeadSize,
        closes: Bool
    ) {
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        self.title = spec(title, NTypography.FontKey(GMTextStyles.title), .text)
        self.subtitle =
            subtitle.isEmpty
            ? nil : spec(subtitle, NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small), .textDim)
        self.icon = icon
        self.iconTone = iconTone
        self.size = size
        self.closes = closes
    }

    /// The icon tile's side, or nil without an icon.
    var tile: CGFloat? {
        icon == nil ? nil : size == .panel ? GMPanelDialogTokens.iconSize : GMDialogHeadTokens.iconSize
    }

    var gap: CGFloat {
        switch size {
        case .normal: GMDialogHeadTokens.gap
        case .panel: GMPanelDialogTokens.headGap
        // `gap: normal` in a flex row is none: the close button sits at the end (space-between).
        case .content: 0
        }
    }

    /// The tile and its gap before the words.
    var tileRoom: CGFloat { tile.map { $0 + gap } ?? 0 }

    /// A panel head with no icon and a content head center their items; the others align them at the top.
    var centered: Bool { size == .content || (size == .panel && icon == nil) }

    /// The title's own margin above and below (`--space-1`), none in a panel or content head.
    var titleMargin: CGFloat { size == .normal ? GMSpace.s1 : 0 }

    var marginBottom: CGFloat { size == .normal ? GMDialogHeadTokens.bottom : 0 }

    var padding: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat) {
        switch size {
        case .normal:
            return (0, 0, 0, 0)
        case .panel:
            typealias T = GMPanelDialogTokens
            return icon == nil
                ? (T.headPaddingTop, T.headPaddingLeft, T.headPaddingBottom, T.headPaddingRight)
                : (T.iconHeadPaddingTop, T.bodyPaddingX, T.iconHeadPaddingBottom, T.bodyPaddingX)
        case .content:
            typealias T = GMDialogHeadTokens
            return (T.contentPaddingTop, T.contentPaddingLeft, T.contentPaddingBottom, T.contentPaddingRight)
        }
    }

    /// Lays the title and subtitle out in `width` (wrapped) and returns the words' width and height.
    @MainActor
    func layOut(width: CGFloat?) -> (width: CGFloat, height: CGFloat) {
        let title = self.title.layout(width: width)
        self.title.state.layout = title
        var height = CGFloat(title.lines.count) * self.title.line.height + 2 * titleMargin
        var widest = title.width
        if let subtitle {
            let layout = subtitle.layout(width: width)
            subtitle.state.layout = layout
            height += CGFloat(layout.lines.count) * subtitle.line.height
            widest = max(widest, layout.width)
        }
        return (widest, height)
    }

    @MainActor
    func draw(palette: Palette, scale: CGFloat, in cg: CGContext) {
        let origin = placed.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let padding = self.padding
        let row = placed.row
        if let tile, let icon {
            let top = padding.top + (centered ? (row - tile) / 2 : 0)
            let box = CGRect(x: padding.left, y: top, width: tile, height: tile)
            let radius = size == .panel ? GMPanelDialogTokens.iconRadius : GMDialogHeadTokens.iconRadius
            let tone = palette.cgColor(iconTone.token)
            cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
            cg.setFillColor(tone.copy(alpha: tone.alpha * Self.tileShare) ?? tone)
            cg.fillPath()
            let points = NIconSize.regular.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: tone)
            if let image = NIconImages.image(key, color: tone) {
                let x = ((box.midX - points / 2 + phase.x) * scale).rounded() / scale
                let y = ((box.midY - points / 2 + phase.y) * scale).rounded() / scale
                cg.saveGState()
                cg.translateBy(x: x, y: y + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        guard let titleLayout = title.state.layout else {
            return
        }
        let titleHeight = CGFloat(titleLayout.lines.count) * title.line.height
        let subtitleLines = subtitle?.state.layout?.lines.count ?? 0
        let subtitleHeight = CGFloat(subtitleLines) * (subtitle?.line.height ?? 0)
        let words = titleHeight + 2 * titleMargin + subtitleHeight
        let top = padding.top + (centered ? (row - words) / 2 : 0) + titleMargin
        cg.translateBy(x: padding.left + tileRoom + phase.x, y: top + phase.y)
        NTextEngine.draw(
            titleLayout, line: title.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
        if let subtitle, let layout = subtitle.state.layout {
            cg.translateBy(x: 0, y: titleHeight + titleMargin)
            NTextEngine.draw(
                layout, line: subtitle.line, color: palette.cgColor(subtitle.tone), strike: nil, scale: scale, in: cg)
        }
    }
}

/// Where the head was placed and how tall its row is.
final class NDialogHeadPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var row: CGFloat = 0
}
