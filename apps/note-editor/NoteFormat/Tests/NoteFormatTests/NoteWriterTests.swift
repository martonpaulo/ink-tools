import Foundation
import Testing

@testable import NoteFormat

/// The Mac route of #263: each edit keeps the bytes it does not change.
@Suite struct NoteWriterTests {
    static func content() throws -> NoteFile {
        try NoteFile(data: try FixtureTests.fixture("content.note"))
    }

    @Test func testMovingAPageAndBackGivesTheSameBytes() throws {
        let file = try Self.content()
        let moved = try NoteFile(bytes: try NoteWriter.movePage(file, from: 1, to: 3))
        let back = try NoteWriter.movePage(moved, from: 3, to: 1)
        #expect(back == file.bytes)
    }

    @Test func testAMovedPageKeepsItsBlocks() throws {
        let file = try Self.content()
        let moved = try NoteFile(bytes: try NoteWriter.movePage(file, from: 1, to: 3))
        #expect(moved.pages.map(\.metadata) == [0, 2, 3, 1].map { file.pages[$0].metadata })
        // Every block before the footer is the old file's.
        let footer = NoteWriter.footerAddress(file)
        #expect(Array(moved.bytes[..<footer]) == Array(file.bytes[..<footer]))
    }

    @Test(arguments: [(0, 0), (0, 3), (3, 0), (2, 2)])
    func testEveryPageStaysOnce(from: Int, to: Int) throws {
        let file = try Self.content()
        let moved = try NoteFile(bytes: try NoteWriter.movePage(file, from: from, to: to))
        let ids = moved.pages.compactMap { $0.metadata["PAGEID"] }
        #expect(Set(ids) == Set(file.pages.compactMap { $0.metadata["PAGEID"] }))
        #expect(ids.count == file.pages.count)
        #expect(moved.pages[to].metadata == file.pages[from].metadata)
    }

    @Test func testAMoveOutsideTheNoteIsRefused() throws {
        let file = try Self.content()
        #expect(throws: NoteFormatError.badPage(4)) { try NoteWriter.movePage(file, from: 4, to: 0) }
        #expect(throws: NoteFormatError.badPage(-1)) { try NoteWriter.movePage(file, from: 0, to: -1) }
    }

    @Test func testATitleKeyFollowsItsPage() throws {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let pages = (1...3).map { builder.metadata([("PAGEID", "P\($0)")]) }
        let footer = builder.metadata(
            [
                ("PAGE1", String(pages[0])), ("PAGE2", String(pages[1])), ("PAGE3", String(pages[2])),
                ("TITLE_00030120", "3"), ("KEYWORD_00010400", "9"), ("FILE_FEATURE", String(header)),
            ])
        builder.bytes += NoteWriter.tailMarker + NoteWriter.word(footer)
        let file = try NoteFile(bytes: builder.bytes)
        let moved = try NoteFile(bytes: try NoteWriter.movePage(file, from: 2, to: 0))
        #expect(moved.pages.compactMap { $0.metadata["PAGEID"] } == ["P3", "P1", "P2"])
        #expect(moved.footer["TITLE_00010120"] == "3")
        #expect(moved.footer["KEYWORD_00020400"] == "9")
    }

    @Test func testTextIsDrawnIntoTheMainLayerOnly() throws {
        let file = try Self.content()
        let edited = try NoteFile(
            bytes: try NoteWriter.drawText(
                file, page: 1, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        let footer = NoteWriter.footerAddress(file)
        // Nothing is written over: the new blocks follow the old ones.
        #expect(Array(edited.bytes[..<footer]) == Array(file.bytes[..<footer]))
        for index in [0, 2, 3] { #expect(edited.pages[index] == file.pages[index]) }
        let background = { (note: NoteFile) in note.pages[1].layers.first { $0.name == "BGLAYER" }?.bitmapAddress }
        #expect(background(edited) == background(file))
        let drawn = try edited.render(page: 1).pixels
        let box = (100..<220).flatMap { row in (100..<400).map { row * 1920 + $0 } }
        #expect(box.contains { drawn[$0] == RattaRLE.Grey.black })
        #expect(edited.pages[1].metadata["PAGEID"] == file.pages[1].metadata["PAGEID"])
    }

    @Test func testAPictureIsDrawnIntoTheMainLayerOnly() throws {
        let file = try Self.content()
        let black = PageBitmap(width: 4, height: 4, pixels: [UInt8](repeating: 0, count: 16))
        let png = try #require(black.pngData())
        let rect = PageRect(x: 200, y: 300, width: 160, height: 80)
        let edited = try NoteFile(bytes: try NoteWriter.drawPicture(file, page: 2, imageData: png, in: rect))
        let footer = NoteWriter.footerAddress(file)
        #expect(Array(edited.bytes[..<footer]) == Array(file.bytes[..<footer]))
        for index in [0, 1, 3] { #expect(edited.pages[index] == file.pages[index]) }
        let drawn = try edited.render(page: 2).pixels
        let width = file.pageSize.width
        let inside = (rect.y..<(rect.y + rect.height)).flatMap { row in
            (rect.x..<(rect.x + rect.width)).map { row * width + $0 }
        }
        #expect(inside.allSatisfy { drawn[$0] == RattaRLE.Grey.black })
        // Outside the rectangle the page is as it was.
        let before = try file.render(page: 2).pixels
        let outside = Set(0..<drawn.count).subtracting(inside)
        #expect(outside.allSatisfy { drawn[$0] == before[$0] })
    }

    @Test func testAPictureOutsideTheNoteIsRefused() throws {
        let file = try Self.content()
        let png = try #require(PageBitmap(width: 1, height: 1, pixels: [0]).pngData())
        #expect(throws: NoteFormatError.badPage(4)) {
            try NoteWriter.drawPicture(file, page: 4, imageData: png, in: PageRect(x: 0, y: 0, width: 1, height: 1))
        }
    }
}

/// `note-tool diff`: which blocks of each page an edit kept (#263).
@Suite struct NoteDiffTests {
    @Test func testAMoveKeepsEveryPageBlock() throws {
        let file = try NoteWriterTests.content()
        let moved = try NoteFile(bytes: try NoteWriter.movePage(file, from: 1, to: 3))
        let lines = NoteDiff.lines(file, moved)
        #expect(lines.first == "pages: 4 -> 4")
        #expect(lines.contains { $0.hasPrefix("page 2 -> 4: metadata equal, MAINLAYER equal") })
        let pageLines = lines.filter { $0.hasPrefix("page ") }
        #expect(pageLines.count == 4)
        #expect(pageLines.allSatisfy { !$0.contains("changed") && !$0.contains("added") && !$0.contains("removed") })
    }

    @Test func testAnEditNamesTheChangedLayerOnly() throws {
        let file = try NoteWriterTests.content()
        let edited = try NoteFile(
            bytes: try NoteWriter.drawText(
                file, page: 1, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        let lines = NoteDiff.lines(file, edited)
        let page2 = try #require(lines.first { $0.hasPrefix("page 2 -> 2: ") })
        #expect(page2.contains("metadata changed"))
        #expect(page2.contains("MAINLAYER changed"))
        #expect(page2.contains("BGLAYER equal"))
        for number in [1, 3, 4] {
            let line = try #require(lines.first { $0.hasPrefix("page \(number) -> \(number): ") })
            #expect(!line.contains("changed"))
        }
    }

    @Test func testAPageMissingFromAfterIsNamed() throws {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let page = builder.metadata([("PAGEID", "P1")])
        let one = try NoteFile(bytes: builder.finish(header: header, pages: [page]))
        var other = NoteBuilder()
        let otherHeader = other.metadata([("FILE_TYPE", "NOTE")])
        let otherPage = other.metadata([("PAGEID", "P2")])
        let two = try NoteFile(bytes: other.finish(header: otherHeader, pages: [otherPage]))
        #expect(NoteDiff.lines(one, two) == ["pages: 1 -> 1", "page 1: not found in AFTER"])
    }
}

@Suite struct RattaRLEEncodeTests {
    @Test func testEveryRunLengthComesBack() throws {
        let runs: [(UInt8, Int)] = [
            (0x00, 1), (0xff, 128), (0xfe, 129), (0x00, 130), (0x9d, 16383), (0xff, 16384),
            (0x00, 16385), (0xc9, 40000), (0x30, 7), (0x50, 255),
        ]
        let pixels = runs.flatMap { repeatElement($0.0, count: $0.1) }
        let encoded = RattaRLE.encode(pixels, greyscale: true)
        let decoded = try RattaRLE.decode(encoded[...], width: pixels.count, height: 1, greyscale: true)
        #expect(decoded == pixels)
    }

    @Test func testAGreyThatIsAColourCodeComesBackAsANeighbour() throws {
        let pixels: [UInt8] = [0x61, 0x65, 0x80]
        let decoded = try RattaRLE.decode(
            RattaRLE.encode(pixels, greyscale: true)[...], width: 3, height: 1, greyscale: true)
        #expect(decoded[2] == 0x80)
        #expect(!RattaRLE.greyscaleCodes.keys.contains(decoded[0]))
        #expect(abs(Int(decoded[0]) - 0x61) <= 8)
    }

    @Test func testAFixtureLayerComesBack() throws {
        let file = try NoteWriterTests.content()
        let page = file.pages[1]
        let layer = try #require(page.layers.first { $0.name == "MAINLAYER" })
        let pixels = try file.layerPixels(layer, of: page, width: 1920, height: 2560)
        let again = try RattaRLE.decode(
            RattaRLE.encode(pixels, greyscale: file.storesGreyscale)[...], width: 1920, height: 2560,
            greyscale: file.storesGreyscale)
        #expect(again == pixels)
    }
}
