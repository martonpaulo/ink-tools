import Foundation
import Testing
@testable import NoteFormat

/// What the editor draws while an add or a delete of a page is on its way (#329).
@Suite struct NotePreviewTests {
    static func ids(_ file: NoteFile) -> [String] { file.pages.map { $0.metadata["PAGEID"] ?? "" } }

    /// Three pages P1 to P3, with a title on page 3 and a keyword on page 1.
    static func titled() throws -> NoteFile {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let pages = (1...3).map { builder.metadata([("PAGEID", "P\($0)")]) }
        let footer = builder.metadata(
            [("PAGE1", String(pages[0])), ("PAGE2", String(pages[1])), ("PAGE3", String(pages[2])),
             ("TITLE_00030120", "3"), ("KEYWORD_00010400", "9"), ("FILE_FEATURE", String(header))])
        builder.bytes += NoteWriter.tailMarker + NoteWriter.word(footer)
        return try NoteFile(bytes: builder.bytes)
    }

    @Test(arguments: [0, 2, 4])
    func testAnAddedPageTakesItsPlaceAndKeepsEveryOtherPage(at index: Int) throws {
        let file = try NoteWriterTests.content()
        let added = try NotePreview.insertingPage(file, at: index, like: 1)
        var expected = Self.ids(file)
        expected.insert("\(expected[1])-added-\(index)", at: index)
        #expect(Self.ids(added) == expected)
    }

    @Test func testAnAddedPageDrawsItsTemplateAndNoInk() throws {
        let file = try NoteWriterTests.content()
        // Page 1 holds text and a picture over a white template.
        let added = try NotePreview.insertingPage(file, at: 1, like: 0)
        let drawn = try added.render(page: 1)
        let template = try file.render(page: 0, template: true)
        let ink = try file.render(page: 0, template: false)
        #expect(drawn.pixels.count == template.pixels.count)
        #expect(ink.pixels.contains { $0 < 128 })
        #expect(!drawn.pixels.contains { $0 < 128 })
        #expect(added.pages[1].metadata["TOTALPATH"] ?? "0" == "0")
    }

    @Test func testAnAddedPageOnATemplateNoPageUsesIsDrawnBlank() throws {
        let file = try NoteWriterTests.content()
        // Page 2 is on the 5 mm grid: kept, the lines show; not kept, the page is white (#451).
        let kept = try NotePreview.insertingPage(file, at: 1, like: 1).render(page: 1)
        let blank = try NotePreview.insertingPage(file, at: 1, like: 1, keepsTemplate: false).render(page: 1)
        #expect(kept.pixels.contains { $0 < 250 })
        #expect(!blank.pixels.contains { $0 < 250 })
        #expect(blank.pixels.count == kept.pixels.count)
    }

    @Test func testTitlesAndKeywordsKeepTheirPagesAroundAnAdd() throws {
        let added = try NotePreview.insertingPage(Self.titled(), at: 1, like: 0)
        #expect(added.footer["TITLE_00040120"] == "3")
        #expect(added.footer["KEYWORD_00010400"] == "9")
    }

    @Test func testARemovedPageTakesItsTitlesAndTheOthersMoveUp() throws {
        let removed = try NotePreview.removingPage(Self.titled(), at: 0)
        #expect(Self.ids(removed) == ["P2", "P3"])
        #expect(removed.footer["TITLE_00020120"] == "3")
        #expect(!removed.footer.pairs.contains { $0.key.hasPrefix("KEYWORD_") })
    }

    @Test func testTheLastPageAndPagesOutsideTheNoteAreRefused() throws {
        let file = try NoteWriterTests.content()
        let one = try NotePreview.removingPage(
            NotePreview.removingPage(NotePreview.removingPage(file, at: 0), at: 0), at: 0)
        #expect(one.pages.count == 1)
        #expect(throws: NoteFormatError.badPage(0)) { try NotePreview.removingPage(one, at: 0) }
        #expect(throws: NoteFormatError.badPage(5)) { try NotePreview.insertingPage(file, at: 5, like: 0) }
        #expect(throws: NoteFormatError.badPage(4)) { try NotePreview.insertingPage(file, at: 0, like: 4) }
    }
}
