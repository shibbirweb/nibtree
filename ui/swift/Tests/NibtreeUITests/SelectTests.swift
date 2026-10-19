import AppKit
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// Select.svelte's width rules and the native menu its choices become.
@Suite("Select")
@MainActor
struct SelectTests {
    private let items = [
        NSelectMenu.Item(label: "Merge", disabled: false, title: nil),
        NSelectMenu.Item(label: "Rebase", disabled: false, title: "Replay your commits"),
        NSelectMenu.Item(label: "Fast-forward", disabled: true, title: nil),
    ]

    @Test("the menu checks the chosen choice, dims disabled ones and keeps their tooltips")
    func menu() {
        let menu = NSelectMenu.menu(items, chosen: 1) { _ in }
        #expect(menu.items.map(\.title) == ["Merge", "Rebase", "Fast-forward"])
        #expect(menu.items.map(\.state) == [.off, .on, .off])
        #expect(menu.items.map(\.isEnabled) == [true, true, false])
        #expect(menu.items[1].toolTip == "Replay your commits")
    }

    @Test("picking a menu item hands its index on")
    func pick() {
        var picked: Int?
        let menu = NSelectMenu.menu(items, chosen: 0) { picked = $0 }
        let item = menu.items[1]
        if let action = item.action, let target = item.target {
            _ = (target as AnyObject).perform(action, with: item)
        }
        #expect(picked == 1)
    }

    @Test("arrows step over disabled choices and stop at the ends")
    func step() {
        #expect(NSelectMenu.step(from: 0, by: 1, items: items) == 1)
        #expect(NSelectMenu.step(from: 1, by: 1, items: items) == 1)
        #expect(NSelectMenu.step(from: 0, by: -1, items: items) == 0)
        #expect(NSelectMenu.step(from: nil, by: 1, items: items) == 0)
    }

    private func look(size: NSelectSize = .normal, width: NControlWidth = .auto) -> NSelectLook {
        NSelectLook(labels: ["Merge", "Rebase onto upstream"], chosen: "Merge", size: size, width: width)
    }

    @Test("its own width is the widest choice rounded up, with padding, arrow room and border")
    func ownWidth() {
        let normal = look()
        let expected: CGFloat = normal.widest.rounded(.up) + GMInputTokens.paddingX + GMSelectTokens.arrowSpace + 2
        #expect(normal.width(offer: nil) == expected)
        let small = look(size: .small)
        let smallExpected: CGFloat = small.widest.rounded(.up) + GMSpace.s2 + GMSelectTokens.smallArrowSpace + 2
        #expect(small.width(offer: nil) == smallExpected)
    }

    @Test("presets and fill set the width, never past the large control width")
    func presets() {
        #expect(look(width: .medium).width(offer: nil) == GMControlWidth.medium)
        #expect(look(width: .fill).width(offer: 200) == 200)
        #expect(look(width: .fill).width(offer: 900) == GMControlWidth.large)
        let long = NSelectLook(
            labels: [String(repeating: "long ", count: 30)], chosen: "", size: .normal, width: .auto)
        #expect(long.width(offer: nil) == GMControlWidth.large)
    }
}
