import AppKit
import NibtreeTokens
import SwiftUI

/// Fonts from the typography tokens. The UI font is the system font (the tokens' `-apple-system`); the code font is
/// the first installed family of the mono list (JetBrains Mono, then Menlo...), like the web app's CSS font stack.
/// AppKit fonts are cached: they are asked for on every draw.
public enum NTypography {
    /// The first family of `GMFontFamilyMono.names` that is installed, or nil for the system monospaced design.
    public static let monoFamily: String? = {
        let installed = Set(NSFontManager.shared.availableFontFamilies)
        return GMFontFamilyMono.names.first { installed.contains($0) }
    }()

    /// One font: a size, a weight and whether it is the code font.
    public struct FontKey: Hashable, Sendable {
        public let size: CGFloat
        public let weight: Font.Weight
        public let mono: Bool

        public init(_ style: GMTextStyle, size: CGFloat? = nil, weight: Font.Weight? = nil, mono: Bool = false) {
            self.size = size ?? style.size
            self.weight = weight ?? style.weight
            self.mono = mono || style.family.first == GMFontFamilyMono.names.first
        }
    }

    /// The SwiftUI font of a key: exactly the AppKit font below, so drawing and measuring agree.
    @MainActor
    public static func font(_ key: FontKey) -> Font {
        Font(nsFont(key) as CTFont)
    }

    @MainActor private static var fonts: [FontKey: NSFont] = [:]

    /// The AppKit font of a key. The system font is a variable font, and CSS weights are exact points on its weight
    /// axis (600 for semibold), where AppKit's named weights sit a little apart (590): set the axis to the CSS weight
    /// so letters are as wide as in WebKit.
    @MainActor
    public static func nsFont(_ key: FontKey) -> NSFont {
        if let font = fonts[key] {
            return font
        }
        let weight = appKitWeights[key.weight] ?? .regular
        let font: NSFont
        if key.mono, let family = monoFamily, let named = NSFont(name: family, size: key.size) {
            font = weight >= .semibold ? NSFontManager.shared.convert(named, toHaveTrait: .boldFontMask) : named
        } else if key.mono {
            font = NSFont.monospacedSystemFont(ofSize: key.size, weight: weight)
        } else {
            font = cssWeighted(NSFont.systemFont(ofSize: key.size, weight: weight), weight: key.weight)
        }
        fonts[key] = font
        return font
    }

    private static let appKitWeights: [Font.Weight: NSFont.Weight] = [
        .regular: .regular, .medium: .medium, .semibold: .semibold, .bold: .bold,
    ]

    /// The CSS weights of the typography tokens (fontWeight in ui/design-tokens).
    private static let cssWeights: [Font.Weight: Double] = [.regular: 400, .medium: 500, .semibold: 600, .bold: 700]

    private static let weightAxis = NSNumber(value: 0x7767_6874)  // 'wght'

    private static func cssWeighted(_ font: NSFont, weight: Font.Weight) -> NSFont {
        guard let css = cssWeights[weight] else {
            return font
        }
        var variation = (CTFontCopyVariation(font as CTFont) as? [NSNumber: Any]) ?? [:]
        variation[weightAxis] = css
        let attribute = NSFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let descriptor = font.fontDescriptor.addingAttributes([attribute: variation])
        return NSFont(descriptor: descriptor, size: font.pointSize) ?? font
    }

    /// Draws text without macOS font smoothing, the way the web app does (`-webkit-font-smoothing: antialiased`), so
    /// glyphs have the same weight in both. Call once at launch, before anything draws.
    @MainActor
    public static func matchWebTextRendering() {
        UserDefaults.standard.set(0, forKey: "AppleFontSmoothing")
    }
}
