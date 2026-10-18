import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Forms group's components, resolved from a scenario node. A control's value is the scenario's (`.constant`).
enum FormsNode: Sendable {
    case toggle(checked: Bool, label: String, disabled: Bool)
    case checkbox(CheckboxProps, label: String, size: NCheckbox<EmptyView>.Size)
    case titledCheckbox(CheckboxProps, label: String, size: NCheckbox<EmptyView>.Size, title: String)
    case checkboxWith(CheckboxProps, children: [ResolvedNode])
    case slider(SliderProps)

    struct SliderProps: Sendable {
        let value: Double
        let min: Double
        let max: Double
        let step: Double
        let label: String
        let disabled: Bool
        let valueWidth: NSlider.ValueWidth
        let resetValue: Double?
    }

    struct CheckboxProps: Sendable {
        let checked: Bool
        let indeterminate: Bool
        let disabled: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Switch":
            self = .toggle(
                checked: node.flag("checked"), label: node.string("label") ?? "", disabled: node.flag("disabled"))
        case "Checkbox":
            let props = CheckboxProps(
                checked: node.flag("checked"), indeterminate: node.flag("indeterminate"),
                disabled: node.flag("disabled"))
            let label = node.string("label") ?? ""
            let size = node.string("size").flatMap(NCheckbox<EmptyView>.Size.init) ?? .normal
            if let children = node.children, !children.isEmpty {
                self = .checkboxWith(props, children: ResolvedNode.list(children))
            } else if let title = node.string("title") {
                self = .titledCheckbox(props, label: label, size: size, title: title)
            } else {
                self = .checkbox(props, label: label, size: size)
            }
        case "Slider":
            self = .slider(
                SliderProps(
                    value: node.number("value") ?? 0, min: node.number("min") ?? 0, max: node.number("max") ?? 100,
                    step: node.number("step") ?? 1, label: node.string("label") ?? "", disabled: node.flag("disabled"),
                    valueWidth: node.string("valueWidth").flatMap(NSlider.ValueWidth.init) ?? .normal,
                    resetValue: node.number("resetValue")))
        default:
            return nil
        }
    }
}

extension FormsNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .toggle(let checked, let label, let disabled):
            NSwitch(checked: .constant(checked), label: label, disabled: disabled)
        case .checkbox(let props, let label, let size):
            NCheckbox(
                checked: .constant(props.checked), indeterminate: props.indeterminate, label: label,
                disabled: props.disabled, size: size)
        case .titledCheckbox(let props, let label, let size, let title):
            NCheckbox(
                checked: .constant(props.checked), indeterminate: props.indeterminate, label: label,
                disabled: props.disabled, size: size
            )
            .help(title)
        case .checkboxWith(let props, let children):
            NCheckbox(checked: .constant(props.checked), indeterminate: props.indeterminate, disabled: props.disabled) {
                ScenarioChildren(nodes: children)
            }
        case .slider(let props):
            NSlider(
                value: .constant(props.value), min: props.min, max: props.max, step: props.step, label: props.label,
                disabled: props.disabled, valueWidth: props.valueWidth, resetValue: props.resetValue)
        }
    }
}
