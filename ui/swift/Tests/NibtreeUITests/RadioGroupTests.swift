import CoreGraphics
import NibtreeTokens
import Testing

@testable import NibtreeUI

@Suite("RadioGroup")
@MainActor
struct RadioGroupTests {
    private func look(layout: NRadioGroupLayout = .stacked) -> NRadioGroupLook {
        NRadioGroupLook(
            labels: ["Soft", "Hard"], notes: ["Keep your changes.", nil], danger: [false, true],
            disabled: [false, false],
            chosen: 0, direction: .column, layout: layout, labelWidth: .large)
    }

    @Test("a stacked choice puts its description under its label, the radio 1 space down")
    func stacked() {
        let look = look()
        let choice = look.measure(look.items[0], width: 300)
        #expect(abs(choice.radioTop - GMSpace.s1) < 1e-9)
        #expect(abs(choice.note.y - (look.items[0].label.line.height + GMSpace.s1)) < 1e-9)
        #expect(abs(choice.label.x - (NRadioGroupLook.side + GMSpace.s3)) < 1e-9)
    }

    @Test("columns put the hint after the label column, all centered on the row")
    func columns() {
        let look = look(layout: .columns)
        let choice = look.measure(look.items[0], width: 400)
        let hint = NRadioGroupLook.side + GMSpace.s3 + NLabelColumn.large.points + GMSpace.s3
        #expect(abs(choice.note.x - hint) < 1e-9)
        #expect(abs(choice.radioTop - (choice.size.height - NRadioGroupLook.side) / 2) < 1e-9)
    }

    @Test("a click finds the choice under it")
    func hit() {
        let placed = NRadioGroupPlaced()
        placed.choices = [
            .init(radioTop: 0, label: .zero, note: .zero, size: CGSize(width: 100, height: 20), origin: .zero),
            .init(
                radioTop: 0, label: .zero, note: .zero, size: CGSize(width: 100, height: 20),
                origin: CGPoint(x: 0, y: 28)),
        ]
        #expect(placed.index(at: CGPoint(x: 10, y: 30)) == 1)
        #expect(placed.index(at: CGPoint(x: 10, y: 24)) == nil)
    }
}
