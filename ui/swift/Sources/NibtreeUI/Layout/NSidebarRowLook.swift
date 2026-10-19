import NibtreeTokens
import SwiftUI

/// Everything a sidebar row draws, worked out once from its props as SidebarRow.svelte's classes do, and where each
/// part goes in a row of a given width (CSS flex: the name takes what the others leave).
struct NSidebarRowLook: Sendable {
    /// The `.actions` span's `gap: 1px` between the row's buttons.
    nonisolated static let actionsGap = 1.0

    let label: NTextSpec
    let path: NTextSpec?
    let count: NTextSpec?
    let ahead: NTextSpec?
    let behind: NTextSpec?
    let detail: NTextSpec?
    let icon: GMIconName?
    let current: Bool
    let section: Bool
    let expanded: Bool?
    let selected: Bool
    let gone: Bool
    let indent: CGFloat

    @MainActor
    init(_ props: NSidebarRowProps) {
        let spec = { (text: String, font: NTypography.FontKey, kerning: CGFloat, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: kerning, tabular: false, truncate: true,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.xsmall)
        if props.section {
            let style = GMTextStyles.sectionLabel
            label = spec(
                props.label.uppercased(), NTypography.FontKey(style), style.letterSpacing * style.size, .textDim)
        } else {
            let weight = props.strong ? GMFontWeight.semibold : nil
            label = spec(props.label, NTypography.FontKey(GMTextStyles.body, weight: weight), 0, .text)
        }
        let compact = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.compact)
        path = props.path.isEmpty ? nil : spec(props.path, compact, 0, .textDim)
        count = props.count.map { spec(String($0), small, 0, .textFaint) }
        ahead = props.ahead > 0 ? spec(String(props.ahead), small, 0, .textDim) : nil
        behind = props.behind > 0 ? spec(String(props.behind), small, 0, .textDim) : nil
        detail = props.detail.isEmpty ? nil : spec(props.detail, small, 0, .textDim)
        icon = props.icon
        current = props.current
        section = props.section
        expanded = props.expanded
        selected = props.selected
        gone = props.gone
        let depth = CGFloat(props.depth.level) * GMSidebarRowTokens.indent
        // A row without a chevron is indented by the chevron's width instead, so names line up with their group's.
        indent = GMSidebarRowTokens.paddingLeft + depth + (props.expanded == nil ? GMSidebarRowTokens.chevron : 0)
    }

    /// Where the parts of a row `width` wide go, with actions `actions` wide when they show (nil when hidden).
    struct Parts {
        var chevron: CGFloat?
        var icon: CGFloat?
        var label: CGFloat = 0
        var labelWidth: CGFloat = 0
        var count: CGFloat?
        var sync: CGFloat?
        var detail: CGFloat?
        var actions: CGFloat?
    }

    @MainActor
    func width(_ spec: NTextSpec?) -> CGFloat {
        spec.map { NTextMetrics.width(of: $0.text, font: $0.font, kerning: $0.kerning) } ?? 0
    }

    /// The ahead and behind numbers with their arrows, 4 points apart.
    @MainActor
    var syncWidth: CGFloat? {
        let arrow = NIconSize.xsmall.points
        let parts = [ahead, behind].compactMap { $0 }.map { width($0) + arrow }
        return parts.isEmpty ? nil : parts.reduce(0, +) + CGFloat(parts.count - 1) * GMSpace.s2
    }

    /// The name and its path: what the name's flex item holds.
    @MainActor
    var labelNatural: CGFloat { width(label) + (path.map { GMSpace.s3 + width($0) } ?? 0) }

    /// The room before the name: the indent, the chevron and the icon with their gaps.
    var lead: CGFloat {
        let gap = GMSidebarRowTokens.gap
        return indent + (expanded != nil ? GMSidebarRowTokens.chevron + gap : 0)
            + (icon != nil ? NIconSize.normal.points + gap : 0)
    }

    /// The fixed items after the name (count, ahead and behind, detail, actions), each with the gap before it.
    @MainActor
    func tail(actions: CGFloat?, detailShown: Bool) -> CGFloat {
        let items = [count.map { width($0) }, syncWidth, detailShown ? width(detail) : nil, actions]
        return items.compactMap { $0 }.reduce(0) { $0 + GMSidebarRowTokens.gap + $1 }
    }

    /// The row's width with nothing on offer: every part at its own width.
    @MainActor
    func naturalWidth(actions: CGFloat?, actionsAcceptDetail: Bool) -> CGFloat {
        lead + labelNatural + tail(actions: actions, detailShown: detail != nil && actionsAcceptDetail)
            + GMSidebarRowTokens.paddingRight
    }

    @MainActor
    func parts(width rowWidth: CGFloat, actions: CGFloat?, actionsAcceptDetail: Bool) -> Parts {
        let gap = GMSidebarRowTokens.gap
        var parts = Parts()
        var x = indent
        if expanded != nil {
            parts.chevron = x
            x += GMSidebarRowTokens.chevron + gap
        }
        if icon != nil {
            parts.icon = x
            x += NIconSize.normal.points + gap
        }
        let detailShown = detail != nil && actionsAcceptDetail
        let fixed = tail(actions: actions, detailShown: detailShown)
        let right = rowWidth - GMSidebarRowTokens.paddingRight
        parts.label = x
        parts.labelWidth = section ? min(labelNatural, max(0, right - x - fixed)) : max(0, right - x - fixed)
        x += parts.labelWidth
        if let count {
            parts.count = x + gap
            x += gap + width(count)
        }
        if let sync = syncWidth {
            parts.sync = x + gap
            x += gap + sync
        }
        if detailShown, let detail {
            parts.detail = x + gap
            x += gap + width(detail)
        }
        if let actions {
            // A section's buttons sit at the row's end (`margin-left: auto`).
            parts.actions = section ? max(x + gap, right - actions) : x + gap
        }
        return parts
    }
}

/// What a sidebar row shows, as SidebarRow.svelte's props.
struct NSidebarRowProps: Sendable {
    let label: String
    let depth: NSidebarRowDepth
    let icon: GMIconName?
    let current: Bool
    let strong: Bool
    let section: Bool
    let expanded: Bool?
    let count: Int?
    let ahead: Int
    let behind: Int
    let path: String
    let detail: String
    let gone: Bool
    let selected: Bool
}
