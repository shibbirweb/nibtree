import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// Tabs.svelte's two looks and where a click lands.
@Suite("Tabs")
@MainActor
struct TabsTests {
    @Test("panel tabs are small capitals at the panel height")
    func panel() {
        let look = NTabsLook(labels: ["Terminal", "Run"], chosen: 0, variant: .panel)
        #expect(look.tabs.map(\.text) == ["TERMINAL", "RUN"])
        #expect(look.height == GMPanelTabsTokens.height)
        #expect(look.tabs[0].kerning > 0)
    }

    @Test("underline tabs keep their case, pad their words and bolden the chosen one")
    func underline() {
        let look = NTabsLook(labels: ["All", "Files"], chosen: 1, variant: .underline)
        #expect(look.tabs.map(\.text) == ["All", "Files"])
        #expect(look.tabs[1].font.weight == GMFontWeight.semibold)
        #expect(look.tabs[0].font.weight == GMFontWeight.regular)
        let words = NTextMetrics.width(of: "All", font: look.tabs[0].font, kerning: 0)
        let padded: CGFloat = words + 2 * GMTabsTokens.underlinePaddingX
        #expect(look.widths[0] == padded)
    }

    @Test("a click picks the tab under it; the gap between tabs picks none")
    func hit() {
        let placed = NTabsPlaced()
        placed.starts = [0, 60]
        placed.widths = [50, 40]
        #expect(placed.index(at: 10) == 0)
        #expect(placed.index(at: 55) == nil)
        #expect(placed.index(at: 99) == 1)
        #expect(placed.index(at: 100) == nil)
    }
}
