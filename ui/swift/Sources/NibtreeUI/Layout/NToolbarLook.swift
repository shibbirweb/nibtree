import NibtreeTokens
import SwiftUI

/// A toolbar's box, worked out from its variant and placement as Toolbar.svelte's classes do: its size, padding and
/// gap, the line along its edge, its fill, the color its words take and its dividers' length and room.
struct NToolbarLook: Sendable {
    /// The CSS `1px solid` line.
    nonisolated static let line: CGFloat = 1
    /// The conflict bar's `color-mix(in srgb, var(--danger) 7%, var(--panel))`.
    nonisolated static let conflictShare = 0.07

    enum Edge: Sendable {
        case top, bottom, right
    }

    let variant: NToolbarVariant
    var height: CGFloat?
    var minHeight: CGFloat?
    var width: CGFloat?
    var padding = EdgeInsets()
    var gap: CGFloat = 0
    var rowGap: CGFloat = 0
    var edge: Edge?
    var strongLine = true
    var fill: GMColorToken?
    var tone: GMColorToken?
    var dividers = NDividerMetrics(length: GMToolbarTokens.dividerLength, space: GMToolbarTokens.dividerSpace)

    init(variant: NToolbarVariant, placement: NToolbarPlacement) {
        self.variant = variant
        typealias T = GMToolbarTokens
        let even = { (y: CGFloat, x: CGFloat) in EdgeInsets(top: y, leading: x, bottom: y, trailing: x) }
        switch variant {
        case .tab:
            (height, gap, padding, edge) = (T.tabHeight, T.tabGap, even(0, T.tabPaddingX), .bottom)
        case .panel:
            (height, gap, edge, strongLine) = (T.panelHeight, T.panelGap, .bottom, false)
            padding = EdgeInsets(top: 0, leading: T.panelPaddingLeft, bottom: 0, trailing: T.panelPaddingRight)
        case .editor:
            (height, gap, padding) = (T.editorHeight, T.editorGap, even(0, T.editorPaddingX))
            (edge, fill) = (.bottom, .panel)
            dividers.space = T.editorDividerSpace
        case .file, .compact, .strip:
            height = T.fileHeight
            gap = variant == .compact ? T.compactGap : variant == .strip ? 0 : T.fileGap
            padding = EdgeInsets(top: 0, leading: T.filePaddingLeft, bottom: 0, trailing: T.filePaddingRight)
            (edge, fill, tone) = (variant == .strip ? .top : .bottom, .panel, variant == .compact ? .text : .textDim)
            dividers.length = T.fileDividerLength
        case .log:
            (height, gap, padding, edge) = (T.logHeight, T.logGap, even(0, T.logPaddingX), .bottom)
        case .filter:
            (gap, padding) = (T.filterGap, even(T.filterPadding, T.filterPadding))
        case .search:
            (padding, edge, strongLine) = (even(T.searchPadding, T.searchPadding), .bottom, false)
        case .merge, .footer:
            (padding, fill) = (even(T.mergePaddingY, T.mergePaddingX), .panel)
            (gap, edge) = variant == .merge ? (T.mergeGap, .bottom) : (T.footerGap, .top)
            dividers = NDividerMetrics(length: T.mergeDividerLength, space: T.mergeDividerSpace)
        case .dialog:
            (gap, edge) = (T.dialogGap, .bottom)
            padding = EdgeInsets(
                top: T.dialogPaddingTop, leading: T.dialogPaddingX, bottom: T.dialogPaddingBottom,
                trailing: T.dialogPaddingX)
        case .pane:
            (gap, padding, edge, strongLine) = (T.paneGap, even(T.panePaddingY, T.panePaddingX), .bottom, false)
        case .head:
            (gap, padding, edge, strongLine) = (T.headGap, even(T.headPaddingY, T.headPaddingX), .bottom, false)
        case .popup:
            (gap, padding, edge, strongLine) = (T.popupGap, even(T.popupPadding, T.popupPaddingX), .bottom, false)
        case .rail:
            (width, gap, edge, strongLine) = (T.railWidth, T.railGap, .right, false)
            padding = EdgeInsets(top: T.railPaddingTop, leading: 0, bottom: 0, trailing: 0)
        case .conflict:
            (minHeight, gap, rowGap, edge) = (T.conflictMinHeight, T.conflictGapX, T.conflictGapY, .bottom)
            padding = EdgeInsets(
                top: T.conflictPaddingY, leading: T.conflictPaddingLeft, bottom: T.conflictPaddingY,
                trailing: T.conflictPaddingRight)
        case .dialogFooter:
            (gap, padding, edge) = (T.dialogFooterGap, even(T.dialogFooterPaddingY, T.dialogFooterPaddingX), .top)
        }
        if placement == .bottom {
            (edge, strongLine) = (.top, true)
        }
    }

    /// The padding with the line's point added on its side, as a CSS border adds to the box.
    var insets: EdgeInsets {
        var insets = padding
        switch edge {
        case .top: insets.top += Self.line
        case .bottom: insets.bottom += Self.line
        case .right: insets.trailing += Self.line
        case nil: break
        }
        return insets
    }

    var draws: Bool { edge != nil || fill != nil || variant == .conflict }

    @MainActor
    func draw(size: CGSize, palette: Palette, in cg: CGContext) {
        if variant == .conflict {
            cg.setFillColor(
                NAvatarFace.mix(palette.cgColor(.danger), palette.cgColor(.panel), share: Self.conflictShare))
            cg.fill(CGRect(origin: .zero, size: size))
        } else if let fill {
            cg.setFillColor(palette.cgColor(fill))
            cg.fill(CGRect(origin: .zero, size: size))
        }
        guard let edge else {
            return
        }
        cg.setFillColor(palette.cgColor(strongLine ? .borderStrong : .border))
        switch edge {
        case .top: cg.fill(CGRect(x: 0, y: 0, width: size.width, height: Self.line))
        case .bottom: cg.fill(CGRect(x: 0, y: size.height - Self.line, width: size.width, height: Self.line))
        case .right: cg.fill(CGRect(x: size.width - Self.line, y: 0, width: Self.line, height: size.height))
        }
    }
}
