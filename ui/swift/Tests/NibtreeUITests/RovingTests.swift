import Testing

@testable import NibtreeUI

/// The same cases as ui/web `logic/roving.test.ts`.
@Suite("Roving")
struct RovingTests {
    @Test("moves to the next and previous item, wrapping at the ends")
    func wraps() {
        #expect(NRoving.next(0, count: 3, key: .next) == 1)
        #expect(NRoving.next(2, count: 3, key: .next) == 0)
        #expect(NRoving.next(0, count: 3, key: .previous) == 2)
    }

    @Test("skips disabled items, and stays when every other one is disabled")
    func skips() {
        #expect(NRoving.next(0, count: 3, key: .next) { $0 == 1 } == 2)
        #expect(NRoving.next(0, count: 3, key: .next) { $0 != 0 } == 0)
    }

    @Test("Home and End go to the first and last enabled item")
    func ends() {
        #expect(NRoving.next(1, count: 4, key: .first) { $0 == 0 } == 1)
        #expect(NRoving.next(1, count: 4, key: .last) { $0 == 3 } == 2)
        #expect(NRoving.next(0, count: 0, key: .next) == -1)
    }
}
