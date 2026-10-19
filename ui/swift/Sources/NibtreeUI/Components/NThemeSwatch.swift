import NibtreeTokens
import SwiftUI

/// A theme's own colors for its swatch: data from the theme, not this app's palette.
public struct NThemeSwatchColors: Sendable {
    public let background, foreground, border, keyword, string, accent, selection: Color

    public init(
        background: Color, foreground: Color, border: Color, keyword: Color, string: Color, accent: Color,
        selection: Color
    ) {
        self.background = background
        self.foreground = foreground
        self.border = border
        self.keyword = keyword
        self.string = string
        self.accent = accent
        self.selection = selection
    }
}

/// A color theme's preview chip: a word of code on the theme's background and three bars for its keyword, string and
/// accent colors, like Settings' theme list: the Swift side of ui/web `ThemeSwatch` (docs/components/ThemeSwatch.md).
/// A fixed size whatever the stack around it, drawn in one canvas.
public struct NThemeSwatch: View {
    private let colors: NThemeSwatchColors
    private let label: String

    public init(colors: NThemeSwatchColors, label: String) {
        self.colors = colors
        self.label = label
    }

    public var body: some View {
        let colors = colors
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let scale = max(1, context.environment.displayScale)
                let environment = context.environment
                let resolve = { (color: Color) in color.resolve(in: environment).cgColor }
                context.withCGContext { cg in
                    NThemeSwatchFace.draw(colors: colors, resolve: resolve, size: size, scale: scale, in: cg)
                }
            }
        }
        .frame(width: GMThemeSwatchTokens.width, height: GMThemeSwatchTokens.height)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isImage)
    }
}

enum NThemeSwatchFace {
    /// ThemeSwatch.svelte's `line-height: 1` and the selection's `padding: 0 1px`.
    static let selectionPadding = 1.0

    @MainActor
    static func draw(
        colors: NThemeSwatchColors, resolve: (Color) -> CGColor, size: CGSize, scale: CGFloat, in cg: CGContext
    ) {
        let box = CGRect(origin: .zero, size: size)
        let radius = GMThemeSwatchTokens.radius
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(resolve(colors.background))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: 1, dy: 1), cornerWidth: radius - 1, cornerHeight: radius - 1,
                transform: nil))
        cg.setFillColor(resolve(colors.border))
        cg.fillPath(using: .evenOdd)
        // The bars at the right, 4 points apart, centered.
        let (bar, barHeight) = (GMThemeSwatchTokens.bar, GMThemeSwatchTokens.barHeight)
        let right = size.width - 1 - GMThemeSwatchTokens.paddingX
        for (index, color) in [colors.keyword, colors.string, colors.accent].enumerated() {
            let x = right - CGFloat(3 - index) * bar - CGFloat(2 - index) * GMSpace.s1
            let rect = CGRect(x: x, y: (size.height - barHeight) / 2, width: bar, height: barHeight)
            let tiny = GMRadius.tiny
            cg.addPath(CGPath(roundedRect: rect, cornerWidth: tiny, cornerHeight: tiny, transform: nil))
            cg.setFillColor(resolve(color))
            cg.fillPath()
        }
        // "fn Aa": the keyword in its color, a space, then "Aa" on the selection color.
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.tiny, mono: true)
        let line = NTextMetrics.lineBox(font, lineHeight: 1)
        let top = (size.height - line.height) / 2
        var x = 1 + GMThemeSwatchTokens.paddingX
        let appKit = NTypography.nsFont(font)
        let runs = [("fn", colors.keyword, false), (" ", colors.foreground, false), ("Aa", colors.foreground, true)]
        for (text, color, selected) in runs {
            if selected {
                x += selectionPadding
                let width = NTextMetrics.width(of: text, font: font, kerning: 0)
                let baseline = top + line.baseline
                cg.setFillColor(resolve(colors.selection))
                cg.fill(
                    CGRect(
                        x: x - selectionPadding, y: baseline - appKit.ascender,
                        width: width + 2 * selectionPadding, height: appKit.ascender - appKit.descender))
            }
            let layout = NTextEngine.layout(text, font: font, kerning: 0, tabular: false, truncate: false, width: nil)
            cg.saveGState()
            cg.translateBy(x: x, y: top)
            NTextEngine.draw(layout, line: line, color: resolve(color), strike: nil, scale: scale, in: cg)
            cg.restoreGState()
            x += layout.width
        }
    }
}
