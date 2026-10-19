import CoreGraphics
import Testing

@testable import NibtreeUI

/// The same cases as ui/web `logic/zoom.test.ts` for the parts the Swift side has.
@Suite("Zoom")
struct ZoomTests {
    @Test("steps up and down, from a step or between two")
    func next() {
        #expect(NZoom.next(1, up: true) == 1.5)
        #expect(NZoom.next(1, up: false) == 0.75)
        #expect(NZoom.next(0.6, up: true) == 0.75)
        #expect(NZoom.next(0.6, up: false) == 0.5)
    }

    @Test("stays at the first and last steps")
    func ends() {
        #expect(NZoom.next(8, up: true) == 8)
        #expect(NZoom.next(0.1, up: false) == 0.1)
    }

    @Test("fits big images in the box and keeps small ones at their real size")
    func fit() {
        #expect(NZoom.fit(CGSize(width: 2000, height: 1000), box: CGSize(width: 500, height: 500)) == 0.25)
        #expect(NZoom.fit(CGSize(width: 100, height: 100), box: CGSize(width: 500, height: 500)) == 1)
        #expect(NZoom.fit(nil, box: CGSize(width: 500, height: 500)) == 1)
        #expect(NZoom.fit(CGSize(width: 100, height: 100), box: .zero) == 1)
    }

    @Test("a compare shares the smallest fit")
    func shared() {
        let sizes: [CGSize?] = [CGSize(width: 1000, height: 1000), CGSize(width: 2000, height: 500), nil]
        #expect(NZoom.sharedFit(sizes, box: CGSize(width: 500, height: 500)) == 0.25)
        #expect(NZoom.sharedFit([nil], box: CGSize(width: 500, height: 500)) == 1)
    }

    @Test("writes the zoom in whole percent")
    func label() {
        #expect(NZoom.label(1) == "100%")
        #expect(NZoom.label(0.333) == "33%")
        #expect(NZoom.label(1.5) == "150%")
    }
}
