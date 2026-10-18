import NibtreeTokens
import SwiftUI

/// One color theme in one appearance: every `GMColorToken` as a SwiftUI color. The values come from
/// `GMTheme.colors(_:)`, which the token generator computes with the web library's theme catalog, so a theme looks the
/// same in the web app and the native one.
public struct Palette: Sendable, Equatable {
    /// The built-in themes (colors.json); every other theme is one of `GMTheme.all`.
    public static let lightThemeId = "gm-light"
    public static let darkThemeId = "gm-dark"

    public static let light = Palette(themeId: lightThemeId)
    public static let dark = Palette(themeId: darkThemeId)

    public let themeId: String
    public let isDark: Bool
    private let swatches: Swatches

    /// One theme's colors, built once per theme and shared by every palette of it: SwiftUI colors and CGColors by
    /// token, so a draw only indexes arrays.
    private final class Swatches: @unchecked Sendable {
        let colors: [Color]
        let cgColors: [CGColor]
        let defined: [Bool]

        init(_ values: [String: GMRGBA]) {
            let tokens = GMColorToken.allCases
            defined = tokens.map { values[$0.rawValue] != nil }
            cgColors = tokens.map { token in
                guard let value = values[token.rawValue] else {
                    return CGColor(gray: 0, alpha: 0)
                }
                return CGColor(
                    srgbRed: value.red / 255, green: value.green / 255, blue: value.blue / 255, alpha: value.alpha)
            }
            colors = cgColors.map { Color(cgColor: $0) }
        }
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var built: [String: Swatches] = [:]
    private static let indexes = Dictionary(
        uniqueKeysWithValues: GMColorToken.allCases.enumerated().map { ($1, $0) })

    private static func swatches(_ themeId: String) -> Swatches {
        lock.lock()
        defer { lock.unlock() }
        if let found = built[themeId] {
            return found
        }
        let made = Swatches(GMTheme.colors(themeId) ?? [:])
        built[themeId] = made
        return made
    }

    /// The palette of `themeId`; an unknown id gets the built-in theme of `fallbackDark`'s appearance.
    public init(themeId: String, fallbackDark: Bool = false) {
        if let info = GMTheme.all.first(where: { $0.id == themeId }) {
            self.themeId = info.id
            self.isDark = info.kind.hasSuffix("dark")
        } else {
            self.themeId = fallbackDark ? Palette.darkThemeId : Palette.lightThemeId
            self.isDark = fallbackDark
        }
        self.swatches = Palette.swatches(self.themeId)
    }

    /// The token's color in this theme. Values are sRGB, like CSS colors, so they match the web view.
    public func color(_ token: GMColorToken) -> Color {
        swatches.colors[Palette.indexes[token] ?? 0]
    }

    /// The token's color as a CGColor in sRGB, for drawing with Core Graphics (`NText`).
    public func cgColor(_ token: GMColorToken) -> CGColor {
        swatches.cgColors[Palette.indexes[token] ?? 0]
    }

    /// Whether the theme defines `token` (every theme defines all of them; the tests keep it so).
    public func defines(_ token: GMColorToken) -> Bool {
        swatches.defined[Palette.indexes[token] ?? 0]
    }

    public static func == (lhs: Palette, rhs: Palette) -> Bool {
        lhs.themeId == rhs.themeId
    }
}
