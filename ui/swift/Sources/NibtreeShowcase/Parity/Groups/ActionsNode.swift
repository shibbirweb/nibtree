import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Actions group's components, resolved from a scenario node.
enum ActionsNode: Sendable {
    case icon(GMIconName, NIconSize, NIconStroke, NText.Tone?)
    case layoutIcon(NLayoutIcon.Kind, active: Bool, NIconSize)
    /// FileIcon (a Feedback component), kept beside Icon.
    case fileIcon(NFileIconView?, NIconSize, plain: Bool)
    case button(ButtonProps)
    case buttonWith(ButtonProps, children: [ResolvedNode])
    case iconButton(IconButtonProps)
    case iconButtonWith(IconButtonProps, children: [ResolvedNode])
    case link(LinkProps)
    case chip(ChipProps)

    struct ChipProps: Sendable {
        let text: String
        let variant: NChip.Variant
        let tone: NChip.Tone
        let icon: GMIconName?
        let status: NStatusIcon.State?
        let fontFamily: String?
        /// The web's `onclick`, which a scenario's JSON cannot hold.
        let pressable: Bool
    }

    struct LinkProps: Sendable {
        let text: String
        let tone: NLink.Tone
        let size: NLink.Size
        let mono: Bool
        let icon: GMIconName?
        let expanded: Bool?
        let disabled: Bool
    }

    struct IconButtonProps: Sendable {
        let icon: GMIconName?
        let layout: NLayoutIcon.Kind?
        let label: String
        let iconSize: NIconSize
        let size: NIconButtonSize
        let tone: NIconButtonTone
        let active: Bool
        let spinning: Bool
        let count: String
        let title: String?
        let disabled: Bool
    }

    struct ButtonProps: Sendable {
        let text: String
        let variant: NButtonVariant
        let size: NButtonSize
        let icon: GMIconName?
        let trailingIcon: GMIconName?
        let layout: NLayoutIcon.Kind?
        let layoutActive: Bool
        let spinning: Bool
        let pressed: Bool?
        let badge: Int?
        let count: Int?
        let width: NButtonWidth
        let disabled: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Icon":
            guard let name = node.string("name").flatMap(GMIconName.init) else {
                return nil
            }
            self = .icon(
                name, node.string("size").flatMap(NIconSize.init) ?? .large,
                node.string("stroke").flatMap(NIconStroke.init) ?? .normal,
                node.string("tone").flatMap(NText.Tone.init))
        case "FileIcon":
            self = .fileIcon(
                node.object("view").flatMap(Self.fileIconView), node.string("size").flatMap(NIconSize.init) ?? .normal,
                plain: node.props?["plain"] == nil ? true : node.flag("plain"))
        case "LayoutIcon":
            guard let kind = node.string("kind").flatMap(NLayoutIcon.Kind.init) else {
                return nil
            }
            self = .layoutIcon(kind, active: node.flag("active"), node.string("size").flatMap(NIconSize.init) ?? .large)
        case "Button":
            let props = ButtonProps(
                text: node.text ?? "", variant: node.string("variant").flatMap(NButtonVariant.init) ?? .default,
                size: node.string("size").flatMap(NButtonSize.init) ?? .normal,
                icon: node.string("icon").flatMap(GMIconName.init),
                trailingIcon: node.string("trailingIcon").flatMap(GMIconName.init),
                layout: node.string("layout").flatMap(NLayoutIcon.Kind.init),
                layoutActive: node.flag("layoutActive"),
                spinning: node.flag("spinning"),
                pressed: node.props?["pressed"] == nil ? nil : node.flag("pressed"),
                badge: node.number("badge").map { Int($0) }, count: node.number("count").map { Int($0) },
                width: node.string("width").flatMap(NButtonWidth.init) ?? .auto, disabled: node.flag("disabled"))
            if let children = node.children, !children.isEmpty {
                self = .buttonWith(props, children: ResolvedNode.list(children))
            } else {
                self = .button(props)
            }
        case "IconButton":
            let props = IconButtonProps(
                icon: node.string("icon").flatMap(GMIconName.init),
                layout: node.string("layout").flatMap(NLayoutIcon.Kind.init), label: node.string("label") ?? "",
                iconSize: node.string("iconSize").flatMap(NIconSize.init) ?? .large,
                size: node.string("size").flatMap(NIconButtonSize.init) ?? .normal,
                tone: node.string("tone").flatMap(NIconButtonTone.init) ?? .default, active: node.flag("active"),
                spinning: node.flag("spinning"), count: node.string("count") ?? "", title: node.string("title"),
                disabled: node.flag("disabled"))
            if let children = node.children, !children.isEmpty {
                self = .iconButtonWith(props, children: ResolvedNode.list(children))
            } else {
                self = .iconButton(props)
            }
        case "Link":
            self = .link(
                LinkProps(
                    text: node.text ?? "", tone: node.string("tone").flatMap(NLink.Tone.init) ?? .accent,
                    size: node.string("size").flatMap(NLink.Size.init) ?? .inherit, mono: node.flag("mono"),
                    icon: node.string("icon").flatMap(GMIconName.init),
                    expanded: node.props?["expanded"] == nil ? nil : node.flag("expanded"),
                    disabled: node.flag("disabled")))
        case "Chip":
            self = .chip(
                ChipProps(
                    text: node.string("text") ?? "",
                    variant: node.string("variant").flatMap(NChip.Variant.init) ?? .filter,
                    tone: node.string("tone").flatMap(NChip.Tone.init) ?? .neutral,
                    icon: node.string("icon").flatMap(GMIconName.init),
                    status: node.string("status").flatMap(NStatusIcon.State.init),
                    fontFamily: node.string("fontFamily"),
                    pressable: node.flag("pressable")))
        default:
            return nil
        }
    }
}

extension ActionsNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .icon(let name, let size, let stroke, let tone):
            NIcon(name, size: size, stroke: stroke, tone: tone)
        case .fileIcon(let view, let size, let plain):
            NFileIcon(view: view, size: size, plain: plain)
        case .layoutIcon(let kind, let active, let size):
            NLayoutIcon(kind: kind, active: active, size: size)
        case .button(let props):
            NButton(
                props.text, variant: props.variant, size: props.size, icon: props.icon,
                trailingIcon: props.trailingIcon, layout: props.layout, layoutActive: props.layoutActive,
                spinning: props.spinning, pressed: props.pressed, badge: props.badge, count: props.count,
                width: props.width, disabled: props.disabled
            ) {}
        case .buttonWith(let props, let children):
            NButton(
                variant: props.variant, size: props.size, icon: props.icon, trailingIcon: props.trailingIcon,
                pressed: props.pressed, badge: props.badge, count: props.count, width: props.width,
                disabled: props.disabled
            ) {
            } label: {
                // Button.svelte's ghost label: one row, `--space-2` apart.
                NStack(direction: .row, gap: .xs, align: .center) { ScenarioChildren(nodes: children) }
            }
        case .iconButton(let props):
            NIconButton(
                icon: props.icon, layout: props.layout, label: props.label, iconSize: props.iconSize, size: props.size,
                tone: props.tone, active: props.active, spinning: props.spinning, count: props.count,
                title: props.title, disabled: props.disabled
            ) {}
        case .iconButtonWith(let props, let children):
            NIconButton(
                icon: props.icon, layout: props.layout, name: props.label, iconSize: props.iconSize, size: props.size,
                tone: props.tone, active: props.active, spinning: props.spinning, count: props.count,
                title: props.title, disabled: props.disabled
            ) {
            } label: {
                ScenarioChildren(nodes: children)
            }
        case .link(let props):
            NLink(
                props.text, tone: props.tone, size: props.size, mono: props.mono, icon: props.icon,
                expanded: props.expanded, disabled: props.disabled
            ) {}
        case .chip(let props):
            NChip(
                props.text, variant: props.variant, tone: props.tone, icon: props.icon, status: props.status,
                fontFamily: props.fontFamily, action: props.pressable ? {} : nil)
        }
    }
}

extension ActionsNode {
    /// The app's icon sets, at the repository's static/file-icons.
    private static let fileIcons = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().appendingPathComponent("../../../../../../static/file-icons").standardized

    private static let maskTones: [String: GMColorToken] = [
        "gray": .textDim, "blue": .termBlue, "cyan": .termCyan, "green": .success, "yellow": .termYellow,
        "orange": .warning, "red": .danger, "purple": .termMagenta, "accent": .accent,
    ]

    /// A scenario's `{ kind: "image", icon }` (Material) or `{ kind: "mask", glyph, tone }` (Minimal).
    static func fileIconView(_ view: [String: String]) -> NFileIconView? {
        if view["kind"] == "image", let icon = view["icon"] {
            return .image(fileIcons.appendingPathComponent("material/\(icon).svg"))
        }
        if view["kind"] == "mask", let glyph = view["glyph"] {
            let tone = maskTones[view["tone"] ?? ""] ?? .textDim
            return .mask(fileIcons.appendingPathComponent("minimal/\(glyph).svg"), tone: tone)
        }
        return nil
    }
}
