import CoreGraphics
import NoteEditorKit
import Testing

/// A selection moved on its page (#325): the moved boxes, the clamp at each edge, the inverse and
/// the tablet's element numbers.
@Suite struct ElementMoveTests {
    static let elements = [
        MovedElement(record: 0, box: EditRect(left: 100, top: 200, right: 300, bottom: 260)),
        MovedElement(record: 4, box: EditRect(left: 250, top: 400, right: 400, bottom: 500)),
    ]

    @Test func eachBoxMovesByTheOffsetAndNamesItsTabletNumber() {
        let move = ElementMove(page: 2, elements: Self.elements, dx: 30, dy: -50)
        #expect(
            move.placements == [
                ElementPlacement(number: 1, rect: EditRect(left: 130, top: 150, right: 330, bottom: 210)),
                ElementPlacement(number: 5, rect: EditRect(left: 280, top: 350, right: 430, bottom: 450)),
            ])
        #expect(move.frame == EditRect(left: 100, top: 200, right: 400, bottom: 500))
    }

    @Test(arguments: [
        (-500, 0, -100, 0), (5000, 0, 1520, 0), (0, -900, 0, -200), (0, 9000, 0, 2060), (10, 20, 10, 20),
    ])
    func theSelectionStopsAtEachEdge(dx: Int, dy: Int, keptX: Int, keptY: Int) {
        let move = ElementMove(page: 0, elements: Self.elements, dx: dx, dy: dy).clamped(width: 1920, height: 2560)
        #expect(move.dx == keptX && move.dy == keptY)
    }

    @Test func theInverseTakesEachElementBack() {
        let move = ElementMove(page: 1, elements: Self.elements, dx: 12, dy: 7)
        let back = move.inverse
        #expect(back.dx == -12 && back.dy == -7)
        #expect(back.placements.map(\.rect) == Self.elements.map(\.box))
        #expect(NoteEdit.moveElements(move).inverse == .moveElements(back))
    }

    @Test func aRunOfNudgesAddsUpAndAnEmptyMoveFitsNoNote() {
        let run = (1...10).reduce(ElementMove(page: 0, elements: Self.elements, dx: 0, dy: 0)) { move, _ in
            move.by(dx: 0, dy: 4)
        }
        #expect(run.dy == 40)
        #expect(NoteEdit.moveElements(run).apply(to: ["a"]) == ["a"])
        #expect(NoteEdit.moveElements(run.by(dx: 0, dy: -40)).apply(to: ["a"]) == nil)
        #expect(
            NoteEdit.moveElements(ElementMove(page: 3, elements: Self.elements, dx: 1, dy: 0)).apply(to: ["a"]) == nil)
    }

    /// One point at the zoom shown, as Preview nudges, and ten with Shift.
    @Test func aNudgeIsOnePointAtTheZoomShown() {
        #expect(ElementMove.nudge(magnification: 1, scale: 2, shift: false) == 2)
        #expect(ElementMove.nudge(magnification: 0.25, scale: 2, shift: false) == 8)
        #expect(ElementMove.nudge(magnification: 4, scale: 1, shift: false) == 1)
        #expect(ElementMove.nudge(magnification: 1, scale: 1, shift: true) == 10)
    }
}
