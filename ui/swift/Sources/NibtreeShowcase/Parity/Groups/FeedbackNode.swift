import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Feedback group's components, resolved from a scenario node.
enum FeedbackNode: Sendable {
    case kbd(keys: String)
    case mark(text: String, size: NMark.Size)
    /// The web's `title` is `.help` in SwiftUI; a separate case keeps untitled marks free of it.
    case titledMark(text: String, size: NMark.Size, title: String)
    case avatar(text: String, shape: NAvatar.Shape, color: NAvatar.Color, label: String?)
    case badge(count: Int, max: Int, tone: NBadge.Tone, size: NBadge.Size, label: String?)
    case meter(MeterProps)
    /// The web's `title` is `.help` in SwiftUI.
    case titledMeter(MeterProps, title: String)
    case pill(text: String, tone: NPill.Tone, strong: Bool, variant: NPill.Variant)
    case titledPill(text: String, tone: NPill.Tone, strong: Bool, variant: NPill.Variant, title: String)
    case tag(text: String, tone: NTag.Tone, variant: NTag.Variant, size: NTag.Size)
    case titledTag(text: String, tone: NTag.Tone, variant: NTag.Variant, size: NTag.Size, title: String)
    case progressBar(value: Double, label: String, tone: NProgressBar.Tone)
    case spinner(label: String, size: NSpinner.Size, delayed: Bool)
    case statusDot(tone: NStatusDot.Tone, size: NStatusDot.Size, label: String?)
    /// The web's `pulse` is the caller's `.nibtreePulse()`; a separate case keeps still dots free of it.
    case pulsingDot(tone: NStatusDot.Tone, size: NStatusDot.Size, label: String?)
    case statusLetter(kind: NStatusLetter.Kind?)
    case statusIcon(state: NStatusIcon.State, label: String)
    case notice(NoticeProps)
    /// A plain message with its `action` slot.
    case noticeAction(NoticeProps, action: [ResolvedNode])
    /// A message of views (the web's children).
    case noticeWith(NoticeProps, message: [ResolvedNode])

    case emptyState(EmptyStateProps, action: [ResolvedNode]?)

    struct EmptyStateProps: Sendable {
        let title: String
        let hint: String
        let icon: GMIconName?
        let variant: NEmptyStateVariant
        let iconStyle: NEmptyStateIconStyle
        let iconTone: NEmptyStateIconTone
        let strong: Bool
        let titleSize: NEmptyStateTitleSize
        let titleTone: NEmptyStateTitleTone
        let delayed: Bool
    }

    struct NoticeProps: Sendable {
        let text: String
        let tone: NNoticeTone
        let variant: NNoticeVariant
        let icon: GMIconName?
    }
    case symbolBadge(letter: String, tone: NSymbolBadge.Tone)
    case titledSymbolBadge(letter: String, tone: NSymbolBadge.Tone, title: String)

    struct MeterProps: Sendable {
        let fraction: Double
        let label, value, detail: String
        let variant: NMeter.Variant
        let tone: NMeter.Tone
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Kbd":
            self = .kbd(keys: node.string("keys") ?? "")
        case "Mark":
            let (text, size) = (node.string("text") ?? "", node.string("size").flatMap(NMark.Size.init) ?? .normal)
            if let title = node.string("title") {
                self = .titledMark(text: text, size: size, title: title)
            } else {
                self = .mark(text: text, size: size)
            }
        case "Avatar":
            self = .avatar(
                text: node.string("text") ?? "", shape: node.string("shape").flatMap(NAvatar.Shape.init) ?? .circle,
                color: node.string("color").flatMap(NAvatar.Color.init) ?? .accent, label: node.string("label"))
        case "Badge":
            self = .badge(
                count: Int(node.number("count") ?? 0), max: Int(node.number("max") ?? 99),
                tone: node.string("tone").flatMap(NBadge.Tone.init) ?? .accent,
                size: node.string("size").flatMap(NBadge.Size.init) ?? .normal, label: node.string("label"))
        case "Meter":
            let props = MeterProps(
                fraction: node.number("fraction") ?? 0, label: node.string("label") ?? "",
                value: node.string("value") ?? "", detail: node.string("detail") ?? "",
                variant: node.string("variant").flatMap(NMeter.Variant.init) ?? .memory,
                tone: node.string("tone").flatMap(NMeter.Tone.init) ?? .accent)
            if let title = node.string("title") {
                self = .titledMeter(props, title: title)
            } else {
                self = .meter(props)
            }
        case "Pill":
            let (text, strong) = (node.text ?? "", node.flag("strong"))
            let tone = node.string("tone").flatMap(NPill.Tone.init) ?? .neutral
            let variant = node.string("variant").flatMap(NPill.Variant.init) ?? .fill
            if let title = node.string("title") {
                self = .titledPill(text: text, tone: tone, strong: strong, variant: variant, title: title)
            } else {
                self = .pill(text: text, tone: tone, strong: strong, variant: variant)
            }
        case "Tag":
            let (tone, variant, size) = (
                node.string("tone").flatMap(NTag.Tone.init) ?? .neutral,
                node.string("variant").flatMap(NTag.Variant.init) ?? .fill,
                node.string("size").flatMap(NTag.Size.init) ?? .normal
            )
            if let title = node.string("title") {
                self = .titledTag(text: node.text ?? "", tone: tone, variant: variant, size: size, title: title)
            } else {
                self = .tag(text: node.text ?? "", tone: tone, variant: variant, size: size)
            }
        case "ProgressBar":
            self = .progressBar(
                value: node.number("value") ?? 0, label: node.string("label") ?? "",
                tone: node.string("tone").flatMap(NProgressBar.Tone.init) ?? .accent)
        case "Spinner":
            self = .spinner(
                label: node.string("label") ?? "Loading",
                size: node.string("size").flatMap(NSpinner.Size.init) ?? .normal, delayed: node.flag("delayed"))
        case "StatusDot":
            let (tone, size, label) = (
                node.string("tone").flatMap(NStatusDot.Tone.init) ?? .neutral,
                node.string("size").flatMap(NStatusDot.Size.init) ?? .normal, node.string("label")
            )
            if node.flag("pulse") {
                self = .pulsingDot(tone: tone, size: size, label: label)
            } else {
                self = .statusDot(tone: tone, size: size, label: label)
            }
        case "StatusLetter":
            self = .statusLetter(kind: node.string("kind").flatMap(NStatusLetter.Kind.init))
        case "EmptyState":
            let props = EmptyStateProps(
                title: node.string("title") ?? "", hint: node.string("hint") ?? "",
                icon: node.string("icon").flatMap(GMIconName.init),
                variant: node.string("variant").flatMap(NEmptyStateVariant.init) ?? .area,
                iconStyle: node.string("iconStyle").flatMap(NEmptyStateIconStyle.init) ?? .plain,
                iconTone: node.string("iconTone").flatMap(NEmptyStateIconTone.init) ?? .inherit,
                strong: node.flag("strong"),
                titleSize: node.string("titleSize").flatMap(NEmptyStateTitleSize.init) ?? .normal,
                titleTone: node.string("titleTone").flatMap(NEmptyStateTitleTone.init) ?? .default,
                delayed: node.flag("delayed"))
            self = .emptyState(props, action: node.slots?["action"].map { ResolvedNode.list($0) })
        case "Notice":
            let props = NoticeProps(
                text: node.text ?? "", tone: node.string("tone").flatMap(NNoticeTone.init) ?? .info,
                variant: node.string("variant").flatMap(NNoticeVariant.init) ?? .card,
                icon: node.string("icon").flatMap(GMIconName.init))
            if let action = node.slots?["action"] {
                self = .noticeAction(props, action: ResolvedNode.list(action))
            } else if let children = node.children, !children.isEmpty {
                self = .noticeWith(props, message: ResolvedNode.list(children))
            } else {
                self = .notice(props)
            }
        case "StatusIcon":
            guard let state = node.string("state").flatMap(NStatusIcon.State.init) else {
                return nil
            }
            self = .statusIcon(state: state, label: node.string("label") ?? "")
        case "SymbolBadge":
            let letter = node.string("letter") ?? ""
            let tone = node.string("tone").flatMap(NSymbolBadge.Tone.init) ?? .type
            if let title = node.string("title") {
                self = .titledSymbolBadge(letter: letter, tone: tone, title: title)
            } else {
                self = .symbolBadge(letter: letter, tone: tone)
            }
        default:
            return nil
        }
    }
}

extension FeedbackNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @Erased
    var view: AnyView {
        switch self {
        case .kbd(let keys):
            NKbd(keys: keys)
        case .mark(let text, let size):
            NMark(text: text, size: size)
        case .titledMark(let text, let size, let title):
            NMark(text: text, size: size).help(title)
        case .avatar(let text, let shape, let color, let label):
            NAvatar(text: text, shape: shape, color: color, label: label)
        case .badge(let count, let max, let tone, let size, let label):
            NBadge(count: count, max: max, tone: tone, size: size, label: label)
        case .meter(let props):
            NMeter(
                fraction: props.fraction, label: props.label, value: props.value, detail: props.detail,
                variant: props.variant, tone: props.tone)
        case .titledMeter(let props, let title):
            NMeter(
                fraction: props.fraction, label: props.label, value: props.value, detail: props.detail,
                variant: props.variant, tone: props.tone
            ).help(title)
        case .pill(let text, let tone, let strong, let variant):
            NPill(text, tone: tone, strong: strong, variant: variant)
        case .titledPill(let text, let tone, let strong, let variant, let title):
            NPill(text, tone: tone, strong: strong, variant: variant).help(title)
        case .tag(let text, let tone, let variant, let size):
            NTag(text, tone: tone, variant: variant, size: size)
        case .titledTag(let text, let tone, let variant, let size, let title):
            NTag(text, tone: tone, variant: variant, size: size).help(title)
        case .progressBar(let value, let label, let tone):
            NProgressBar(value: value, label: label, tone: tone)
        case .spinner(let label, let size, let delayed):
            NSpinner(label: label, size: size, delayed: delayed)
        case .statusDot(let tone, let size, let label):
            NStatusDot(tone: tone, size: size, label: label)
        case .pulsingDot(let tone, let size, let label):
            NStatusDot(tone: tone, size: size, label: label).nibtreePulse()
        case .statusLetter(let kind):
            NStatusLetter(kind: kind)
        case .emptyState(let props, let action):
            if let action {
                NEmptyState(
                    title: props.title, hint: props.hint, icon: props.icon, variant: props.variant,
                    iconStyle: props.iconStyle, iconTone: props.iconTone, strong: props.strong,
                    titleSize: props.titleSize, titleTone: props.titleTone, delayed: props.delayed
                ) {
                    ScenarioChildren(nodes: action)
                }
            } else {
                NEmptyState(
                    title: props.title, hint: props.hint, icon: props.icon, variant: props.variant,
                    iconStyle: props.iconStyle, iconTone: props.iconTone, strong: props.strong,
                    titleSize: props.titleSize, titleTone: props.titleTone, delayed: props.delayed)
            }
        case .notice(let props):
            NNotice(props.text, tone: props.tone, variant: props.variant, icon: props.icon)
        case .noticeAction(let props, let action):
            NNotice(props.text, tone: props.tone, variant: props.variant, icon: props.icon) {
                ScenarioChildren(nodes: action)
            }
        case .noticeWith(let props, let message):
            NNotice(tone: props.tone, variant: props.variant, icon: props.icon) {
                ScenarioChildren(nodes: message)
            }
        case .statusIcon(let state, let label):
            NStatusIcon(state: state, label: label)
        case .symbolBadge(let letter, let tone):
            NSymbolBadge(letter: letter, tone: tone)
        case .titledSymbolBadge(let letter, let tone, let title):
            NSymbolBadge(letter: letter, tone: tone).help(title)
        }
    }
}
