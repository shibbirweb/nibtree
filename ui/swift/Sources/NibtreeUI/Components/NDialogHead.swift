import NibtreeTokens
import SwiftUI

/// The tone of a dialog head's icon tile.
public enum NDialogHeadIconTone: String, CaseIterable, Sendable {
    case accent, success, warning, danger

    var token: GMColorToken {
        switch self {
        case .accent: .accent
        case .success: .success
        case .warning: .warning
        case .danger: .danger
        }
    }
}

/// `normal` heads a dialog's body, `panel` a panel dialog (Dialog's `panel` variant), `content` a split dialog's
/// content with its close button at the end (Settings' head).
public enum NDialogHeadSize: String, CaseIterable, Sendable {
    case normal, panel, content
}

/// A dialog's head when it has more than a title: an icon on a tinted tile, the title with a dim subtitle under it,
/// and a close button when `onClose` is given (and there is no icon): the Swift side of ui/web `DialogHead`
/// (docs/components/DialogHead.md). One canvas draws the tile, the title and the subtitle; the close button is an
/// `NIconButton`. The web's `titleId` ties the dialog to its title for screen readers; here the head is a header.
public struct NDialogHead: View {
    private let look: NDialogHeadLook
    private let onClose: (() -> Void)?

    public init(
        title: String, subtitle: String = "", icon: GMIconName? = nil, iconTone: NDialogHeadIconTone = .accent,
        size: NDialogHeadSize = .normal, onClose: (() -> Void)? = nil
    ) {
        look = NDialogHeadLook(
            title: title, subtitle: subtitle, icon: icon, iconTone: iconTone, size: size,
            closes: onClose != nil && icon == nil)
        self.onClose = onClose
    }

    public var body: some View {
        let look = look
        NDialogHeadLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(palette: palette, scale: scale, in: cg)
                    }
                }
            }
            if look.closes, let onClose {
                NIconButton(icon: .x, label: "Close", iconSize: .normal, action: onClose)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.title.text)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The head's row: padding, the tile, the words (as wide as the rest) and the close button, aligned at the top or
/// centered; the face under all of it. A normal head keeps `--dialog-head-bottom` under itself.
private struct NDialogHeadLayout: Layout {
    let look: NDialogHeadLook

    @MainActor
    private func measure(_ subviews: Subviews, width: CGFloat?) -> (row: CGFloat, close: CGSize?, words: CGFloat?) {
        let close = subviews.count > 1 ? subviews[1].sizeThatFits(.unspecified) : nil
        let padding = look.padding
        let room = width.map {
            $0 - padding.left - padding.right - look.tileRoom - (close.map { $0.width + look.gap } ?? 0)
        }
        let words = look.layOut(width: room.map { max(1, $0) })
        let row = max(look.tile ?? 0, words.height, close?.height ?? 0)
        return (row, close, room ?? words.width)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        MainActor.assumeIsolated {
            let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
            let measured = measure(subviews, width: width)
            let padding = look.padding
            let natural = padding.left + padding.right + look.tileRoom + (measured.words ?? 0)
                + (measured.close.map { $0.width + look.gap } ?? 0)
            return CGSize(
                width: width ?? natural, height: padding.top + measured.row + padding.bottom + look.marginBottom)
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let measured = measure(subviews, width: bounds.width)
            look.placed.origin = bounds.origin
            look.placed.row = measured.row
            subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            if let close = measured.close {
                let padding = look.padding
                let top = look.centered ? (measured.row - close.height) / 2 : 0
                subviews[1].place(
                    at: CGPoint(x: bounds.maxX - padding.right - close.width, y: bounds.minY + padding.top + top),
                    anchor: .topLeading, proposal: ProposedViewSize(close))
            }
        }
    }
}
