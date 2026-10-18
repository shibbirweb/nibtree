import CoreGraphics
import Testing

@testable import NibtreeUI

/// The Navigation Bar's flex-shrink, checked against what logic/crumbs.ts and CSS give.
@Suite("Crumb math")
struct CrumbMathTests {
    @Test("the farthest crumb shortens first, ten times faster per step")
    func shrink() {
        #expect(NCrumbMath.shrink(index: 2, count: 3) == 1)
        #expect(NCrumbMath.shrink(index: 1, count: 3) == 10)
        #expect(NCrumbMath.shrink(index: 0, count: 3) == 100)
        #expect(NCrumbMath.shrink(index: 0, count: 10) == 1_000_000)
    }

    @Test("widths keep their content while it fits")
    func fits() {
        let widths = NCrumbMath.widths(basis: [50, 12, 60], least: [20, 12, 20], shrink: [10, 0, 1], available: 200)
        #expect(widths == [50, 12, 60])
    }

    @Test("the far crumb gives up its width down to its least, then the next one")
    func narrow() {
        let near = NCrumbMath.widths(basis: [50, 12, 60], least: [20, 12, 20], shrink: [10, 0, 1], available: 112)
        #expect(abs(near[0] - 41.07) < 0.01)
        #expect(near[1] == 12)
        #expect(abs(near[2] - 58.93) < 0.01)
        let far = NCrumbMath.widths(basis: [50, 12, 60], least: [20, 12, 20], shrink: [10, 0, 1], available: 72)
        #expect(far == [20, 12, 40])
        // WebKit's second bar in breadcrumbs-narrow: the far crumb shrinks by its width less its padding.
        let bar = NCrumbMath.widths(
            basis: [54.59, 154.1], inner: [48.59, 148.1], least: [18.2, 34.2], shrink: [10, 1], available: 171.81)
        #expect(abs(bar[0] - 26.33) < 0.02)
        let none = NCrumbMath.widths(basis: [50, 12, 60], least: [20, 12, 20], shrink: [10, 0, 1], available: 30)
        #expect(none == [20, 12, 20])
    }
}
