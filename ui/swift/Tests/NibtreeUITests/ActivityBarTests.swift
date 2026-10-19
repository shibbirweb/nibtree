import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// ActivityBar.svelte's column: where each entry goes and where a click lands.
@Suite("ActivityBar")
@MainActor
struct ActivityBarTests {
    @Test("a click picks the entry under it; the gap between entries picks none")
    func hit() {
        let placed = NActivityBarPlaced()
        placed.tops = [6, 44]
        placed.heights = [36, 36]
        #expect(placed.index(at: 10) == 0)
        #expect(placed.index(at: 43) == nil)
        #expect(placed.index(at: 50) == 1)
    }

    @Test("the open button's tint is the accent at 12%")
    func tint() {
        #expect(NActivityBarPaint.activeShare == 0.12)
    }
}
