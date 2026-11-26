import CoreGraphics
import Foundation
import Testing
@testable import NoteFormat

/// The element records of a page, read-only (#324), from notes the tablet wrote:
/// `landscape-tablet.note` holds one line of pen strokes on a landscape page, `content.note` a
/// text box and a picture on page 1 and nothing on the others.
@Suite struct ElementTests {
    /// How far a stroke's box may lie from its ink in the tablet's PNG, in pixels.
    static let slack: CGFloat = 2
    /// The darkest grey that counts as ink.
    static let ink: UInt8 = 128

    static func note(_ name: String) throws -> NoteFile {
        try NoteFile(data: try FixtureTests.fixture("\(name).note"))
    }

    @Test func everyStrokeOfALandscapePageHoldsItsInkOnTheTabletsPage() throws {
        let elements = try Self.note("landscape-tablet").elements(page: 0)
        #expect(elements.count == 11)
        #expect(elements.allSatisfy { $0.kind == .stroke && $0.layer == 0 })
        let tablet = try PageBitmap(imageData: try FixtureTests.fixture("landscape-tablet-p1.png"))
        #expect(tablet.width == 2560 && tablet.height == 1920)
        for (number, element) in elements.enumerated() {
            // Its path lies in its box, and its box holds ink on the page the tablet drew.
            let box = element.bounds.insetBy(dx: -Self.slack, dy: -Self.slack)
            #expect(element.points.allSatisfy(box.contains), "stroke \(number + 1)")
            #expect(Self.inkBounds(tablet, in: element.bounds) != nil, "stroke \(number + 1) holds no ink")
        }
        // Together the boxes cover exactly the ink of the page, upright as the page is drawn (#291).
        let union = elements.map(\.bounds).reduce(CGRect.null) { $0.union($1) }
        let ink = try #require(Self.inkBounds(tablet, in: CGRect(x: 0, y: 0, width: 2560, height: 1920)))
        #expect(abs(union.minX - ink.minX) <= Self.slack && abs(union.maxX - ink.maxX) <= Self.slack)
        #expect(abs(union.minY - ink.minY) <= Self.slack && abs(union.maxY - ink.maxY) <= Self.slack)
    }

    @Test func aTextBoxAndAPictureKeepTheirFrames() throws {
        let note = try Self.note("content")
        let elements = try note.elements(page: 0)
        #expect(elements.map(\.kind) == [.textBox, .picture])
        // The text box the fixture inserted at 200, 200, 1200 x 54 (its page's DISABLE area), and
        // the picture at 720, 1120, 480 x 320, where the tablet's PNG draws it.
        Self.expect(elements[0].bounds, near: CGRect(x: 200, y: 200, width: 1200, height: 54))
        Self.expect(elements[1].bounds, near: CGRect(x: 720, y: 1120, width: 480, height: 320))
        let tablet = try PageBitmap(imageData: try FixtureTests.fixture("content-p1.png"))
        let picture = try #require(Self.inkBounds(tablet, in: elements[1].bounds))
        #expect(elements[1].bounds.insetBy(dx: -Self.slack, dy: -Self.slack).contains(picture))
        for page in 1..<note.pages.count {
            #expect(try note.elements(page: page).isEmpty)
        }
    }

    /// `elements-tablet.note`, made on the tablet (#324): two lines of `inkctl ink write` (23
    /// strokes), two text boxes from `inkctl note insert-text` and a 400 x 300 picture from
    /// `inkctl note insert-picture`, stored in the order they were made.
    @Test func everyKindOfATabletNoteReadsInItsOrder() throws {
        let elements = try Self.note("elements-tablet").elements(page: 0)
        #expect(elements.map(\.kind) == Array(repeating: .stroke, count: 23) + [.textBox, .picture, .textBox])
        #expect(elements.allSatisfy { $0.layer == 0 })
        // «hello world» at 200, 300 and «erase me» at 200, 1848, each about 108 and 62 pixels tall.
        let lines = elements.prefix(23).map(\.bounds).reduce(CGRect.null) { $0.union($1) }
        Self.expect(lines, near: CGRect(x: 198, y: 298, width: 646, height: 1612))
        Self.expect(elements[23].bounds, near: CGRect(x: 200, y: 600, width: 900, height: 54))
        Self.expect(elements[24].bounds, near: CGRect(x: 760, y: 1130, width: 400, height: 300))
        Self.expect(elements[25].bounds, near: CGRect(x: 200, y: 1300, width: 900, height: 54))
    }

    /// Each element names its place in the page's block, for the tablet's element number (#325):
    /// in order, and past a left-out Heading or eraser record.
    @Test func eachElementNamesItsRecord() throws {
        let elements = try Self.note("elements-tablet").elements(page: 0)
        #expect(elements.map(\.record) == Array(0..<26))
        let headed = try Self.note("headings-tablet")
        for page in headed.pages.indices {
            let records = try headed.elements(page: page).map(\.record)
            #expect(zip(records, records.dropFirst()).allSatisfy { $0 < $1 })
        }
    }

    /// Without its ink, a page draws its template alone: what a lifted selection leaves (#325).
    @Test func aPageWithoutItsInkIsItsTemplate() throws {
        let note = try Self.note("elements-tablet")
        let drawn = try note.render(page: 0)
        let template = try note.render(page: 0, ink: false)
        #expect(drawn.pixels.contains { $0 < 128 })
        #expect(!template.pixels.contains { $0 < 128 })
    }

    /// `realtime-text-tablet.note`, made on the tablet in device round 8 (#298, #324): a replayed
    /// word that Real-Time Text turned into a text box. That text box carries the stroke document
    /// name, so the kind name decides before the document name does.
    @Test func aRealTimeTextBoxReadsAsATextBox() throws {
        let note = try Self.note("realtime-text-tablet")
        let elements = try note.elements(page: 0)
        let boxes = elements.filter { $0.kind == .textBox }
        #expect(boxes.count == 1, "\(elements.map(\.kind))")
        let bytes = try Self.bytes("realtime-text-tablet")
        let block = try Self.block(bytes)
        // Its text box record carries the stroke document name, as the tablet wrote it.
        #expect(Self.records(bytes, from: block).contains { record in
            Self.name(bytes, at: record + ElementRecord.kindName) == Registry.NotefileFormatVersions.textBoxKind
                && Self.name(bytes, at: record + ElementRecord.documentKind)
                    == Registry.NotefileFormatVersions.strokeDocument
        })
    }

    @Test func aTextBoxWithTheStrokeDocumentNameStaysATextBox() throws {
        var bytes = try Self.bytes("content")
        // The first record (the text box) gets the stroke document name, as Real-Time Text writes it.
        let document = try Self.block(bytes) + 4 + ElementRecord.documentKind
        let name = Array(Registry.NotefileFormatVersions.strokeDocument.utf8)
        for (index, byte) in name.enumerated() {
            bytes[document + index] = byte
        }
        bytes[document + name.count] = 0
        #expect(try NoteFile(bytes: bytes).elements(page: 0).map(\.kind) == [.textBox, .picture])
    }

    /// The start of each record (its length word) of the element block at `block`.
    static func records(_ bytes: [UInt8], from block: Int) -> [Int] {
        var offset = block + 4
        return (0..<NoteFile.word(bytes, at: block)).map { _ in
            defer { offset += 4 + NoteFile.word(bytes, at: offset) }
            return offset
        }
    }

    static func name(_ bytes: [UInt8], at offset: Int) -> String {
        String(decoding: bytes[offset..<(offset + ElementRecord.nameLength)].prefix { $0 != 0 }, as: UTF8.self)
    }

    @Test func aRecordOfAnUnknownKindThrows() throws {
        var bytes = try Self.bytes("content")
        // The first record (the text box) renamed: its kind name starts 52 bytes into the record.
        let name = try Self.block(bytes) + 4 + 52
        bytes[name] = UInt8(ascii: "9")
        #expect(throws: NoteFormatError.self) { try NoteFile(bytes: bytes).elements(page: 0) }
    }

    @Test func aPageOutsideTheNoteIsRefused() throws {
        #expect(throws: NoteFormatError.badPage(9)) { try Self.note("content").elements(page: 9) }
    }

    @Test func aCountPastTheBlockThrowsAndNeverReadsOn() throws {
        var bytes = try Self.bytes("content")
        bytes[try Self.block(bytes)] = 3
        #expect(throws: NoteFormatError.self) { try NoteFile(bytes: bytes).elements(page: 0) }
    }

    @Test func aPointCountPastTheRecordThrows() throws {
        var bytes = try Self.bytes("content")
        // The first record's point count: the block's count, the record's length and 212 bytes
        // of fields, then the count of its disabled areas (none).
        let points = try Self.block(bytes) + 4 + 212 + 4
        for (index, byte) in [UInt8(0xFF), 0xFF, 0xFF, 0x00].enumerated() {
            bytes[points + index] = byte
        }
        #expect(throws: NoteFormatError.self) { try NoteFile(bytes: bytes).elements(page: 0) }
    }

    static func bytes(_ name: String) throws -> [UInt8] {
        [UInt8](try FixtureTests.fixture("\(name).note"))
    }

    /// The first byte of page 1's element block, after its length.
    static func block(_ bytes: [UInt8]) throws -> Int {
        let note = try NoteFile(bytes: bytes)
        let address = try #require(note.pages[0].metadata.address(ElementRecord.key))
        return address + 4
    }

    static func expect(_ found: CGRect, near expected: CGRect, sourceLocation: SourceLocation = #_sourceLocation) {
        let close = [
            (found.minX, expected.minX), (found.minY, expected.minY), (found.maxX, expected.maxX),
            (found.maxY, expected.maxY),
        ].allSatisfy { abs($0 - $1) <= slack }
        #expect(close, "\(found) is not \(expected)", sourceLocation: sourceLocation)
    }

    /// The box of the ink inside `area` of a page, or `nil` when it holds none.
    static func inkBounds(_ page: PageBitmap, in area: CGRect) -> CGRect? {
        let clipped = area.intersection(CGRect(x: 0, y: 0, width: page.width, height: page.height))
        guard !clipped.isNull else { return nil }
        var found = CGRect.null
        for y in Int(clipped.minY)..<Int(clipped.maxY.rounded(.up)) {
            for x in Int(clipped.minX)..<Int(clipped.maxX.rounded(.up)) where page.pixels[y * page.width + x] < ink {
                found = found.union(CGRect(x: x, y: y, width: 1, height: 1))
            }
        }
        return found.isNull ? nil : found
    }
}
