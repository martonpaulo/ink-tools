import CoreGraphics
import Foundation
import NoteEditorKit
import Testing

/// Only Manta tones (#264): every pixel of an inserted picture is one of the 16 screen greys, and
/// a picture or a text box lands inside the page.
@Suite struct MantaGreysTests {
    @Test func everyGreyIsOneOfTheSixteen() {
        let rgba: [UInt8] = (0...255).flatMap { value in [UInt8(value), UInt8(255 - value), 40, 255] }
        let greys = MantaGreys.greys(rgba: rgba)
        #expect(greys.count == 256)
        #expect(greys.allSatisfy { MantaGreys.levels.contains($0) })
        #expect(MantaGreys.levels.count == 16 && MantaGreys.levels.first == 0 && MantaGreys.levels.last == 255)
    }

    @Test func colourIsItsLumaAndSeeThroughIsWhite() {
        // Pure red, green and blue by Rec. 709 luma, then a fully see-through pixel.
        let greys = MantaGreys.greys(rgba: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 12, 34, 56, 0])
        #expect(greys == [51, 187, 17, 255])
    }

    @Test(arguments: [
        (CGPoint(x: 960, y: 1280), EditRect(left: 480, top: 920, right: 1440, bottom: 1640)),
        (CGPoint(x: 0, y: 0), EditRect(left: 0, top: 0, right: 960, bottom: 720)),
        (CGPoint(x: 1920, y: 2560), EditRect(left: 960, top: 1840, right: 1920, bottom: 2560)),
    ])
    func aLargePictureStartsAtHalfThePageAndStaysOnIt(point: CGPoint, box: EditRect) {
        let page = CGSize(width: 1920, height: 2560)
        #expect(PicturePlacement.box(pixels: CGSize(width: 4000, height: 3000), centredOn: point, page: page) == box)
    }

    @Test func aSmallPictureKeepsItsSizeAndAChosenWidthIsKept() {
        let page = CGSize(width: 1920, height: 2560)
        let small = PicturePlacement.box(
            pixels: CGSize(width: 200, height: 100), centredOn: CGPoint(x: 500, y: 500), page: page)
        #expect(small == EditRect(left: 400, top: 450, right: 600, bottom: 550))
        let wide = PicturePlacement.box(
            pixels: CGSize(width: 200, height: 100), centredOn: CGPoint(x: 960, y: 500), page: page, width: 1920)
        #expect(wide == EditRect(left: 0, top: 20, right: 1920, bottom: 980))
    }

    @Test func aTextBoxGrowsWithItsLinesAndStaysOnThePage() {
        let page = CGSize(width: 1920, height: 2560)
        let box = TextBoxPlacement.box(lines: 3, fontSize: 40, centredOn: CGPoint(x: 960, y: 1280), page: page)
        #expect(box == EditRect(left: 384, top: 1190, right: 1536, bottom: 1370))
        let low = TextBoxPlacement.box(lines: 1, fontSize: 40, centredOn: CGPoint(x: 1900, y: 2550), page: page)
        #expect(low.right == 1920 && low.bottom == 2560)
    }
    @Test func anEditedTextBoxKeepsItsPlaceAndWidthAndStaysOnThePage() {
        let page = CGSize(width: 1920, height: 2560)
        let old = EditRect(left: 100, top: 200, right: 900, bottom: 260)
        #expect(
            TextBoxPlacement.box(editing: old, lines: 2, fontSize: 40, page: page)
                == EditRect(left: 100, top: 200, right: 900, bottom: 320))
        let low = EditRect(left: 100, top: 2500, right: 900, bottom: 2560)
        #expect(
            TextBoxPlacement.box(editing: low, lines: 3, fontSize: 40, page: page)
                == EditRect(left: 100, top: 2380, right: 900, bottom: 2560))
    }

    @Test func aTextBoxEditIsSentAsOneModifyWithItsTextAndFontSizeAndUndoneByItsBackup() throws {
        let element = MovedElement(record: 4, box: EditRect(left: 0, top: 0, right: 10, bottom: 10))
        let rect = EditRect(left: 0, top: 0, right: 10, bottom: 60)
        let edit = NoteEdit.editText(page: 1, element: element, text: "Hi", fontSize: 40, rect: rect)
        #expect(edit.inverse == .restoreElements(page: 1) && edit.undoneByBackup)
        #expect(
            NoteEdit.editText(page: 1, element: element, text: " ", fontSize: 40, rect: rect).apply(to: ["a", "b"])
                == nil)
        let operation = try #require(TabletOperation(edit, note: "/Note/a.note", baseHash: "h"))
        #expect(operation.editedPages == [1] && operation.bounds == rect)
        let json = try #require(
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(operation.helperOperations)) as? [[String: Any]]
        )
        #expect(json.count == 1 && json[0]["op"] as? String == "modifyElements" && json[0]["num"] as? Int == 5)
        #expect(json[0]["text"] as? String == "Hi" && json[0]["fontSize"] as? Int == 40 && json[0]["page"] as? Int == 1)
    }
}
