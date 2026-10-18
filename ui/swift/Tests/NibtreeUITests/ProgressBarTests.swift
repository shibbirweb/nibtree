import Testing

@testable import NibtreeUI

@Suite("ProgressBar")
struct ProgressBarTests {
    @Test("the share is clamped to a sliver and to the whole, and NaN shows the sliver")
    func clamped() {
        #expect(NProgressBar.shown(0.5) == 0.5)
        #expect(NProgressBar.shown(0) == NProgressBar.minimumShare)
        #expect(NProgressBar.shown(-3) == NProgressBar.minimumShare)
        #expect(NProgressBar.shown(.nan) == NProgressBar.minimumShare)
        #expect(NProgressBar.shown(.infinity) == NProgressBar.minimumShare)
        #expect(NProgressBar.shown(1.5) == 1)
    }
}
