import NibtreeTokens
import SwiftUI

/// A ref's chip in the log and commit details: the Swift side of ui/web `RefLabel` (docs/components/RefLabel.md).
/// HEAD is filled with the accent, local branches are green, remote ones violet, tags amber, bisect marks in their
/// colors, and `more` is the "+3" chip for the rest. Like the web's inline flex box it is as wide as its name, or as
/// wide as a column that stretches it, at most 180 points either way; a name that does not fit ends in an ellipsis.
/// Its tooltip (the `title`, or the name) is made only while the pointer is over it. Over a row's own background (the
/// web's `--row-bg`), set `nibtreeRowBackground`.
public struct NRefLabel: View {
    public enum Kind: String, CaseIterable, Sendable {
        case head, local, remote, tag, more
        case bisectBad = "bisect-bad"
        case bisectGood = "bisect-good"
        case bisectSkip = "bisect-skip"
        case bisectCurrent = "bisect-current"
    }

    private let look: NRefLabelLook
    private let title: String

    public init(kind: Kind, label: String, title: String? = nil, icon: GMIconName? = nil) {
        look = NRefLabelLook(kind: kind, label: label, icon: icon)
        self.title = title ?? label
    }

    public var body: some View {
        let look = look
        NRefLabelFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let row = context.environment.nibtreeRowBackground
                    context.withCGContext { cg in
                        look.draw(size: size, palette: palette, row: row, scale: scale, in: cg)
                    }
                }
            }
        }
        .modifier(NHoverHelp(text: title))
        .accessibilityLabel(look.words.text)
    }
}
