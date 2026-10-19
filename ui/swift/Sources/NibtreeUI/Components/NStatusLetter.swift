import NibtreeTokens
import SwiftUI

/// A changed file's status letter in its color: the Swift side of ui/web `StatusLetter`
/// (docs/components/StatusLetter.md). A added, M modified, D deleted, R renamed, U untracked, C copied or conflicted,
/// T type change; no kind is a conflict ("!"). A fixed-width column before a file name, as tall as its line: a row
/// stretches the web's span, which draws nothing more, so here the canvas keeps its own size (8% faster). The web's
/// tooltip names the change ("Modified"): here VoiceOver reads it, and a caller that wants the tooltip adds
/// `.help(kind.label)` (a tooltip costs as much as the letter).
public struct NStatusLetter: View {
    public enum Kind: String, CaseIterable, Sendable {
        case added, modified, typechange, deleted, renamed, copied, untracked, conflicted

        /// fileStatus.ts's letters.
        public var letter: String {
            switch self {
            case .added: "A"
            case .modified: "M"
            case .typechange: "T"
            case .deleted: "D"
            case .renamed: "R"
            case .copied, .conflicted: "C"
            case .untracked: "U"
            }
        }

        /// fileStatus.ts's label: the kind with a capital first letter.
        public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
    }

    /// StatusLetter.svelte's `color-mix(in srgb, success 60%, text-faint)` for an untracked file.
    static let untrackedShare = 0.6
    /// StatusLetter.svelte's `opacity: 0.8` on a deleted file's letter.
    static let deletedOpacity = 0.8

    private let spec: NTextSpec
    private let kind: Kind?

    /// `kind` is nil for a conflict, as the web's null.
    public init(kind: Kind?) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: GMFontSize.compact, weight: GMFontWeight.bold, mono: true)
        spec = NTextSpec(
            text: kind?.letter ?? "!", font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.kind = kind
    }

    public var body: some View {
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                // Laid out on the first drawing and kept: the letter never changes.
                let layout = spec.state.layout ?? spec.layout(width: nil)
                spec.state.layout = layout
                context.withCGContext { cg in
                    cg.translateBy(x: (box.width - layout.width) / 2, y: 0)
                    NTextEngine.draw(
                        layout, line: spec.line, color: Self.color(kind, palette), strike: nil, scale: scale, in: cg)
                }
            }
        }
        .frame(width: GMFileRowTokens.letterWidth, height: spec.line.height)
        .accessibilityLabel(kind?.label ?? "Conflicted")
    }

    /// The letter's color for `kind` (nil for a conflict).
    @MainActor
    static func color(_ kind: Kind?, _ palette: Palette) -> CGColor {
        switch kind {
        case .added, .copied: palette.cgColor(.success)
        case .modified, .typechange: palette.cgColor(.accent)
        case .deleted: palette.cgColor(.danger).copy(alpha: Self.deletedOpacity) ?? palette.cgColor(.danger)
        case .renamed: palette.cgColor(.tokProperty)
        case .untracked:
            NAvatarFace.mix(palette.cgColor(.success), palette.cgColor(.textFaint), share: Self.untrackedShare)
        case .conflicted, nil: palette.cgColor(.danger)
        }
    }
}
