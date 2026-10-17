import AppKit
import NibtreeTokens
import SwiftUI

/// Fonts from the typography tokens. The UI font is the system font (the tokens' `-apple-system`); the code font is
/// the first installed family of the mono list (JetBrains Mono, then Menlo...), like the web app's CSS font stack.
public enum NTypography {
    /// The first family of `GMFontFamilyMono.names` that is installed, or nil for the system monospaced design.
    public static let monoFamily: String? = {
        let installed = Set(NSFontManager.shared.availableFontFamilies)
        return GMFontFamilyMono.names.first { installed.contains($0) }
    }()

    /// The font of a text style, with an optional size and weight that override the style's, in `mono` or not.
    public static func font(_ style: GMTextStyle, size: CGFloat? = nil, weight: Font.Weight? = nil, mono: Bool = false)
        -> Font
    {
        let points = size ?? style.size
        let isMono = mono || style.family.first == GMFontFamilyMono.names.first
        let base: Font
        if isMono, let family = monoFamily {
            base = .custom(family, fixedSize: points)
        } else {
            base = .system(size: points, design: isMono ? .monospaced : .default)
        }
        return base.weight(weight ?? style.weight)
    }

    /// Extra space between lines so a style's line height (a multiple of its size) matches CSS.
    public static func lineSpacing(_ style: GMTextStyle, size: CGFloat? = nil) -> CGFloat {
        guard let lineHeight = style.lineHeight else {
            return 0
        }
        let points = size ?? style.size
        return max(0, (lineHeight - 1.2) * points)
    }
}
