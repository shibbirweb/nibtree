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
    private let colors: [String: GMRGBA]

    /// The palette of `themeId`; an unknown id gets the built-in theme of `fallbackDark`'s appearance.
    public init(themeId: String, fallbackDark: Bool = false) {
        let info = GMTheme.all.first { $0.id == themeId }
        if let info, let colors = GMTheme.colors(themeId) {
            self.themeId = info.id
            self.isDark = info.kind.hasSuffix("dark")
            self.colors = colors
        } else {
            let fallback = fallbackDark ? Palette.darkThemeId : Palette.lightThemeId
            self.themeId = fallback
            self.isDark = fallbackDark
            self.colors = GMTheme.colors(fallback) ?? [:]
        }
    }

    /// The token's color in this theme. Values are sRGB, like CSS colors, so they match the web view.
    public func color(_ token: GMColorToken) -> Color {
        guard let value = colors[token.rawValue] else {
            return .clear
        }
        return Color(
            .sRGB, red: value.red / 255, green: value.green / 255, blue: value.blue / 255, opacity: value.alpha)
    }

    /// Whether the theme defines `token` (every theme defines all of them; the tests keep it so).
    public func defines(_ token: GMColorToken) -> Bool {
        colors[token.rawValue] != nil
    }

    public static func == (lhs: Palette, rhs: Palette) -> Bool {
        lhs.themeId == rhs.themeId
    }
}
