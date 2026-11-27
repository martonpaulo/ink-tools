import Foundation
import Testing

@testable import NoteFormat

/// Page templates (#308): the background layer draws under the ink, for both kinds.
///
/// - Built in: `Fixtures/templates.note` is a test note the agent made on the tablet under
///   `Note/Tests/` (`inkctl note new`, `note insert-page style_5mm_dots` and
///   `style_8mm_ruled_line`, `ink write` on the dots page), each page beside the tablet's PNG from
///   `inkctl note png`; `FixtureTests` compares them.
/// - Custom: `inkctl note insert-page` takes only system templates, so `Fixtures/custom-template.note`
///   is the synthetic note `note()` builds, never an owner note: one Manta page whose `user_`
///   style stores `custom-template-background.png` as its background, with ink over it.
///   `custom-template-p1.png` is supernote-tool 0.7.3's PNG of it:
///   `supernote-tool convert -t png custom-template.note custom-template-p1.png`.
@Suite struct TemplateTests {
    static let width = 1920
    static let height = 2560
    static let style = "user_test_template"
    /// A black bar of ink over the template's grey header band.
    static let ink = (x: 300..<1100, y: 300..<400)
    /// Below this grey a pixel is a mark: the ruled template's lines are a light grey.
    static let markGrey: UInt8 = 240

    static func inkPixels() -> [UInt8] {
        var pixels = [UInt8](repeating: RattaRLE.Grey.transparent, count: width * height)
        for row in ink.y { for column in ink.x { pixels[row * width + column] = RattaRLE.Grey.black } }
        return pixels
    }

    static func note() throws -> [UInt8] {
        var builder = NoteBuilder(version: "20260016")
        let header = builder.metadata([("FILE_TYPE", "NOTE"), ("APPLY_EQUIPMENT", "N5")])
        let ink = builder.block(RattaRLE.encode(inkPixels(), greyscale: true))
        let background = builder.block([UInt8](try FixtureTests.fixture("custom-template-background.png")))
        let main = builder.metadata([
            ("LAYERTYPE", "NOTE"), ("LAYERPROTOCOL", "RATTA_RLE"), ("LAYERNAME", "MAINLAYER"),
            ("LAYERBITMAP", String(ink)),
        ])
        let back = builder.metadata([
            ("LAYERTYPE", "NOTE"), ("LAYERPROTOCOL", "RATTA_RLE"), ("LAYERNAME", "BGLAYER"),
            ("LAYERBITMAP", String(background)),
        ])
        let info =
            ##"[{"layerId"#0,"name"#"Main layer","isBackgroundLayer"#false,"isVisible"#true},{"layerId"#-1,"name"#"Background layer","isBackgroundLayer"#true,"isVisible"#true}]"##
        let page = builder.metadata([
            ("PAGEID", "P1"), ("PAGESTYLE", style), ("ORIENTATION", "1000"),
            ("MAINLAYER", String(main)), ("LAYER1", "0"), ("LAYER2", "0"), ("LAYER3", "0"), ("BGLAYER", String(back)),
            ("LAYERINFO", info), ("LAYERSEQ", "MAINLAYER,BGLAYER"),
        ])
        return builder.finish(header: header, pages: [page])
    }

    @Test func testTheFixtureIsTheBuiltNote() throws {
        #expect([UInt8](try FixtureTests.fixture("custom-template.note")) == (try Self.note()))
    }

    @Test func testACustomTemplateDrawsUnderTheInkAsSupernotelib() throws {
        let file = try NoteFile(data: try FixtureTests.fixture("custom-template.note"))
        let drawn = try file.render(page: 0)
        #expect(drawn.templateFailure == nil)
        let background = try PageBitmap(imageData: try FixtureTests.fixture("custom-template-background.png"))
        let inkOffsets = Set(Self.ink.y.flatMap { row in Self.ink.x.map { row * Self.width + $0 } })
        #expect(inkOffsets.allSatisfy { drawn.pixels[$0] == RattaRLE.Grey.black })
        let outside = drawn.pixels.indices.filter { !inkOffsets.contains($0) }
        #expect(outside.allSatisfy { drawn.pixels[$0] == background.pixels[$0] })
        let reference = try PageBitmap(imageData: try FixtureTests.fixture("custom-template-p1.png"))
        let share = try #require(drawn.differingShare(from: reference, threshold: FixtureTests.threshold))
        #expect(share <= FixtureTests.tolerance, "\(share * 100) % differ")
    }

    @Test func testABuiltInTemplateDrawsUnderTheInk() throws {
        let file = try NoteFile(data: try FixtureTests.fixture("templates.note"))
        #expect(file.pages.map(\.style) == ["style_white_a5x2", "style_5mm_dots_a5x2", "style_8mm_ruled_line_a5x2"])
        let white = try file.render(page: 0)
        for page in 1...2 {
            let drawn = try file.render(page: page)
            #expect(drawn.templateFailure == nil)
            // The template adds dark pixels the white page does not have.
            let marks = zip(drawn.pixels, white.pixels).filter {
                $0.0 < Self.markGrey && $0.1 == RattaRLE.Grey.transparent
            }.count
            #expect(marks > 1000, "page \(page + 1): \(marks) template pixels")
        }
    }
}
