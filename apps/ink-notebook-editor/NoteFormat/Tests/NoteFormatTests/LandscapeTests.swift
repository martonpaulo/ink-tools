import Foundation
import Testing
@testable import NoteFormat

/// Landscape pages (#291): a page with `ORIENTATION` 1090 or 1270 stores its raster with the
/// width and height swapped, and draws wide, as supernotelib's `RattaRleDecoder` and
/// `_flatten_layers` do; supernotelib turns no `RATTA_RLE` bitmap.
///
/// `Fixtures/landscape.note` is the synthetic note `note()` builds, never an owner note: two Manta
/// pages, 1090 and 1270, each the raster `pixels()` draws. `landscape-p<N>.png` is supernote-tool
/// 0.7.3's PNG of each page: `supernote-tool convert -t png -a landscape.note landscape.png`
/// writes them as `landscape_0.png` and `landscape_1.png`.
@Suite struct LandscapeTests {
    static let orientations = ["1090", "1270"]
    /// The Manta page, landscape: its portrait height wide.
    static let width = 2560
    static let height = 1920
    /// The bar at the top left, where a title stands: on a page drawn turned it would be at a side.
    static let bar = (x: 120..<1320, y: 120..<220)

    /// A wide bar at the top left, lines of dark grey below it, and a square at the bottom right.
    static func pixels() -> [UInt8] {
        var pixels = [UInt8](repeating: RattaRLE.Grey.transparent, count: width * height)
        func fill(_ columns: Range<Int>, _ rows: Range<Int>, _ grey: UInt8) {
            for row in rows { for column in columns { pixels[row * width + column] = grey } }
        }
        fill(bar.x, bar.y, RattaRLE.Grey.black)
        for line in 0..<8 {
            let top = 400 + line * 180
            fill(120..<(2440 - (line % 3) * 400), top..<(top + 8), RattaRLE.Grey.darkGray)
        }
        fill(2300..<2440, 1700..<1840, RattaRLE.Grey.black)
        return pixels
    }

    static func note() -> [UInt8] {
        var builder = NoteBuilder(version: "20260016")
        let header = builder.metadata([("FILE_TYPE", "NOTE"), ("APPLY_EQUIPMENT", "N5")])
        let bitmap = builder.block(RattaRLE.encode(pixels(), greyscale: true))
        let info = ##"[{"layerId"#0,"name"#"Main layer","isBackgroundLayer"#false,"isVisible"#true}]"##
        var pages: [Int] = []
        for (index, orientation) in orientations.enumerated() {
            let layer = builder.metadata([
                ("LAYERTYPE", "NOTE"), ("LAYERPROTOCOL", "RATTA_RLE"), ("LAYERNAME", "MAINLAYER"),
                ("LAYERBITMAP", String(bitmap)),
            ])
            pages.append(builder.metadata([
                ("PAGEID", "P\(index + 1)"), ("PAGESTYLE", "style_white"), ("ORIENTATION", orientation),
                // supernotelib reads all five layer keys; 0 is a layer with nothing.
                ("MAINLAYER", String(layer)), ("LAYER1", "0"), ("LAYER2", "0"), ("LAYER3", "0"), ("BGLAYER", "0"),
                ("LAYERINFO", info), ("LAYERSEQ", "MAINLAYER"),
            ]))
        }
        return builder.finish(header: header, pages: pages)
    }

    @Test func testTheFixtureIsTheBuiltNote() throws {
        #expect([UInt8](try FixtureTests.fixture("landscape.note")) == Self.note())
    }

    @Test(arguments: [1, 2])
    func testALandscapePageDrawsWideAndUprightAsSupernotelib(page: Int) throws {
        let file = try NoteFile(data: try FixtureTests.fixture("landscape.note"))
        #expect(file.pages[page - 1].metadata["ORIENTATION"] == Self.orientations[page - 1])
        #expect(file.pages[page - 1].isHorizontal)
        let drawn = try file.render(page: page - 1)
        #expect(drawn.width == Self.width)
        #expect(drawn.height == Self.height)
        let bar = Self.bar.y.flatMap { row in Self.bar.x.map { row * Self.width + $0 } }
        #expect(bar.allSatisfy { drawn.pixels[$0] == RattaRLE.Grey.black })
        let reference = try PageBitmap(imageData: try FixtureTests.fixture("landscape-p\(page).png"))
        #expect(drawn.differingShare(from: reference, threshold: 0) == 0)
    }

    @Test func testAPortraitPageKeepsItsSize() throws {
        let file = try NoteFile(data: try FixtureTests.fixture("content.note"))
        #expect(file.pages.allSatisfy { !$0.isHorizontal })
        let drawn = try file.render(page: 0)
        #expect((drawn.width, drawn.height) == (1920, 2560))
    }
}
