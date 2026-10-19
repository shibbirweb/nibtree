import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The bars around the app's content (status bar and its items), resolved from a scenario node.
enum ChromeNode: Sendable {
    case statusBar(label: String, look: NStatusBarLook, start: [ResolvedNode], end: [ResolvedNode])
    case statusItem(StatusItemProps, leading: [ResolvedNode]?, trailing: [ResolvedNode]?)
    case sectionTitle(SectionTitleProps, actions: [ResolvedNode]?)
    case searchToggles(NSearchOptions, compact: Bool, titles: NSearchToggleTitles)
    case themeSwatch(NThemeSwatchColors, label: String)
    case zoomBadge(open: Bool, text: String)
    case loadingOverlay(open: Bool, title: String, step: String, hint: String)
    case resourceLink(icon: GMIconName, title: String, description: String, variant: NResourceLinkVariant)
    /// `closable` is the scenario's stand-in for the web's `onclose`.
    case dialogHead(
        title: String, subtitle: String, icon: GMIconName?, iconTone: NDialogHeadIconTone, size: NDialogHeadSize,
        closable: Bool)
    case sideNav(items: [NSideNavItem], active: String?, label: String, variant: NSideNavVariant, emptyText: String)
    case choiceList(choices: [NChoice<String>], label: String)
    case tabs(tabs: [NTab<String>], value: String, label: String, variant: NTabsVariant, keepFocus: Bool)
    case segmented(
        options: [NSegmentedOption<String>], value: String, label: String, disabled: Bool, size: NSegmentedSize,
        variant: NSegmentedVariant)

    struct SectionTitleProps: Sendable {
        let title: String
        let matches: [Range<Int>]
        let variant: NSectionTitleVariant
        let count: Int?
        let heading: NSectionTitleHeading?
    }

    struct StatusItemProps: Sendable {
        let text: String
        let icon: GMIconName?
        let label: String?
        let tone: NStatusItemTone
        let open, spin: Bool
        let variant: NStatusItemVariant
        let active, disabled: Bool
        let limit: NStatusItemLimit
        /// The scenario's stand-in for the web's `onclick`.
        let pressable: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "StatusBar":
            self = .statusBar(
                label: node.string("label") ?? "Status bar",
                look: node.string("look").flatMap(NStatusBarLook.init) ?? .flat,
                start: ResolvedNode.list(node.slots?["start"]), end: ResolvedNode.list(node.slots?["end"]))
        case "StatusItem":
            let props = StatusItemProps(
                text: node.string("text") ?? "", icon: node.string("icon").flatMap(GMIconName.init),
                label: node.string("label"), tone: node.string("tone").flatMap(NStatusItemTone.init) ?? .default,
                open: node.flag("open"), spin: node.flag("spin"),
                variant: node.string("variant").flatMap(NStatusItemVariant.init) ?? .default,
                active: node.flag("active"), disabled: node.flag("disabled"),
                limit: node.string("limit").flatMap(NStatusItemLimit.init) ?? .none, pressable: node.flag("pressable"))
            self = .statusItem(
                props, leading: node.slots?["leading"].map { ResolvedNode.list($0) },
                trailing: node.slots?["trailing"].map { ResolvedNode.list($0) })
        case "ResourceLink":
            self = .resourceLink(
                icon: node.string("icon").flatMap(GMIconName.init) ?? .book, title: node.string("title") ?? "",
                description: node.string("description") ?? "",
                variant: node.string("variant").flatMap(NResourceLinkVariant.init) ?? .plain)
        case "DialogHead":
            self = .dialogHead(
                title: node.string("title") ?? "", subtitle: node.string("subtitle") ?? "",
                icon: node.string("icon").flatMap(GMIconName.init),
                iconTone: node.string("iconTone").flatMap(NDialogHeadIconTone.init) ?? .accent,
                size: node.string("size").flatMap(NDialogHeadSize.init) ?? .normal, closable: node.flag("closable"))
        case "ZoomBadge":
            let text = node.string("text") ?? ""
            self = .zoomBadge(open: node.props?["open"] == nil ? true : node.flag("open"), text: text)
        case "LoadingOverlay":
            self = .loadingOverlay(
                open: node.props?["open"] == nil ? true : node.flag("open"), title: node.string("title") ?? "",
                step: node.string("step") ?? "", hint: node.string("hint") ?? "")
        case "ThemeSwatch":
            let colors = node.object("colors") ?? [:]
            let color = { (name: String) in Self.color(hex: colors[name] ?? "") }
            self = .themeSwatch(
                NThemeSwatchColors(
                    background: color("background"), foreground: color("foreground"), border: color("border"),
                    keyword: color("keyword"), string: color("string"), accent: color("accent"),
                    selection: color("selection")),
                label: node.string("label") ?? "")
        case "SearchToggles":
            let on = node.record("options") ?? [:]
            let flag = { (name: String) in if case .bool(true)? = on[name] { true } else { false } }
            let titles = node.object("titles") ?? [:]
            self = .searchToggles(
                NSearchOptions(matchCase: flag("matchCase"), wholeWords: flag("wholeWords"), regex: flag("regex")),
                compact: node.flag("compact"),
                titles: NSearchToggleTitles(
                    matchCase: titles["matchCase"], wholeWords: titles["wholeWords"], regex: titles["regex"]))
        case "Segmented":
            let options = (node.list("options") ?? []).compactMap { entry -> NSegmentedOption<String>? in
                guard let option = entry.record, let value = option["value"]?.text else {
                    return nil
                }
                let disabled = if case .bool(true)? = option["disabled"] { true } else { false }
                return NSegmentedOption(
                    value: value, label: option["label"]?.text, icon: option["icon"]?.text.flatMap(GMIconName.init),
                    title: option["title"]?.text, disabled: disabled)
            }
            self = .segmented(
                options: options, value: node.string("value") ?? "", label: node.string("label") ?? "",
                disabled: node.flag("disabled"), size: node.string("size").flatMap(NSegmentedSize.init) ?? .normal,
                variant: node.string("variant").flatMap(NSegmentedVariant.init) ?? .pill)
        case "SideNav":
            let items = (node.list("items") ?? []).compactMap { entry -> NSideNavItem? in
                guard let item = entry.record, let id = item["id"]?.text else {
                    return nil
                }
                let danger = if case .bool(true)? = item["danger"] { true } else { false }
                return NSideNavItem(
                    id: id, label: item["label"]?.text ?? "", icon: item["icon"]?.text.flatMap(GMIconName.init),
                    danger: danger)
            }
            self = .sideNav(
                items: items, active: node.string("active"), label: node.string("label") ?? "",
                variant: node.string("variant").flatMap(NSideNavVariant.init) ?? .settings,
                emptyText: node.string("emptyText") ?? "")
        case "ChoiceList":
            let choices = (node.list("choices") ?? []).compactMap { entry -> NChoice<String>? in
                guard let choice = entry.record, let value = choice["value"]?.text else {
                    return nil
                }
                let danger = if case .bool(true)? = choice["danger"] { true } else { false }
                return NChoice(
                    value: value, label: choice["label"]?.text ?? "", description: choice["description"]?.text,
                    danger: danger)
            }
            self = .choiceList(choices: choices, label: node.string("label") ?? "")
        case "Tabs":
            let tabs = (node.list("tabs") ?? []).compactMap { entry -> NTab<String>? in
                guard let tab = entry.record, let value = tab["value"]?.text else {
                    return nil
                }
                return NTab(value: value, label: tab["label"]?.text ?? "", title: tab["title"]?.text)
            }
            self = .tabs(
                tabs: tabs, value: node.string("value") ?? "", label: node.string("label") ?? "",
                variant: node.string("variant").flatMap(NTabsVariant.init) ?? .panel,
                keepFocus: node.flag("keepFocus"))
        case "SectionTitle":
            let matches = (node.list("titleMatches") ?? []).compactMap { pair -> Range<Int>? in
                guard case .list(let ends) = pair, ends.count == 2, let start = ends[0].numberValue,
                    let end = ends[1].numberValue
                else {
                    return nil
                }
                return Int(start)..<Int(max(start, end))
            }
            let props = SectionTitleProps(
                title: node.string("title") ?? "", matches: matches,
                variant: node.string("variant").flatMap(NSectionTitleVariant.init) ?? .list,
                count: node.number("count").map { Int($0) },
                heading: node.number("heading").flatMap { NSectionTitleHeading(rawValue: Int($0)) })
            self = .sectionTitle(props, actions: node.slots?["actions"].map { ResolvedNode.list($0) })
        default:
            return nil
        }
    }
}

extension ChromeNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @Erased
    var view: AnyView {
        switch self {
        case .statusBar(let label, let look, let start, let end):
            NStatusBar(label: label, look: look) {
                ScenarioChildren(nodes: start)
            } end: {
                ScenarioChildren(nodes: end)
            }
        case .resourceLink(let icon, let title, let description, let variant):
            NResourceLink(icon: icon, title: title, description: description, variant: variant) {}
        case .dialogHead(let title, let subtitle, let icon, let iconTone, let size, let closable):
            NDialogHead(
                title: title, subtitle: subtitle, icon: icon, iconTone: iconTone, size: size,
                onClose: closable ? {} : nil)
        case .zoomBadge(let open, let text):
            NZoomBadge(open: open, text: text)
        case .loadingOverlay(let open, let title, let step, let hint):
            NLoadingOverlay(open: open, title: title, step: step, hint: hint)
        case .themeSwatch(let colors, let label):
            NThemeSwatch(colors: colors, label: label)
        case .searchToggles(let options, let compact, let titles):
            NSearchToggles(options: .constant(options), compact: compact, titles: titles)
        case .sideNav(let items, let active, let label, let variant, let emptyText):
            NSideNav(items: items, active: .constant(active), label: label, variant: variant, emptyText: emptyText)
        case .choiceList(let choices, let label):
            NChoiceList(choices: choices, label: label) { _ in }
        case .tabs(let tabs, let value, let label, let variant, let keepFocus):
            NTabs(tabs: tabs, value: .constant(value), label: label, variant: variant, keepFocus: keepFocus)
        case .segmented(let options, let value, let label, let disabled, let size, let variant):
            NSegmented(
                options: options, value: .constant(value), label: label, disabled: disabled, size: size,
                variant: variant)
        case .sectionTitle(let props, let actions):
            if let actions {
                NSectionTitle(
                    title: props.title, titleMatches: props.matches, variant: props.variant, count: props.count,
                    heading: props.heading
                ) {
                    ScenarioChildren(nodes: actions)
                }
            } else {
                NSectionTitle(
                    title: props.title, titleMatches: props.matches, variant: props.variant, count: props.count,
                    heading: props.heading)
            }
        case .statusItem(let props, let leading, let trailing):
            if leading == nil && trailing == nil {
                NStatusItem(
                    text: props.text, icon: props.icon, label: props.label, tone: props.tone, open: props.open,
                    spin: props.spin, variant: props.variant, active: props.active, disabled: props.disabled,
                    limit: props.limit, action: props.pressable ? {} : nil)
            } else {
                NStatusItem(
                    text: props.text, icon: props.icon, label: props.label, tone: props.tone, open: props.open,
                    spin: props.spin, variant: props.variant, active: props.active, disabled: props.disabled,
                    limit: props.limit, action: props.pressable ? {} : nil
                ) {
                    ScenarioChildren(nodes: leading ?? [])
                } trailing: {
                    ScenarioChildren(nodes: trailing ?? [])
                }
            }
        }
    }
}

extension ChromeNode {
    /// A scenario's `#rrggbb` color, as a theme's colors come in; black when it is not one.
    static func color(hex: String) -> Color {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else {
            return .black
        }
        return Color(
            .sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255)
    }
}
