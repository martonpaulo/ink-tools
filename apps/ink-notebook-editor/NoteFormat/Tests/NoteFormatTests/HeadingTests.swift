import Foundation
import Testing

@testable import NoteFormat

/// The note's Headings (#331). Most notes are `content.note` with Heading blocks added in the
/// layout read on a Manta note; `headings-tablet.note` was made on the tablet: four lines of
/// `inkctl ink write`, each given one of the four Heading styles with the lasso's Heading button.
@Suite struct HeadingTests {
    struct Made {
        let page: Int
        let level: Int
        let rect: PageRect
    }

    /// `content.note` with one Heading per `made`, each picture a black square in its top left
    /// corner on transparent.
    static func note(_ made: [Made], footerKey: (Made) -> String = Self.key) throws -> NoteFile {
        let file = try NoteFile(data: try FixtureTests.fixture("content.note"))
        var bytes = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        var pairs = file.footer.pairs
        for heading in made {
            var pixels = [UInt8](repeating: RattaRLE.Grey.transparent, count: heading.rect.width * heading.rect.height)
            for row in 0..<10 {
                for column in 0..<10 { pixels[row * heading.rect.width + column] = RattaRLE.Grey.black }
            }
            let bitmap = bytes.count
            bytes += NoteWriter.lengthPrefixed(RattaRLE.encode(pixels, greyscale: file.storesGreyscale))
            let rect = "\(heading.rect.x),\(heading.rect.y),\(heading.rect.width),\(heading.rect.height)"
            let block = bytes.count
            bytes += NoteWriter.lengthPrefixed(
                NoteWriter.text([
                    .init(key: "TITLESEQNO", value: "0"), .init(key: "TITLELEVEL", value: "1"),
                    .init(key: "TITLERECT", value: rect), .init(key: "TITLERECTORI", value: rect),
                    .init(key: "TITLEBITMAP", value: String(bitmap)), .init(key: "TITLEPROTOCOL", value: "RATTA_RLE"),
                    .init(key: "TITLESTYLE", value: Registry.NotefileFormatVersions.headingStyles[heading.level - 1]),
                ]))
            pairs.append(.init(key: footerKey(heading), value: String(block)))
        }
        return try NoteFile(bytes: try NoteWriter.withFooter(file, prefix: bytes, pairs: pairs))
    }

    /// The footer key: the page from 1 in four digits, then the top and left in four digits each.
    static func key(_ made: Made) -> String {
        String(format: "TITLE_%04d%04d%04d", made.page + 1, made.rect.y, made.rect.x)
    }

    @Test func testHeadingsDecodeByPageThenFromTheTop() throws {
        let note = try Self.note([
            Made(page: 2, level: 1, rect: PageRect(x: 100, y: 300, width: 400, height: 80)),
            Made(page: 0, level: 2, rect: PageRect(x: 120, y: 900, width: 300, height: 60)),
            Made(page: 0, level: 1, rect: PageRect(x: 100, y: 200, width: 500, height: 90)),
        ])
        let headings = try note.headings()
        #expect(headings.map(\.page) == [0, 0, 2])
        #expect(headings.map(\.level) == [1, 2, 1])
        #expect(headings[0].box == PageRect(x: 100, y: 200, width: 500, height: 90))
    }

    @Test func testAHeadingsPictureIsAsLargeAsItsBox() throws {
        let note = try Self.note([Made(page: 1, level: 3, rect: PageRect(x: 50, y: 60, width: 200, height: 40))])
        let image = try note.image(of: try #require(try note.headings().first))
        #expect(image.width == 200 && image.height == 40)
        #expect(image.pixels[0] == RattaRLE.Grey.black)
        #expect(image.pixels[199] == RattaRLE.Grey.transparent)
    }

    @Test func testANoteWithoutHeadingsHasNone() throws {
        #expect(try NoteFile(data: try FixtureTests.fixture("content.note")).headings().isEmpty)
    }

    @Test func testAHeadingOnAPageTheNoteLacksFails() throws {
        let note = try Self.note([Made(page: 7, level: 1, rect: PageRect(x: 1, y: 1, width: 20, height: 20))])
        #expect(throws: NoteFormatError.badPage(7)) { try note.headings() }
    }

    @Test func testAHeadingBlockWithoutItsStyleFails() throws {
        let file = try NoteFile(data: try FixtureTests.fixture("content.note"))
        var bytes = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        let block = bytes.count
        bytes += NoteWriter.lengthPrefixed(Array("<TITLERECT:1,1,20,20>".utf8))
        let pairs = file.footer.pairs + [.init(key: "TITLE_000100010001", value: String(block))]
        let note = try NoteFile(bytes: try NoteWriter.withFooter(file, prefix: bytes, pairs: pairs))
        #expect(throws: NoteFormatError.badHeading("the block at byte \(block) lacks its style, box or picture")) {
            try note.headings()
        }
    }

    /// The tablet writes `TITLELEVEL` 1 for every style; the level comes from the style. The lines
    /// «Level 1» to «Level 4» got, in this order, the styles black, dark grey, light grey and shadow.
    @Test func testTheTabletsFourHeadingStylesGiveFourLevels() throws {
        let note = try NoteFile(data: try FixtureTests.fixture("headings-tablet.note"))
        let headings = try note.headings()
        #expect(headings.map(\.page) == [0, 0, 0, 0])
        #expect(headings.map(\.level) == [1, 3, 4, 2])
        #expect(headings.map(\.box.y) == [293, 593, 893, 1193])
        for heading in headings {
            let image = try note.image(of: heading)
            #expect(image.width == heading.box.width && image.height == heading.box.height)
        }
        // A Heading's record in the page's elements is left out: only the four lines' strokes remain.
        let elements = try note.elements(page: 0)
        #expect(!elements.isEmpty && elements.allSatisfy { $0.kind == .stroke })
    }
}
