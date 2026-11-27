import Foundation
import NoteEditorKit
import Testing

/// The shapes Insert › Shape draws by drag (#350), as the tablet's geometry elements (#463).
@Suite struct ShapeDrawingTests {
    static let page = CGSize(width: 1404, height: 1872)

    private func draw(_ kind: ShapeKind, _ start: CGPoint, _ end: CGPoint, shift: Bool = false) -> GeometryShape {
        ShapeDrawing.shape(kind, from: start, to: end, constrained: shift, page: Self.page)
    }

    @Test func eachBoxShapeHasItsCorners() {
        let start = CGPoint(x: 100, y: 200)
        let end = CGPoint(x: 300, y: 400)
        #expect(
            draw(.rectangle, start, end)
                == .polygon([
                    CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200), CGPoint(x: 300, y: 400), CGPoint(x: 100, y: 400),
                ]))
        #expect(
            draw(.triangle, start, end)
                == .polygon([CGPoint(x: 200, y: 200), CGPoint(x: 300, y: 400), CGPoint(x: 100, y: 400)]))
        #expect(
            draw(.diamond, start, end)
                == .polygon([
                    CGPoint(x: 200, y: 200), CGPoint(x: 300, y: 300), CGPoint(x: 200, y: 400), CGPoint(x: 100, y: 300),
                ]))
        #expect(
            draw(.ellipse, start, CGPoint(x: 500, y: 400))
                == .ellipse(center: CGPoint(x: 300, y: 300), horizontal: 200, vertical: 100))
    }

    @Test func aRoundedRectangleKeepsItsBoxAndStaysUnderThePolygonLimit() {
        guard case .polygon(let corners) = draw(.roundedRectangle, CGPoint(x: 100, y: 200), CGPoint(x: 500, y: 400))
        else {
            Issue.record("not a polygon")
            return
        }
        #expect(corners.count < GeometryShape.maxPolygonPoints)
        #expect(EditRect(around: corners) == EditRect(left: 100, top: 200, right: 500, bottom: 400))
        // A corner is cut: the box's own corner is not on the outline.
        #expect(!corners.contains(CGPoint(x: 100, y: 200)))
    }

    @Test func aLineAndAnArrowRunFromTheDragsStartToItsEnd() {
        let start = CGPoint(x: 600, y: 300)
        let end = CGPoint(x: 200, y: 300)
        #expect(draw(.line, start, end) == .line(from: start, to: end))
        guard case .polygon(let points) = draw(.arrow, start, end) else {
            Issue.record("not a polygon")
            return
        }
        #expect(points.first == start && points[1] == end && points.last == end)
        // The barbs point back along the shaft, one each side of it.
        #expect(points[2].x > end.x && points[3].x > end.x && points[2].y != points[3].y)
    }

    @Test func aDragOffThePageIsKeptOnIt() {
        let shape = draw(.rectangle, CGPoint(x: 1300, y: 1800), CGPoint(x: 1600, y: 2000))
        #expect(shape.fits(on: Self.page))
        #expect(shape.box.right == 1404 && shape.box.bottom == 1872)
        #expect(
            draw(.line, CGPoint(x: -20, y: 10), CGPoint(x: 1500, y: 10))
                == .line(from: CGPoint(x: 0, y: 10), to: CGPoint(x: 1404, y: 10)))
    }

    @Test func aFlatDragStillGivesAShape() {
        let shape = draw(.rectangle, CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200))
        #expect(shape.box.bottom - shape.box.top == Int(ShapeDrawing.minimumSide))
        #expect(draw(.line, CGPoint(x: 100, y: 200), CGPoint(x: 100, y: 200)).fits(on: Self.page))
    }

    @Test func shiftKeepsASquareACircleAndAStraightLine() {
        #expect(
            draw(.ellipse, CGPoint(x: 100, y: 100), CGPoint(x: 300, y: 160), shift: true)
                == .ellipse(center: CGPoint(x: 200, y: 200), horizontal: 100, vertical: 100))
        let box = draw(.rectangle, CGPoint(x: 400, y: 400), CGPoint(x: 300, y: 350), shift: true).box
        #expect(box == EditRect(left: 300, top: 300, right: 400, bottom: 400))
        guard case .line(_, let to) = draw(.line, CGPoint(x: 100, y: 100), CGPoint(x: 300, y: 120), shift: true)
        else {
            Issue.record("not a line")
            return
        }
        #expect(abs(to.y - 100) < 0.001)
    }

    @Test(arguments: ShapeKind.allCases)
    func aClickPutsTheDefaultShapeOnThePageAtACornerToo(kind: ShapeKind) {
        for centre in [CGPoint(x: 702, y: 936), CGPoint(x: 0, y: 0), CGPoint(x: 1404, y: 1872)] {
            let shape = ShapeDrawing.shape(kind, centredOn: centre, page: Self.page)
            #expect(shape.fits(on: Self.page))
            #expect(shape.box.right - shape.box.left >= Int(Self.page.width / 5) - 1)
        }
    }

    @Test func thePreviewCoversTheShapeAndItsLineInBlack() throws {
        let shape = draw(.line, CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 200))
        let preview = try #require(ShapeDrawing.preview(shape))
        #expect(preview.rect == EditRect(left: 97, top: 197, right: 303, bottom: 203))
        #expect(preview.image.width == 206 && preview.image.height == 6)
    }

    @Test func aShapeEditIsOneGeometryInsertUndoneByItsBackup() throws {
        let shape = draw(.ellipse, CGPoint(x: 100, y: 200), CGPoint(x: 500, y: 400))
        let edit = NoteEdit.insertShape(page: 1, shape: shape, penColor: .black, penWidth: ShapeDrawing.penWidth)
        #expect(edit.inverse == .revertInsert(page: 1))
        #expect(edit.undoneByBackup)
        #expect(edit.apply(to: ["P1", "P2"]) == ["P1", "P2"])
        #expect(edit.apply(to: ["P1"]) == nil)
        let operation = try #require(TabletOperation(edit, note: "Note/A.note", baseHash: "h"))
        #expect(operation.route == .tablet && operation.page == 1)
        #expect(
            operation.helperOperations == [
                .insertElements(
                    page: 1, elements: [.geometry(shape, penColor: .black, penWidth: ShapeDrawing.penWidth)])
            ])
        #expect(operation.bounds == shape.box)
    }

    @Test(arguments: ShapeKind.allCases)
    func everyDragTheHelperTakes(kind: ShapeKind) {
        for (start, end) in [
            (CGPoint(x: 5, y: 5), CGPoint(x: 1399, y: 1867)), (CGPoint(x: 1399, y: 3), CGPoint(x: 2, y: 2)),
            (CGPoint(x: 0, y: 0), CGPoint(x: 0, y: 0)),
        ] {
            #expect(draw(kind, start, end).fits(on: Self.page))
            #expect(draw(kind, start, end, shift: true).fits(on: Self.page))
        }
    }
}
