import Foundation
import Testing

@testable import NoteFormat

/// The tablet's recognition of a page (#321). The note is `content.note` with a recognition
/// block added to one page, in the layout measured on Manta notes; a note made on the tablet with
/// recognition on joins the fixtures in the device round.
@Suite struct RecognitionTests {
    /// Two words, a space with no box between them, and an element of another type.
    static let json = """
        {"type": "Raw Content", "elements": [
          {"type": "Text", "label": "Olá mundo", "words": [
            {"label": "Olá", "bounding-box": {"x": 10.0, "y": 20.0, "width": 12.7, "height": 5.08}},
            {"label": " "},
            {"label": "mundo", "bounding-box": {"x": 25.4, "y": 20.0, "width": 20.32, "height": 5.08}}
          ]},
          {"type": "Raw Content"}
        ]}
        """

    /// `content.note` with `recognition` as page `page`'s recognition block, status 1.
    static func note(recognition: [UInt8], page: Int) throws -> NoteFile {
        let file = try NoteFile(data: try FixtureTests.fixture("content.note"))
        let addresses = try NoteWriter.pageAddresses(file)
        var bytes = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        let textAddress = bytes.count
        bytes += NoteWriter.lengthPrefixed(recognition)
        let raw = String(decoding: try file.block(at: addresses[page]), as: UTF8.self)
            .replacingOccurrences(of: "<RECOGNSTATUS:0>", with: "<RECOGNSTATUS:1>")
            .replacingOccurrences(of: "<RECOGNTEXT:0>", with: "<RECOGNTEXT:\(textAddress)>")
        let pageAddress = bytes.count
        bytes += NoteWriter.lengthPrefixed(Array(raw.utf8))
        let pairs = file.footer.pairs.map { pair in
            pair.key == "PAGE\(page + 1)" ? Metadata.Pair(key: pair.key, value: String(pageAddress)) : pair
        }
        return try NoteFile(bytes: try NoteWriter.withFooter(file, prefix: bytes, pairs: pairs))
    }

    @Test func testTheWordsAndTheirBoxesDecodeInPagePixels() throws {
        let note = try Self.note(recognition: Array(Data(Self.json.utf8).base64EncodedData()), page: 1)
        let words = try note.recognizedWords(page: 1)
        // 300 dpi: 25.4 mm is 300 pixels.
        #expect(
            words == [
                RecognizedWord(text: "Olá", box: PageRect(x: 118, y: 236, width: 150, height: 60)),
                RecognizedWord(text: "mundo", box: PageRect(x: 300, y: 236, width: 240, height: 60)),
            ])
    }

    @Test func testAPageWithoutRecognitionHasNoWords() throws {
        let note = try Self.note(recognition: Array(Data(Self.json.utf8).base64EncodedData()), page: 1)
        #expect(try note.recognizedWords(page: 0).isEmpty)
        #expect(try note.recognizedWords(page: 3).isEmpty)
    }

    @Test func testABlockThatIsNotBase64Fails() throws {
        let note = try Self.note(recognition: Array("not base64 at all!".utf8), page: 2)
        #expect(throws: NoteFormatError.badRecognition(page: 2, reason: "it is not base64")) {
            try note.recognizedWords(page: 2)
        }
    }

    @Test func testJSONOfAnotherShapeFails() throws {
        let note = try Self.note(recognition: Array(Data("{\"words\": 1}".utf8).base64EncodedData()), page: 0)
        #expect(throws: NoteFormatError.badRecognition(page: 0, reason: "its JSON does not decode")) {
            try note.recognizedWords(page: 0)
        }
    }

    @Test func testAPageOutsideTheNoteIsRefused() throws {
        let note = try NoteFile(data: try FixtureTests.fixture("content.note"))
        #expect(throws: NoteFormatError.badPage(9)) { try note.recognizedWords(page: 9) }
    }
}
