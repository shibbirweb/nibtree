import NibtreeTokens
import SwiftUI

/// One part of a path in `NBreadcrumbs`: its name, an icon (or a file type icon) and what it is.
public struct NCrumb: Hashable, Sendable {
    public enum Kind: String, CaseIterable, Sendable {
        case repo, folder, file
    }

    /// The icon before the name: one of the library's, or a file type icon (nil: the plain file icon).
    public enum Lead: Hashable, Sendable {
        case icon(GMIconName)
        case file(NFileIconView?)
    }

    public let label: String
    public let lead: Lead?
    public let kind: Kind

    public init(_ label: String, icon: GMIconName? = nil, kind: Kind = .folder) {
        self.label = label
        lead = icon.map { .icon($0) }
        self.kind = kind
    }

    public init(_ label: String, fileIcon: NFileIconView?, kind: Kind = .folder) {
        self.label = label
        lead = .file(fileIcon)
        self.kind = kind
    }
}

/// A path as crumbs, like the Navigation Bar: the Swift side of ui/web `Breadcrumbs` (docs/components/Breadcrumbs.md).
/// Each part is a small button, separated by chevrons; the repository is in the accent color, the file bold; `open`
/// marks the crumb whose list is showing. When narrow, the farthest crumbs shorten first and the file name last; what
/// still does not fit goes off the left edge. `floating` and `anchored` are the bar on its own, in a box with a shadow:
/// the web places it with `position: fixed` (`at` for anchored), SwiftUI's caller with an overlay. The web's `title`
/// is SwiftUI's `.help`, its `element` the caller's own. The crumbs are drawn in one canvas.
public struct NBreadcrumbs: View {
    public enum Variant: String, CaseIterable, Sendable {
        case inline, floating, anchored
    }

    private let look: NBreadcrumbsLook
    private let label: String
    private let onSelect: ((Int) -> Void)?
    @State private var hovered: Int?

    public init(
        crumbs: [NCrumb], label: String = "Path", open: Int? = nil, variant: Variant = .inline,
        onSelect: ((Int) -> Void)? = nil
    ) {
        look = NBreadcrumbsLook(crumbs: crumbs, open: open, boxed: variant != .inline)
        self.label = label
        self.onSelect = onSelect
    }

    public var body: some View {
        bar
            .onContinuousHover { phase in
                if case .active(let point) = phase {
                    hovered = look.placed.crumb(at: point.x)
                } else {
                    hovered = nil
                }
            }
            .onTapGesture(coordinateSpace: .local) { point in
                if let index = look.placed.crumb(at: point.x) {
                    onSelect?(index)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityChildren {
                ForEach(Array(look.crumbs.enumerated()), id: \.offset) { index, crumb in
                    Button(crumb.label) { onSelect?(index) }
                }
            }
    }

    @ViewBuilder private var bar: some View {
        let frame = NBreadcrumbsFrame(look: look) { NBreadcrumbsFace(look: look, hovered: hovered) }
        if look.boxed {
            frame.background { NPopupBox(radius: GMRadius.control) }
        } else {
            frame
        }
    }
}

/// Every crumb and separator in one canvas: the open or hovered crumb's background, icons and names.
private struct NBreadcrumbsFace: View {
    let look: NBreadcrumbsLook
    let hovered: Int?

    var body: some View {
        let (look, hovered) = (look, hovered)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    if look.boxed {
                        // The box's border clips what overflows, like the nav's `overflow: hidden`.
                        let border = NBreadcrumbsLook.cssBorder
                        cg.clip(to: CGRect(origin: .zero, size: size).insetBy(dx: border, dy: border))
                    }
                    NBreadcrumbsPaint(look: look, hovered: hovered, size: size, palette: palette, scale: scale)
                        .draw(in: cg)
                }
            }
        }
    }
}
