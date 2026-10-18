import NibtreeUI
import SwiftUI

/// Stories of the Forms group: controls that hold a value, each story with its own state to try.
extension Stories {
    static let forms: [Story] = [
        Story("Switch", group: "Forms") { SwitchStory() },
        Story("Checkbox", group: "Forms") { CheckboxStory() },
        Story("Slider", group: "Forms") { SliderStory() },
    ]
}

private struct SwitchStory: View {
    @State private var wrap = true
    @State private var minimap = false

    var body: some View {
        NStack(gap: .sm) {
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Wrap lines")
                NSwitch(checked: $wrap, label: "Wrap lines")
            }
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Show minimap")
                NSwitch(checked: $minimap, label: "Show minimap")
            }
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Locked", tone: .dim)
                NSwitch(checked: .constant(true), label: "Locked", disabled: true)
            }
        }
        .frame(width: 220)
    }
}

private struct CheckboxStory: View {
    @State private var amend = false
    @State private var signOff = true
    @State private var mute = false

    var body: some View {
        NStack(gap: .sm) {
            NCheckbox(checked: $amend, label: "Amend last commit")
            NCheckbox(checked: $signOff, label: "Sign off")
            NCheckbox(checked: .constant(false), indeterminate: true, label: "Some files")
            NCheckbox(checked: .constant(true), label: "Locked", disabled: true).help("Set by the repository")
            NCheckbox(checked: $mute, label: "Mute", size: .small)
            NCheckbox(checked: $amend) { NText("--amend", tone: .dim, mono: true) }
        }
    }
}

private struct SliderStory: View {
    @State private var size = 13.0
    @State private var height = 1.5
    @State private var weight = 400.0

    var body: some View {
        NStack(gap: .sm) {
            NSlider(value: $size, min: 8, max: 24, label: "Font size", resetValue: 13)
            NSlider(value: $height, min: 1, max: 2, step: 0.1, label: "Line height") { String(format: "%.1f", $0) }
            NSlider(
                value: $weight, min: 100, max: 900, step: 100, label: "Font weight", valueWidth: .wide
            ) { $0 >= 600 ? "Bold" : "Regular" }
            NSlider(value: .constant(16), min: 8, max: 24, label: "Locked", disabled: true)
        }
    }
}

struct ButtonStory: View {
    @State private var saved = 0
    @State private var fit = true

    var body: some View {
        NStack(gap: .sm) {
            NStack(direction: .row, gap: .sm) {
                NButton("Cancel") {}
                NButton("Save \(saved)", variant: .primary) { saved += 1 }
                NButton("Discard", variant: .danger) {}
                NButton("Delete Branch", variant: .dangerPrimary) {}
            }
            NStack(direction: .row, gap: .sm, align: .center) {
                NButton("main", variant: .ghost, icon: .branch, trailingIcon: .chevronDown) {}
                NButton("Options", variant: .accent, icon: .settings, badge: 2) {}
                NButton("Fetch", size: .small, icon: .refresh, spinning: true) {}
                NButton(size: .small, icon: .settings) {}.help("Settings").accessibilityLabel("Settings")
                NButton("Fit", size: .tiny, pressed: fit) { fit.toggle() }
                NButton("Push", size: .small, disabled: true) {}
            }
            NButton("Commit", variant: .primary, width: .fill) {}
        }
        .frame(width: 520)
    }
}
