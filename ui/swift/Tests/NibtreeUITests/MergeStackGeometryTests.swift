import CoreGraphics
import Testing

@testable import NibtreeUI

/// Where the stacked merge frame puts its titles, panes and lines (the canvas draws and the layout places from it).
@Suite("Stacked merge geometry")
struct MergeStackGeometryTests {
    private func geometry(top: CGFloat, ratio: Double = 0.5, height: CGFloat = 360) -> NMergeStackGeometry {
        NMergeStackGeometry(
            size: CGSize(width: 641, height: height), topHeight: top, ratio: ratio, title: 26, resultMin: 120)
    }

    @Test("a top row of 0, or one that leaves the result less than its room, starts at half")
    func fitting() {
        #expect(geometry(top: 0).top == 180)
        #expect(geometry(top: 300).top == 180)
        #expect(geometry(top: 150).top == 150)
        #expect(geometry(top: 0, height: 200).top == 120)
    }

    @Test("the columns share the width less the right column's line, like flex columns")
    func columns() {
        let split = geometry(top: 150, ratio: 0.25)
        #expect(split.left == 160)
        #expect(split.rightTitle.minX == 161)
        #expect(split.rightPane.width == 480)
    }

    @Test("the result sits under the handle's point and two lines, its title then its pane")
    func result() {
        let split = geometry(top: 150)
        #expect(split.handle == CGRect(x: 0, y: 150, width: 641, height: 1))
        #expect(split.resultTitle.minY == 153)
        #expect(split.resultPane.minY == 179)
        #expect(split.resultPane.maxY == 360)
        #expect(split.leftPane.height == 124)
    }
}
