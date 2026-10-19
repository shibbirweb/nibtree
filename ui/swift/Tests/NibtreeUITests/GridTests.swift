import Testing

@testable import NibtreeUI

@Suite("Grid")
struct GridTests {
    @Test("a fixed count is kept whatever the width")
    func fixed() {
        #expect(NGridLayout.columns(width: 100, count: 4, minColumn: 180, gap: 12) == 4)
    }

    @Test("auto-fill fits as many columns of at least the minimum as the width holds, gaps included, and never none")
    func autoFill() {
        #expect(NGridLayout.columns(width: 596, count: nil, minColumn: 180, gap: 12) == 3)
        #expect(NGridLayout.columns(width: 563, count: nil, minColumn: 180, gap: 12) == 2)
        #expect(NGridLayout.columns(width: 564, count: nil, minColumn: 180, gap: 12) == 3)
        #expect(NGridLayout.columns(width: 50, count: nil, minColumn: 180, gap: 12) == 1)
    }
}
