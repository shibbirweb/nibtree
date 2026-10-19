import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// SideNav.svelte's item heights and words.
@Suite("SideNav")
@MainActor
struct SideNavTests {
    private func look(_ items: [NSideNavItem], variant: NSideNavVariant = .settings) -> NSideNavLook {
        NSideNavLook(items: items, active: "git", variant: variant, emptyText: "None")
    }

    @Test("a settings item's icon is a block above its words, as WebKit lays out the button's SVG")
    func iconBlock() {
        let nav = look([NSideNavItem(id: "a", label: "Editor"), NSideNavItem(id: "git", label: "Git", icon: .branch)])
        let heights = nav.heights(width: 200)
        #expect(heights[1] - heights[0] == NIconSize.normal.points)
        #expect(nav.labels[1].font.weight == GMFontWeight.medium)
    }

    @Test("a danger item is smaller; Welcome items are the token heights")
    func sizes() {
        let nav = look([NSideNavItem(id: "reset", label: "Reset", danger: true)])
        #expect(nav.labels[0].font.size == GMFontSize.small)
        let large = look([NSideNavItem(id: "a", label: "Start")], variant: .large)
        #expect(large.heights(width: 200) == [GMSideNavTokens.largeHeight])
        let links = look([NSideNavItem(id: "a", label: "Docs")], variant: .links)
        #expect(links.heights(width: 200) == [GMSideNavTokens.linkHeight])
    }

    @Test("with no items it shows the empty text; with items it does not")
    func empty() {
        #expect(look([]).empty?.text == "None")
        #expect(look([NSideNavItem(id: "a", label: "A")]).empty == nil)
    }
}
