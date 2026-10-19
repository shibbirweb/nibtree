import NibtreeTokens
import SwiftUI

/// How the strip lays its tabs out: one `scroll`ing row, `wrap`ped rows (each tab with its bottom line), or a
/// `single` tab drawn as a centered name without a tab's frame.
public enum NEditorTabLayout: String, CaseIterable, Sendable {
    case scroll, wrap, single
}

/// An editor tab's look: `flat` (the strip's own) or `rounded` (rounded tabs on the editor color).
public enum NEditorTabLookStyle: String, CaseIterable, Sendable {
    case flat, rounded
}

/// An icon's color on a tab, such as a run's state.
public enum NEditorTabIconTone: String, CaseIterable, Sendable {
    case success, danger, dim

    var token: GMColorToken {
        switch self {
        case .success: .success
        case .danger: .danger
        case .dim: .textDim
        }
    }
}

/// What a tab shows: its name, icon and hint, its tooltip, and whether it is a preview (italic), unsaved (a dot),
/// pinned, mono (a commit's hash) or fixed (it cannot be dragged, like the Diff tab).
public struct NEditorTabData: Sendable {
    public let id: String
    public let label: String
    public let icon: GMIconName?
    public let iconTone: NEditorTabIconTone?
    public let hint: String?
    public let title: String?
    public let preview: Bool
    public let dirty: Bool
    public let pinned: Bool
    public let mono: Bool
    public let fixed: Bool

    public init(
        id: String, label: String, icon: GMIconName? = nil, iconTone: NEditorTabIconTone? = nil, hint: String? = nil,
        title: String? = nil, preview: Bool = false, dirty: Bool = false, pinned: Bool = false, mono: Bool = false,
        fixed: Bool = false
    ) {
        self.id = id
        self.label = label
        self.icon = icon
        self.iconTone = iconTone
        self.hint = hint
        self.title = title
        self.preview = preview
        self.dirty = dirty
        self.pinned = pinned
        self.mono = mono
        self.fixed = fixed
    }
}

/// One editor tab of a TabStrip: icon, name, hint and the close button (a dot while unsaved, a pin that unpins with
/// `onUnpin`): the Swift side of ui/web `EditorTab` (docs/components/EditorTab.md). The strip passes the layout, look
/// and focus; the tab draws active, preview, pinned, dirty and `lifted` (being dragged). One canvas draws the tab;
/// the close button is the only other view. The web's `oncontextmenu` is the caller's `.contextMenu`, and dragging
/// (`onpointerdown`) follows with the TabStrip.
public struct NEditorTab: View {
    private let look: NEditorTabLook
    private let onSelect: (() -> Void)?
    private let doubleAction: (() -> Void)?
    private let onClose: (() -> Void)?
    private let onUnpin: (() -> Void)?
    private let placed = NEditorTabPlaced()
    @State private var hovering = false

    public init(
        tab: NEditorTabData, active: Bool = false, focused: Bool = true, layout: NEditorTabLayout = .scroll,
        look: NEditorTabLookStyle = .flat, lifted: Bool = false, closable: Bool = true,
        onSelect: (() -> Void)? = nil, doubleAction: (() -> Void)? = nil, onClose: (() -> Void)? = nil,
        onUnpin: (() -> Void)? = nil
    ) {
        self.look = NEditorTabLook(
            tab: tab, active: active, focused: focused, layout: layout, look: look, lifted: lifted, closable: closable)
        self.onSelect = onSelect
        self.doubleAction = doubleAction
        self.onClose = onClose
        self.onUnpin = onUnpin
    }

    public var body: some View {
        let (look, placed, hot) = (look, placed, hovering)
        let reach = look.lifted ? NPopupBox.reach : 0
        let unpins = look.tab.pinned && onUnpin != nil
        NEditorTabFrame(look: look, placed: placed, reach: reach) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(
                            hovering: hot, placed: placed, reach: reach, size: size, palette: palette, scale: scale,
                            in: cg)
                    }
                }
            }
            if look.closable {
                NEditorTabClose(
                    dirty: look.tab.dirty, pinned: look.tab.pinned,
                    shown: hot || look.active || look.tab.pinned || look.layout == .single,
                    title: Self.closeTitle(look.tab, unpins: unpins)
                ) {
                    if unpins {
                        onUnpin?()
                    } else {
                        onClose?()
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onHover { inside in
            hovering = inside
            let title = look.tab.title ?? look.tab.label
            if inside {
                NHoverHelpHost.show(title)
            } else {
                NHoverHelpHost.hide(title)
            }
        }
        .onTapGesture(count: 2) { doubleAction?() }
        .onTapGesture { onSelect?() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.tab.label)
        .accessibilityAddTraits(look.active ? [.isSelected, .isButton] : .isButton)
    }

    /// The close button's tooltip: the tab's state, then what the button does.
    static func closeTitle(_ tab: NEditorTabData, unpins: Bool) -> String {
        let state =
            unpins ? (tab.dirty ? "Pinned, unsaved changes. " : "Pinned. ") : tab.dirty ? "Unsaved changes. " : ""
        return state + (unpins ? "Unpin" : "Close")
    }
}

/// The close button: a dot while unsaved (the x under the pointer), the x or a pin, on a darker square when pointed at.
private struct NEditorTabClose: View {
    let dirty: Bool
    let pinned: Bool
    let shown: Bool
    let title: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        let (dirty, pinned, shown, hot) = (dirty, pinned, shown, hovering)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    let box = CGRect(origin: .zero, size: size)
                    if hot {
                        let radius = GMRadius.small
                        cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
                        cg.setFillColor(palette.cgColor(.borderStrong))
                        cg.fillPath()
                    }
                    if dirty && !hot {
                        let dot = GMEditorTabTokens.dirtyDot
                        cg.setFillColor(palette.cgColor(.textDim))
                        cg.fillEllipse(in: CGRect(x: (size.width - dot) / 2, y: (size.height - dot) / 2, width: dot,
                            height: dot))
                        return
                    }
                    guard shown || hot else {
                        return
                    }
                    let points = NIconSize.compact.points
                    let color = palette.cgColor(hot ? .text : .textDim)
                    let key = NIconImages.Key(
                        name: pinned ? .pin : .x, points: points, lineWidth: NIconStroke.normal.width, scale: scale,
                        color: color)
                    if let image = NIconImages.image(key, color: color) {
                        let corner = ((size.width - points) / 2 * scale).rounded() / scale
                        cg.translateBy(x: corner, y: corner + points)
                        cg.scaleBy(x: 1, y: -1)
                        cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                    }
                }
            }
        }
        .frame(width: GMTabStripTokens.closeSize, height: GMTabStripTokens.closeSize)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .onHover { inside in
            hovering = inside
            if inside {
                NHoverHelpHost.show(title)
            } else {
                NHoverHelpHost.hide(title)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

/// The tab's size (`NEditorTabLook.width` and `height`), the canvas over it (larger by `reach` for a lifted tab's
/// shadow) and the close button at its end.
private struct NEditorTabFrame: Layout {
    let look: NEditorTabLook
    let placed: NEditorTabPlaced
    let reach: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = MainActor.assumeIsolated { look.width(offer: offer) }
        // A wrapped tab's `margin-bottom: -1px` lays its line over the row's: it takes a point less than it draws.
        let height = look.height(offer: proposal.height.flatMap { $0.isFinite ? $0 : nil }) - look.bottomLine
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in placedBounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var bounds = placedBounds
        bounds.size.height += look.bottomLine
        placed.origin = CGPoint(x: bounds.minX - reach, y: bounds.minY - reach)
        subviews.first?.place(
            at: placed.origin, anchor: .topLeading,
            proposal: ProposedViewSize(width: bounds.width + 2 * reach, height: bounds.height + 2 * reach))
        let side = GMTabStripTokens.closeSize
        subviews.dropFirst().first?.place(
            at: CGPoint(
                x: bounds.maxX - look.outerRight - side, y: bounds.minY + (bounds.height - look.bottomLine - side) / 2),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: side, height: side))
    }
}
