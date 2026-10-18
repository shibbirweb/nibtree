import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("Icons")
struct IconTests {
    @Test("every icon has an outline that stays on its 24-point grid")
    func outlines() {
        for name in GMIconName.allCases {
            let box = NIconOutlines.path(name).boundingBoxOfPath
            #expect(box.width > 0 || box.height > 0, "\(name.rawValue) draws nothing")
            #expect(box.minX >= 0 && box.minY >= 0 && box.maxX <= 24 && box.maxY <= 24, "\(name.rawValue): \(box)")
        }
    }

    @Test("a generated circle is round: its curves reach the radius on every side")
    func circle() {
        // circle-check starts with the circle of radius 10 around (12, 12).
        let box = NIconOutlines.build(Array(GMIconName.circleCheck.ops.prefix(5))).boundingBoxOfPath
        #expect(abs(box.minX - 2) < 0.01 && abs(box.maxX - 22) < 0.01)
        #expect(abs(box.minY - 2) < 0.01 && abs(box.maxY - 22) < 0.01)
    }

    @Test("an icon is stroked once per size, stroke, color and scale, at whole device pixels")
    func images() throws {
        let black = CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1)
        let key = NIconImages.Key(name: .check, points: 16, lineWidth: 2, scale: 2, color: black)
        let first = try #require(NIconImages.image(key, color: black))
        #expect(first.width == 32 && first.height == 32)
        #expect(NIconImages.image(key, color: black) === first)
        let red = CGColor(srgbRed: 1, green: 0, blue: 0, alpha: 1)
        let other = NIconImages.Key(name: .check, points: 16, lineWidth: 2, scale: 2, color: red)
        #expect(NIconImages.image(other, color: red) !== first)
    }
}
