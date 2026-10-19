import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

/// FileRow.svelte's flex row: where each part goes.
@Suite("FileRow")
@MainActor
struct FileRowTests {
    private func look(
        badge: String = "", icon: NFileIconView? = nil, nested: Bool = false, variant: NFileRowVariant = .changes,
        checked: Bool? = nil
    ) -> NFileRowLook {
        NFileRowLook(
            kind: .modified, name: "main.rs", directory: "src", note: "", badge: badge, icon: icon, selected: false,
            nested: nested, variant: variant, checked: checked)
    }

    @Test("a changes row is indented, more when nested; a plain list is not")
    func padding() {
        #expect(look().paddingLeft == GMFileRowTokens.paddingLeft)
        #expect(look(nested: true).paddingLeft == GMFileRowTokens.nestedPaddingLeft)
        #expect(look(variant: .list).paddingLeft == GMFileRowTokens.listPaddingX)
    }

    @Test("the checkbox comes first, then the letter; with no icon the words follow the letter")
    func lead() {
        let row = look(checked: true)
        let parts = row.parts(width: 300, actions: nil)
        #expect(parts.checkbox == GMFileRowTokens.paddingLeft)
        let letter: CGFloat = GMFileRowTokens.paddingLeft + NCheckboxBox.side + GMFileRowTokens.gap
        #expect(parts.letter == letter)
        let text: CGFloat = letter + GMFileRowTokens.letterWidth + GMFileRowTokens.gap
        #expect(parts.text == text)
        #expect(parts.icon == nil)
    }

    @Test("the tag and the buttons sit at the row's end; the words take the rest")
    func tail() {
        let row = look(badge: "LFS")
        let parts = row.parts(width: 300, actions: 41)
        let end: CGFloat = 300 - GMFileRowTokens.paddingRight - 41
        #expect(parts.actions == end)
        #expect((parts.tag ?? 0) + (row.tagWidth ?? 0) + GMFileRowTokens.gap == end)
    }

    @Test("a folder keeps the margin and the space the template leaves before it")
    func directoryRoom() {
        #expect(look().directoryMargin > GMSpace.s3)
        #expect(look(variant: .list).directoryMargin - look().directoryMargin == GMSpace.s4 - GMSpace.s3)
    }
}
