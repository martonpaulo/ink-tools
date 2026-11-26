import CoreGraphics
import Foundation
import InkNotebookEditorKit
import Testing

/// A selection resized, rotated or flipped on its page (#326): the mapped points and frames, the
/// handle resize, the clamp, the refusals and the helper's calls.
@Suite struct ElementTransformTests {
    /// A stroke from (100, 200) to (300, 200), its box holding 10 pixels of ink, and a picture.
    static let stroke = MovedElement(
        record: 0, box: EditRect(left: 100, top: 190, right: 300, bottom: 210),
        points: [CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200)], isArea: false)
    static let picture = MovedElement(
        record: 3, box: EditRect(left: 300, top: 210, right: 500, bottom: 410), isArea: true, isPicture: true)
    static let textBox = MovedElement(record: 5, box: EditRect(left: 100, top: 300, right: 200, bottom: 340))

    @Test func aResizeMapsTheFrameOntoTheNewRectAndScalesEachPoint() {
        let resize = ElementTransform.resize(
            page: 0, elements: [Self.stroke], to: CGRect(x: 100, y: 190, width: 400, height: 40))
        #expect(resize.kind == .resize && resize.matrix.keepsAxes)
        #expect(resize.transformedFrame == CGRect(x: 100, y: 190, width: 400, height: 40))
        #expect(resize.transformed[0].points == [CGPoint(x: 100, y: 210), CGPoint(x: 500, y: 210)])
        #expect(resize.transformed[0].box == EditRect(left: 100, top: 190, right: 500, bottom: 230))
    }

    @Test func aStraightLineKeepsTheSideItDoesNotHave() {
        let line = MovedElement(
            record: 1, box: EditRect(left: 100, top: 200, right: 300, bottom: 200),
            points: [CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200)], isArea: false)
        let resize = ElementTransform.resize(page: 0, elements: [line], to: CGRect(x: 100, y: 250, width: 100, height: 0))
        #expect(resize.transformed[0].points == [CGPoint(x: 100, y: 250), CGPoint(x: 200, y: 250)])
        let turn = ElementTransform.quarterTurn(page: 0, elements: [line], clockwise: true)
        #expect(turn.transformed[0].points == [CGPoint(x: 200, y: 100), CGPoint(x: 200, y: 300)])
    }

    @Test func aQuarterTurnTurnsAboutTheFrameCentreAndFourMakeNoChange() {
        let right = ElementTransform.quarterTurn(page: 0, elements: [Self.stroke], clockwise: true)
        #expect(right.kind == .rotate)
        // The frame (100, 190)-(300, 210) turns about (200, 200): its left end goes to the top.
        #expect(right.transformed[0].points == [CGPoint(x: 200, y: 100), CGPoint(x: 200, y: 300)])
        #expect(right.transformedFrame == CGRect(x: 190, y: 100, width: 20, height: 200))
        let left = ElementTransform.quarterTurn(page: 0, elements: [Self.stroke], clockwise: false)
        #expect(left.transformed[0].points == [CGPoint(x: 200, y: 300), CGPoint(x: 200, y: 100)])
        let four = (1...3).reduce(right.matrix) { matrix, _ in matrix.then(right.matrix) }
        #expect(four.isIdentity)
    }

    @Test func aFreeRotationTurnsClockwiseOnThePage() {
        let turn = ElementTransform.rotation(page: 0, elements: [Self.stroke], radians: .pi / 4)
        let end = turn.transformed[0].points[1]
        #expect(abs(end.x - (200 + 100 / 2.squareRoot())) < 1e-9 && abs(end.y - (200 + 100 / 2.squareRoot())) < 1e-9)
        #expect(turn.kind == .rotate)
    }

    @Test func aFlipMirrorsAboutTheFrameAndTwoMakeNoChange() {
        let mirror = ElementTransform.flip(page: 0, elements: [Self.stroke, Self.picture], horizontal: true)
        #expect(mirror.kind == .flip)
        // The frame is (100, 190)-(500, 410): x goes to 600 - x.
        #expect(mirror.transformed[0].points == [CGPoint(x: 500, y: 200), CGPoint(x: 300, y: 200)])
        #expect(mirror.transformed[1].box == EditRect(left: 100, top: 210, right: 300, bottom: 410))
        #expect(mirror.matrix.then(mirror.matrix).isIdentity)
        let upside = ElementTransform.flip(page: 0, elements: [Self.stroke], horizontal: false)
        #expect(upside.transformed[0].points == [CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200)])
        #expect(upside.transformed[0].box == EditRect(left: 100, top: 190, right: 300, bottom: 210))
    }

    @Test func aCornerHandleKeepsTheOppositeCornerAndShiftKeepsTheProportion() {
        let frame = CGRect(x: 100, y: 100, width: 200, height: 100)
        let free = ElementTransform.resized(
            frame, handle: .bottomRight, to: CGPoint(x: 500, y: 150), keepRatio: false)
        #expect(free == CGRect(x: 100, y: 100, width: 400, height: 50))
        let kept = ElementTransform.resized(frame, handle: .bottomRight, to: CGPoint(x: 500, y: 150), keepRatio: true)
        #expect(kept == CGRect(x: 100, y: 100, width: 400, height: 200))
        let topLeft = ElementTransform.resized(frame, handle: .topLeft, to: CGPoint(x: 0, y: 50), keepRatio: true)
        #expect(topLeft == CGRect(x: 0, y: 50, width: 300, height: 150))
        let side = ElementTransform.resized(frame, handle: .right, to: CGPoint(x: 700, y: 999), keepRatio: true)
        #expect(side == CGRect(x: 100, y: 0, width: 600, height: 300))
    }

    @Test func aHandleDraggedPastTheOppositeSideStopsAtTheSmallestSide() {
        let frame = CGRect(x: 100, y: 100, width: 200, height: 100)
        let folded = ElementTransform.resized(frame, handle: .left, to: CGPoint(x: 900, y: 0), keepRatio: false)
        #expect(folded == CGRect(x: 300 - ElementTransform.smallestSide, y: 100, width: ElementTransform.smallestSide, height: 100))
    }

    @Test func aTurnNearTheEdgeIsMovedBackOnThePageAndOneTooLargeIsRefused() throws {
        let wide = MovedElement(
            record: 0, box: EditRect(left: 0, top: 0, right: 1800, bottom: 20),
            points: [CGPoint(x: 0, y: 10), CGPoint(x: 1800, y: 10)], isArea: false)
        let turn = ElementTransform.quarterTurn(page: 0, elements: [wide], clockwise: true)
        #expect(turn.transformedFrame.minY < 0)
        let kept = try #require(turn.clamped(width: 1920, height: 2560))
        #expect(kept.transformedFrame.minY == 0 && kept.transformedFrame.minX >= 0)
        #expect(kept.transformed[0].points.allSatisfy { $0.y >= 0 && $0.y <= 2560 })
        #expect(turn.clamped(width: 1920, height: 1000) == nil)
    }

    @Test func aTextBoxResizesButNeverTurnsAndAPictureWaitsForItsFile() {
        #expect(ElementTransform.flip(page: 0, elements: [Self.textBox], horizontal: true).refusal == .textBoxTurned)
        #expect(
            ElementTransform.resize(page: 0, elements: [Self.textBox], to: CGRect(x: 0, y: 0, width: 50, height: 20))
                .refusal == nil)
        let turn = ElementTransform.quarterTurn(page: 0, elements: [Self.picture], clockwise: true)
        #expect(turn.refusal == .pictureWithoutFile)
        #expect(turn.with(pictureFiles: [3: URL(filePath: "/tmp/p.png")]).refusal == nil)
        #expect(NoteEdit.transformElements(turn).apply(to: ["a"]) == nil)
    }

    @Test func anEmptyTransformFitsNoNoteAndItsUndoIsTheBackup() {
        let none = ElementTransform(page: 0, elements: [Self.stroke], matrix: .identity)
        #expect(none.isEmpty && NoteEdit.transformElements(none).apply(to: ["a"]) == nil)
        let turn = ElementTransform.quarterTurn(page: 0, elements: [Self.stroke], clockwise: true)
        let edit = NoteEdit.transformElements(turn)
        #expect(edit.apply(to: ["a"]) == ["a"] && edit.inverse == .restoreElements(page: 0) && edit.undoneByBackup)
    }

    @Test func strokesGoFirstInCallsOf64ThenTextBoxesThenPicturesHighestFirst() throws {
        let strokes = (0..<70).map { index in
            MovedElement(
                record: 100 + index, box: EditRect(left: 10, top: 10, right: 20, bottom: 20),
                points: [CGPoint(x: 10, y: 10), CGPoint(x: 20, y: 20)], isArea: false)
        }
        let low = MovedElement(record: 1, box: EditRect(left: 0, top: 0, right: 10, bottom: 10), isPicture: true)
        let files = [1: URL(filePath: "/tmp/low.png"), 3: URL(filePath: "/tmp/high.png")]
        let resize = ElementTransform.resize(
            page: 2, elements: strokes + [low, Self.picture, Self.textBox],
            to: CGRect(x: 0, y: 0, width: 250, height: 205)
        ).with(pictureFiles: files)
        let targets = resize.targets
        guard case .strokes(let first, _) = targets[0], case .strokes(let second, _) = targets[1] else {
            Issue.record("strokes do not come first")
            return
        }
        #expect(first.count == 64 && second.count == 6 && first[0] == 101)
        guard case .textBox(6, _) = targets[2], case .picture(4, _, let high) = targets[3],
            case .picture(2, _, let lowFile) = targets[4]
        else {
            Issue.record("the text box and the pictures are out of order: \(targets)")
            return
        }
        #expect(high == files[3] && lowFile == files[1] && targets.count == 5)
    }

    @Test func theHelperGetsOneMatrixForTheStrokesAndAFileForEachPicture() throws {
        let turn = ElementTransform.quarterTurn(page: 1, elements: [Self.stroke, Self.picture], clockwise: true)
            .with(pictureFiles: [3: URL(filePath: "/tmp/turned.png")])
        let operation = try #require(
            TabletOperation(.transformElements(turn), note: "/storage/emulated/0/Note/a.note", baseHash: "h"))
        #expect(operation.route == .tablet && operation.editedPages == [1])
        let json = try #require(
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(operation.helperOperations)) as? [[String: Any]])
        #expect(json.count == 2)
        #expect(json[0]["op"] as? String == "transformElements" && json[0]["nums"] as? [Int] == [1])
        #expect(json[0]["matrix"] as? [Double] == turn.matrix.values)
        #expect(json[1]["op"] as? String == "modifyElements" && json[1]["num"] as? Int == 4)
        #expect(json[1]["file"] as? String == "/tmp/turned.png")
        let refused = ElementTransform.quarterTurn(page: 1, elements: [Self.picture], clockwise: true)
        #expect(TabletOperation(.transformElements(refused), note: "n", baseHash: "h") == nil)
    }
}
