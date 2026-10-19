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
    case fieldset(legend: String, disabled: Bool, legendTone: NFieldsetLegendTone, children: [ResolvedNode])
    case input(InputProps)
    case radioGroup(
        options: [NRadioOption<String>], value: String, label: String, direction: NRadioGroupDirection,
        layout: NRadioGroupLayout, labelWidth: NLabelColumn)
    case textArea(TextAreaProps, tools: [ResolvedNode]?)

    struct TextAreaProps: Sendable {
        let value: String
        let rows: NTextAreaRows
        let height: NTextAreaHeight
        let resize: NTextAreaResize
        let invalid, mono: Bool
        let placeholder: String
        let disabled: Bool
    }
    case field(label: String, hint: String, error: String?, look: NFieldLook, children: [ResolvedNode])

    struct InputProps: Sendable {
        let value: String
        let invalid, mono: Bool
        let width: NControlWidth
        let placeholder: String
        let disabled: Bool
        let label: String?
    }

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
        case "Input":
            self = .input(
                InputProps(
                    value: node.string("value") ?? "", invalid: node.flag("invalid"), mono: node.flag("mono"),
                    width: node.string("width").flatMap(NControlWidth.init) ?? .auto,
                    placeholder: node.string("placeholder") ?? "", disabled: node.flag("disabled"),
                    label: node.string("label")))
        case "RadioGroup":
            let options = (node.list("options") ?? []).compactMap { entry -> NRadioOption<String>? in
                guard let option = entry.record, let value = option["value"]?.text else {
                    return nil
                }
                let flag = { (name: String) in if case .bool(true)? = option[name] { true } else { false } }
                return NRadioOption(
                    value: value, label: option["label"]?.text ?? "", description: option["description"]?.text,
                    disabled: flag("disabled"), danger: flag("danger"))
            }
            self = .radioGroup(
                options: options, value: node.string("value") ?? "", label: node.string("label") ?? "",
                direction: node.string("direction").flatMap(NRadioGroupDirection.init) ?? .column,
                layout: node.string("layout").flatMap(NRadioGroupLayout.init) ?? .stacked,
                labelWidth: node.string("labelWidth").flatMap(NLabelColumn.init) ?? .large)
        case "TextArea":
            let props = TextAreaProps(
                value: node.string("value") ?? "", rows: node.string("rows").flatMap(NTextAreaRows.init) ?? .normal,
                height: node.string("height").flatMap(NTextAreaHeight.init) ?? .rows,
                resize: node.string("resize").flatMap(NTextAreaResize.init) ?? .none, invalid: node.flag("invalid"),
                mono: node.flag("mono"), placeholder: node.string("placeholder") ?? "", disabled: node.flag("disabled"))
            self = .textArea(props, tools: node.slots?["tools"].map { ResolvedNode.list($0) })
        case "Field":
            self = .field(
                label: node.string("label") ?? "", hint: node.string("hint") ?? "", error: node.string("error"),
                look: node.string("look").flatMap(NFieldLook.init) ?? .normal,
                children: ResolvedNode.list(node.children))
        case "Fieldset":
            self = .fieldset(
                legend: node.string("legend") ?? "", disabled: node.flag("disabled"),
                legendTone: node.string("legendTone").flatMap(NFieldsetLegendTone.init) ?? .faint,
                children: ResolvedNode.list(node.children))
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
    @MainActor @Erased
    var view: AnyView {
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
        case .input(let props):
            NInput(
                value: .constant(props.value), invalid: props.invalid, mono: props.mono, width: props.width,
                placeholder: props.placeholder, disabled: props.disabled, label: props.label)
        case .radioGroup(let options, let value, let label, let direction, let layout, let labelWidth):
            NRadioGroup(
                options: options, value: .constant(value), label: label, direction: direction, layout: layout,
                labelWidth: labelWidth)
        case .textArea(let props, let tools):
            if let tools {
                NTextArea(
                    value: .constant(props.value), rows: props.rows, height: props.height, resize: props.resize,
                    invalid: props.invalid, mono: props.mono, placeholder: props.placeholder, disabled: props.disabled
                ) {
                    ScenarioChildren(nodes: tools)
                }
            } else {
                NTextArea(
                    value: .constant(props.value), rows: props.rows, height: props.height, resize: props.resize,
                    invalid: props.invalid, mono: props.mono, placeholder: props.placeholder, disabled: props.disabled)
            }
        case .field(let label, let hint, let error, let look, let children):
            NField(label: label, hint: hint, error: error, look: look) { ScenarioChildren(nodes: children) }
        case .fieldset(let legend, let disabled, let legendTone, let children):
            NFieldset(legend: legend, disabled: disabled, legendTone: legendTone) {
                ScenarioChildren(nodes: children)
            }
        }
    }
}
