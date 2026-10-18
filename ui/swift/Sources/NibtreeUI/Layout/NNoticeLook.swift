import NibtreeTokens
import SwiftUI

/// A notice's sizes and colors, worked out once from its props as Notice.svelte's classes do.
struct NNoticeLook: Sendable {
    let tone: GMColorToken
    let banner: Bool
    let icon: GMIconName
    let iconPoints: CGFloat
    /// A plain message, drawn in the notice's own canvas; nil when the message is a view.
    let words: NTextSpec?
    let padding: CGSize
    let gap: CGFloat

    /// Notice.svelte's `1px solid` border under a banner.
    nonisolated static let cssBorder = 1.0

    @MainActor
    init(text: String?, tone: NNoticeTone, variant: NNoticeVariant, icon: GMIconName?) {
        banner = variant == .banner
        self.tone = switch tone {
        case .danger: .danger
        case .warning: .warning
        case .info: .accent
        case .success: .success
        }
        self.icon = icon ?? Self.icons[tone] ?? .lightbulb
        iconPoints = banner ? NIconSize.regular.points : NIconSize.large.points
        padding = banner
            ? CGSize(width: GMBannerTokens.paddingX, height: GMBannerTokens.paddingY)
            : CGSize(width: GMNoticeTokens.paddingX, height: GMNoticeTokens.paddingY)
        gap = banner ? GMBannerTokens.gap : GMNoticeTokens.gap
        words = text.map { text in
            let font = NTypography.FontKey(GMTextStyles.body)
            return NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        }
    }

    private static let icons: [NNoticeTone: GMIconName] = [
        .danger: .alert, .warning: .alert, .info: .lightbulb, .success: .check,
    ]

    /// The background: the tone mixed into the panel, a little more in a banner (but a danger one).
    func background(_ palette: Palette) -> CGColor {
        let share = banner && tone != .danger ? 0.12 : 0.1
        return NAvatarFace.mix(palette.cgColor(tone), palette.cgColor(.panel), share: share)
    }

    var bottom: CGFloat { banner ? Self.cssBorder : 0 }
}

/// Which part of the notice a subview is.
enum NNoticePart: LayoutValueKey {
    enum Part {
        case face, message, action
    }

    static let defaultValue = Part.face
}

/// The notice's room: as wide as it is offered (CSS `align-self: stretch`), the icon, the message taking what is left
/// and wrapping in it, then the action; everything centered on the tallest.
struct NNoticeFrame: Layout {
    let look: NNoticeLook

    struct Cache {
        var width: CGFloat?? = .none
        var layout: NTextEngine.Layout?
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    private func part(_ subviews: Subviews, _ part: NNoticePart.Part) -> LayoutSubview? {
        subviews.first { $0[NNoticePart.self] == part }
    }

    /// The message's width, its size and the action's size, for a notice `width` wide (nil: as wide as it likes).
    private func measure(_ width: CGFloat?, _ subviews: Subviews, _ cache: inout Cache)
        -> (room: CGFloat?, message: CGSize, action: CGSize?)
    {
        let action = part(subviews, .action)?.sizeThatFits(.unspecified)
        let used = 2 * look.padding.width + look.iconPoints + look.gap + (action.map { $0.width + look.gap } ?? 0)
        let room = width.map { max(0, $0 - used) }
        if let words = look.words {
            var fresh = cache.layout != nil
            if case .some(let cached) = cache.width, cached != room {
                fresh = false
            }
            if !fresh {
                cache = Cache(width: .some(room), layout: MainActor.assumeIsolated { words.layout(width: room) })
            }
            let layout = cache.layout
            let size = CGSize(
                width: room ?? layout?.width ?? 0, height: CGFloat(layout?.lines.count ?? 0) * words.line.height)
            return (room, size, action)
        }
        let message = part(subviews, .message)?.sizeThatFits(ProposedViewSize(width: room, height: nil)) ?? .zero
        return (room, CGSize(width: room ?? message.width, height: message.height), action)
    }

    private func height(_ message: CGSize, _ action: CGSize?) -> CGFloat {
        max(look.iconPoints, message.height, action?.height ?? 0) + 2 * look.padding.height + look.bottom
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let (_, message, action) = measure(offer, subviews, &cache)
        let natural = 2 * look.padding.width + look.iconPoints + look.gap + message.width
            + (action.map { $0.width + look.gap } ?? 0)
        return CGSize(width: offer ?? natural, height: height(message, action))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let (room, message, action) = measure(bounds.width, subviews, &cache)
        if let words = look.words {
            words.state.layout = cache.layout
            words.state.origin = bounds.origin
        }
        let middle = bounds.minY + (bounds.height - look.bottom) / 2
        let left = bounds.minX + look.padding.width + look.iconPoints + look.gap
        for subview in subviews {
            switch subview[NNoticePart.self] {
            case .face:
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            case .message:
                let proposal = ProposedViewSize(width: room, height: nil)
                subview.place(at: CGPoint(x: left, y: middle), anchor: .leading, proposal: proposal)
            case .action:
                let spot = CGPoint(x: left + message.width + look.gap, y: middle)
                subview.place(at: spot, anchor: .leading, proposal: ProposedViewSize(action ?? .zero))
            }
        }
    }
}
