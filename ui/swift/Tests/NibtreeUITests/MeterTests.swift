import Testing

@testable import NibtreeUI

@Suite("Meter")
struct MeterTests {
    @Test("the share is clamped like the web's bar width, each variant keeping its sliver")
    func clamped() {
        #expect(NMeter.shown(0.5, variant: .memory) == 0.5)
        #expect(NMeter.shown(0, variant: .memory) == 0)
        #expect(NMeter.shown(0, variant: .usage) == 0.02)
        #expect(NMeter.shown(-1, variant: .mini) == 0.04)
        #expect(NMeter.shown(1.4, variant: .usage) == 1)
        #expect(NMeter.shown(.infinity, variant: .memory) == 1)
        #expect(NMeter.shown(-.infinity, variant: .usage) == 0.02)
    }

    @Test("NaN fills the bar, as the web's invalid width leaves the fill as wide as the bar")
    func notANumber() {
        #expect(NMeter.shown(.nan, variant: .memory) == 1)
    }
}
