import NibtreeTokens
import NibtreeUI
import SwiftUI

/// Stories of the Feedback group: badges, marks, progress and the like.
extension Stories {
    static let feedback: [Story] = [
        Story("Kbd", group: "Feedback") {
            NStack(gap: .sm) {
                NStack(direction: .row, gap: .sm, align: .center) {
                    NKbd(keys: "⌘P")
                    NKbd(keys: "⇧⌘F")
                    NKbd(keys: "Esc")
                    NText("Quick open", tone: .dim)
                }
                NKbd(keys: "⌘K ⌘S")
            }
        },
        Story("Mark", group: "Feedback") {
            NStack(gap: .sm) {
                NStack(direction: .row, gap: .sm, align: .center) {
                    NMark(text: "CC").help("Claude Code")
                    NText("Claude Code")
                }
                NStack(direction: .row, gap: .xs, align: .center) {
                    NMark(text: "CX", size: .small).help("Codex")
                    NText("42%", tone: .dim)
                }
            }
        },
        Story("ProgressBar", group: "Feedback") {
            NStack(gap: .sm) {
                NProgressBar(value: 0.62, label: "Nibtree memory")
                NProgressBar(value: 0.3, label: "WebKit memory", tone: .warning)
                NProgressBar(value: 0.9, label: "Disk", tone: .danger)
                NProgressBar(value: 0.001, label: "Git", tone: .success)
            }
            .frame(width: 240)
        },
        Story("Spinner", group: "Feedback") {
            NStack(direction: .row, gap: .md, align: .center) {
                NSpinner(size: .small)
                NSpinner()
                NSpinner(label: "Loading the card", size: .large)
                NSpinner(delayed: true)
                NText("Loading...", tone: .dim)
            }
        },
        Story("StatusDot", group: "Feedback") {
            NStack(direction: .row, gap: .md, align: .center) {
                ForEach(NStatusDot.Tone.allCases, id: \.self) { NStatusDot(tone: $0) }
                NStatusDot(tone: .accent, pulse: true, label: "Running").help("Running")
                NStatusDot(size: .small)
                NStatusDot(tone: .success, size: .small)
            }
        },
    ]
}
