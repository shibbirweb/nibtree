import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("Palette")
struct PaletteTests {
    @Test("every theme defines every color token")
    func everyThemeIsComplete() {
        #expect(GMTheme.all.count == 42)
        for theme in GMTheme.all {
            let palette = Palette(themeId: theme.id)
            #expect(palette.themeId == theme.id)
            for token in GMColorToken.allCases {
                #expect(palette.defines(token), "\(theme.id) lacks \(token.rawValue)")
            }
        }
    }

    @Test("dark and high contrast dark themes are dark")
    func darkness() {
        #expect(Palette(themeId: "gm-dark").isDark)
        #expect(Palette(themeId: "dusk").isDark)
        #expect(!Palette(themeId: "gm-light").isDark)
        #expect(!Palette(themeId: "classic-light").isDark)
    }

    @Test("an unknown theme falls back to the built-in theme of its appearance")
    func fallback() {
        #expect(Palette(themeId: "no-such-theme").themeId == Palette.lightThemeId)
        #expect(Palette(themeId: "no-such-theme", fallbackDark: true).themeId == Palette.darkThemeId)
    }
}

/// Views are main-actor types, so tests that make them run on the main actor.
@Suite("Presets")
@MainActor
struct PresetTests {
    @Test("space steps match ui/web's Stack gaps")
    func spacing() {
        let expected: [NSpacing: Double] = [
            .none: 0, .xxs: 2, .xs: 4, .sm: 6, .md: 8, .mdPlus: 10, .lg: 12, .lgPlus: 14, .xl: 16, .xxl: 24,
            .xxxl: 32,
        ]
        for step in NSpacing.allCases {
            #expect(Double(step.points) == expected[step], "\(step.rawValue)")
        }
    }

    @Test("text variants use their token styles and tones")
    func textVariants() {
        #expect(NText.Variant.body.style.size == 13)
        #expect(NText("x", variant: .hint).resolvedTone == .dim)
        #expect(NText("x", variant: .hint, tone: .danger).resolvedTone == .danger)
        #expect(NText("x").resolvedTone == .default)
        #expect(NText.Tone.default.token == .text)
    }
}
