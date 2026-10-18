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
        Story("Avatar", group: "Feedback") {
            NStack(direction: .row, gap: .md, align: .center) {
                NAvatar(text: "MS", label: "MD. Shibbir Ahmed")
                NAvatar(text: "N", shape: .tile)
                NAvatar(text: "GM", shape: .tile, color: .blue)
                NAvatar(text: "WS", shape: .tile, color: .green)
                NAvatar(text: "UI", shape: .tile, color: .magenta)
            }
        },
        Story("Badge", group: "Feedback") {
            NStack(direction: .row, gap: .md, align: .center) {
                NBadge(count: 3, label: "3 changes")
                NBadge(count: 120, tone: .danger)
                NBadge(count: 2, tone: .warning, size: .small)
                NBadge(count: 14, tone: .quiet, size: .large)
                NBadge(count: 5, tone: .neutral)
            }
        },
        Story("Meter", group: "Feedback") {
            NStack(gap: .md) {
                NMeter(fraction: 0.42, label: "Nibtree", value: "126 MB")
                NMeter(fraction: 0.81, label: "Session", value: "81%", detail: "Resets in 2 h", variant: .usage,
                    tone: .warning)
                NStack(direction: .row, gap: .sm, align: .center) {
                    NMeter(fraction: 0.3, variant: .mini).help("Memory")
                    NText("30%", tone: .dim)
                }
            }
            .frame(width: 240)
        },
        Story("Pill", group: "Feedback") {
            NStack(direction: .row, gap: .sm, align: .center) {
                NPill("unsaved")
                NPill("merging", tone: .warning, strong: true)
                NPill("read-only", tone: .danger, variant: .border).help("The file cannot be written")
                NPill("+60 MB", tone: .warning, variant: .outline)
            }
        },
        Story("Tag", group: "Feedback") {
            NStack(gap: .sm) {
                NStack(direction: .row, gap: .sm, align: .center) {
                    NText("main")
                    NTag("primary")
                    NTag("ahead", tone: .accent)
                    NTag("gone", tone: .danger).help("The folder was removed")
                }
                NStack(direction: .row, gap: .sm, align: .center) {
                    NText("vendor/lib")
                    NTag("submodule", variant: .outline)
                    NTag("LFS", size: .small)
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
                NStatusDot(tone: .accent, label: "Running").nibtreePulse().help("Running")
                NStatusDot(size: .small)
                NStatusDot(tone: .success, size: .small)
            }
        },
    ]
}
