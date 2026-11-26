import CoreGraphics
import InkNotebookEditorKit
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
}
