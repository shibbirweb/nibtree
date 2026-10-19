import NibtreeTokens
import SwiftUI

/// A file row's look: `changes` (the Changes panel, indented under its group) or `list` (a plain list of a branch's
/// or commit's files: no indent, a lighter letter).
public enum NFileRowVariant: String, CaseIterable, Sendable {
    case changes, list
}

/// One of a file row's buttons, such as Stage or Discard: an icon with its tooltip, red on hover when `danger`.
public struct NFileRowAction: Sendable {
    public let icon: GMIconName
    public let title: String
    public let danger: Bool
    public let run: @MainActor @Sendable () -> Void

    public init(icon: GMIconName, title: String, danger: Bool = false, run: @escaping @MainActor @Sendable () -> Void) {
        self.icon = icon
        self.title = title
        self.danger = danger
        self.run = run
    }
}

/// A changed file in a list: its status letter, type icon, name and dim folder, an optional tag and the actions that
/// show on hover (stage, discard...): the Swift side of ui/web `FileRow` (docs/components/FileRow.md). A click calls
/// `onSelect`, a double click `onActivate`. `checked` adds a box for lists that pick files, such as Shelve. One canvas
/// draws all of it but the buttons. `title` is the row's tooltip; the web's `id`, `keepFocus` and `oncontextmenu`
/// belong to its lists (the context menu is the caller's `.contextMenu`). A selected row takes the inactive selection
/// color until the lists' focus follows with the ListBox component.
public struct NFileRow: View {
    private let look: NFileRowLook
    @Binding private var checked: Bool
    private let title: String?
    private let actions: [NFileRowAction]
    private let onSelect: (() -> Void)?
    private let onActivate: (() -> Void)?
    private let placed = NFileRowPlaced()
    @State private var hovering = false

    public init(
        kind: NStatusLetter.Kind?, name: String, directory: String = "", note: String = "", badge: String = "",
        icon: NFileIconView? = nil, selected: Bool = false, nested: Bool = false, variant: NFileRowVariant = .changes,
        checked: Binding<Bool>? = nil, title: String? = nil, actions: [NFileRowAction] = [],
        onSelect: (() -> Void)? = nil, onActivate: (() -> Void)? = nil
    ) {
        look = NFileRowLook(
            kind: kind, name: name, directory: directory, note: note, badge: badge, icon: icon, selected: selected,
            nested: nested, variant: variant, checked: checked?.wrappedValue)
        _checked = checked ?? .constant(false)
        self.title = title
        self.actions = actions
        self.onSelect = onSelect
        self.onActivate = onActivate
    }

    public var body: some View {
        let (look, placed, hot) = (look, placed, hovering)
        NFileRowLayout(look: look, placed: placed) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    look.draw(hovering: hot, placed: placed, size: size, in: context)
                }
            }
            if hot && !actions.isEmpty {
                HStack(spacing: NFileRowLook.actionsGap) {
                    ForEach(actions.indices, id: \.self) { index in
                        NFileRowButton(action: actions[index])
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onHover { inside in
            hovering = inside
            if let title {
                if inside {
                    NHoverHelpHost.show(title)
                } else {
                    NHoverHelpHost.hide(title)
                }
            }
        }
        .onTapGesture(count: 2) { onActivate?() }
        .onTapGesture { location in
            // The checkbox flips itself and does not select the row, as the web's stops the click.
            let parts = look.parts(width: .infinity, actions: nil)
            if let x = parts.checkbox, location.x >= x, location.x <= x + NCheckboxBox.side {
                checked.toggle()
            } else {
                onSelect?()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel([look.name.text, look.directory?.text ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityValue(look.kind?.label ?? "Conflicted")
        .accessibilityAddTraits(look.selected ? [.isSelected, .isButton] : .isButton)
    }
}

/// One row button: its icon dim, brighter (red when `danger`) on a darker square under the pointer.
private struct NFileRowButton: View {
    let action: NFileRowAction
    @State private var hovering = false

    var body: some View {
        let (action, hot) = (action, hovering)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    if hot {
                        let radius = GMRadius.small
                        cg.addPath(
                            CGPath(
                                roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius,
                                cornerHeight: radius, transform: nil))
                        cg.setFillColor(palette.cgColor(.borderStrong))
                        cg.fillPath()
                    }
                    let points = NIconSize.medium.points
                    let color = palette.cgColor(hot ? (action.danger ? .danger : .text) : .textDim)
                    let key = NIconImages.Key(
                        name: action.icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale,
                        color: color)
                    guard let image = NIconImages.image(key, color: color) else {
                        return
                    }
                    let corner = ((size.width - points) / 2 * scale).rounded() / scale
                    cg.translateBy(x: corner, y: corner + points)
                    cg.scaleBy(x: 1, y: -1)
                    cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                }
            }
        }
        .frame(width: GMFileRowTokens.actionSize, height: GMFileRowTokens.actionSize)
        .contentShape(Rectangle())
        .onTapGesture { action.run() }
        .onHover { inside in
            hovering = inside
            if inside {
                NHoverHelpHost.show(action.title)
            } else {
                NHoverHelpHost.hide(action.title)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(action.title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action.run() }
    }
}

/// The row's size (the token height, the width on offer or its parts' natural width), the canvas filling it and the
/// buttons where `NFileRowLook.parts` puts them.
private struct NFileRowLayout: Layout {
    let look: NFileRowLook
    let placed: NFileRowPlaced

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        if let width = proposal.width, width.isFinite {
            return CGSize(width: width, height: GMFileRowTokens.height)
        }
        let actions = subviews.dropFirst().first?.sizeThatFits(.unspecified).width
        let natural = MainActor.assumeIsolated {
            let parts = look.parts(width: 0, actions: actions)
            return parts.text + look.textNatural + look.paddingRight
                + [look.tagWidth, actions].compactMap { $0 }.reduce(0) { $0 + look.gap + $1 }
        }
        return CGSize(width: natural, height: GMFileRowTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        guard let actions = subviews.dropFirst().first else {
            placed.actions = nil
            return
        }
        let size = actions.sizeThatFits(.unspecified)
        placed.actions = size.width
        let parts = MainActor.assumeIsolated { look.parts(width: bounds.width, actions: size.width) }
        actions.place(
            at: CGPoint(x: bounds.minX + (parts.actions ?? 0), y: bounds.midY), anchor: .leading,
            proposal: ProposedViewSize(size))
    }
}
