import SwiftUI

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = Palette.light
}

extension EnvironmentValues {
    /// The palette components draw with; set it with `.nibtreeTheme(light:dark:)`.
    public var nibtreePalette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

/// Picks the light or the dark theme from the view's appearance, like the app's two Color theme settings.
private struct NibtreeThemeModifier: ViewModifier {
    let lightThemeId: String
    let darkThemeId: String
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let dark = colorScheme == .dark
        let palette = Palette(themeId: dark ? darkThemeId : lightThemeId, fallbackDark: dark)
        content.environment(\.nibtreePalette, palette)
    }
}

extension View {
    /// Draws the components inside with `light` in light appearance and `dark` in dark appearance.
    public func nibtreeTheme(light: String = Palette.lightThemeId, dark: String = Palette.darkThemeId) -> some View {
        modifier(NibtreeThemeModifier(lightThemeId: light, darkThemeId: dark))
    }
}
