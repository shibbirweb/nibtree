import CoreGraphics
import Testing

@testable import NibtreeUI

/// The range input's numbers and WebKit's accent fill, checked against what WebKit draws.
@Suite("Slider math")
struct SliderMathTests {
    private func hex(_ color: CGColor) -> String {
        (color.components ?? []).prefix(3).map { String(format: "%02x", Int(($0 * 255).rounded())) }.joined()
    }

    private func color(_ red: Double, _ green: Double, _ blue: Double) -> CGColor {
        CGColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
    }

    @Test("values snap to the step within the range")
    func snapped() {
        #expect(NSliderMath.snapped(13.4, min: 8, max: 24, step: 1) == 13)
        #expect(NSliderMath.snapped(40, min: 8, max: 24, step: 1) == 24)
        #expect(NSliderMath.snapped(-3, min: 8, max: 24, step: 1) == 8)
        #expect(NSliderMath.snapped(10, min: 0, max: 10, step: 3) == 9)
        #expect(NSliderMath.fraction(16, min: 8, max: 24, step: 1) == 0.5)
        #expect(NSliderMath.value(along: 0.26, min: 100, max: 900, step: 100) == 300)
    }

    @Test("the value reads like JavaScript's String(number)")
    func text() {
        #expect(NSliderMath.text(8) == "8")
        #expect(NSliderMath.text(1.5) == "1.5")
        #expect(NSliderMath.text(-2) == "-2")
    }

    @Test("WebKit moves an accent to luminance 0.5 when it lacks contrast")
    func tint() {
        #expect(hex(NSliderMath.tint(color(0x35, 0x74, 0xf0), dark: true)) == "55b2ff")
        #expect(hex(NSliderMath.tint(color(0x35, 0x74, 0xf0), dark: false)) == "3574f0")
        #expect(hex(NSliderMath.tint(color(0, 255, 0), dark: false)) == "00da00")
        #expect(hex(NSliderMath.tint(color(255, 255, 255), dark: false)) == "bcbcbc")
        #expect(hex(NSliderMath.tint(color(0xe5, 0xa5, 0x0a), dark: true)) == "f3b00b")
        #expect(hex(NSliderMath.tint(color(255, 0, 0), dark: true)) == "ff0000")
    }
}
