import Testing

@testable import NibtreeUI

/// The same numbers as ui/web logic/splitRatio.test.ts and resize.test.ts.
@Suite("Split math")
struct SplitMathTests {
    @Test("a split stays between 15% and 85%, and a pointer outside the box is clamped")
    func ratios() {
        #expect(NSplitMath.pointerRatio(150, width: 300) == 0.5)
        #expect(NSplitMath.pointerRatio(10, width: 300) == 0.15)
        #expect(NSplitMath.pointerRatio(290, width: 300) == 0.85)
        #expect(NSplitMath.pointerRatio(100, width: 300, gutter: 100) == 0.5)
        #expect(NSplitMath.pointerRatio(10, width: 0) == 0.5)
    }

    @Test("an arrow key moves the split 2%, five times as far with Shift")
    func keys() {
        #expect(abs(NSplitMath.keyedRatio(0.5, left: true, shift: false) - 0.48) < 1e-9)
        #expect(abs(NSplitMath.keyedRatio(0.5, left: false, shift: true) - 0.6) < 1e-9)
        #expect(NSplitMath.keyedRatio(0.84, left: false, shift: true) == 0.85)
    }

    @Test("a panel grows toward its handle side, within its limits, in whole points")
    func sizes() {
        #expect(NSplitMath.draggedSize(.left, start: 200, delta: 30.4, min: 120, max: 400) == 230)
        #expect(NSplitMath.draggedSize(.right, start: 200, delta: 30, min: 120, max: 400) == 170)
        #expect(NSplitMath.draggedSize(.top, start: 200, delta: 500, min: 120, max: 400) == 400)
        #expect(NSplitMath.keyedSize(.bottom, key: .up, shift: false, size: 200, min: 80, max: 400) == 210)
        #expect(NSplitMath.keyedSize(.bottom, key: .down, shift: true, size: 200, min: 80, max: 400) == 160)
        #expect(NSplitMath.keyedSize(.left, key: .up, shift: false, size: 200, min: 80, max: 400) == nil)
    }
}

@Suite("Split layout")
struct SplitLayoutTests {
    @Test("a sized pane keeps its size past the split's end, like the web's flex: none; the rest takes what is left")
    func firstLength() {
        #expect(NSplitLayout.firstLength(300, size: 120, sizedFirst: true) == 120)
        #expect(NSplitLayout.firstLength(80, size: 120, sizedFirst: true) == 120)
        #expect(NSplitLayout.firstLength(300, size: 120, sizedFirst: false) == 179)
        #expect(NSplitLayout.firstLength(80, size: 120, sizedFirst: false) == 0)
        #expect(NSplitLayout.firstLength(80, size: -5, sizedFirst: true) == 0)
    }
}
