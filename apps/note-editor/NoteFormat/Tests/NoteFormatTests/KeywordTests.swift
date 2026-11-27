import Foundation
import Testing

@testable import NoteFormat

/// The note's keywords (#346), from `keywords-tablet.note`, made on the Manta on 2026-11-27: on
/// page 1, «plan» and «todo» typed in the keyword dialog and «n» from the lasso over written ink;
/// on page 2, «idea» from the lasso.
@Suite struct KeywordTests {
    static func note() throws -> NoteFile {
        try NoteFile(data: try FixtureTests.fixture("keywords-tablet.note"))
    }

    @Test func everyKeywordReadsWithItsPageAndTextInTheFootersOrder() throws {
        let keywords = try Self.note().keywords()
        #expect(keywords.map(\.page) == [0, 0, 0, 1])
        #expect(keywords.map(\.text) == ["plan", "todo", "n", "idea"])
    }

    @Test func aLassoedKeywordKeepsItsBoxAndATypedOneHasNone() throws {
        let keywords = try Self.note().keywords()
        #expect(keywords[0].box == nil && keywords[1].box == nil)
        #expect(keywords[2].box == PageRect(x: 478, y: 441, width: 70, height: 75))
        #expect(keywords[3].box == PageRect(x: 398, y: 793, width: 256, height: 123))
    }

    @Test func aNoteWithNoKeywordHasNone() throws {
        #expect(try NoteFile(data: try FixtureTests.fixture("content.note")).keywords().isEmpty)
    }

    @Test func aKeywordWhoseTextIsMissingFailsTheList() throws {
        let file = try Self.note()
        var bytes = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        let block = bytes.count
        bytes += NoteWriter.lengthPrefixed(Array("<KEYWORDPAGE:0><KEYWORDRECT:0,0,0,0>".utf8))
        let pairs = file.footer.pairs + [Metadata.Pair(key: "KEYWORD_00010000", value: String(block))]
        let broken = try NoteFile(bytes: try NoteWriter.withFooter(file, prefix: bytes, pairs: pairs))
        #expect(throws: NoteFormatError.self) { try broken.keywords() }
    }
}
