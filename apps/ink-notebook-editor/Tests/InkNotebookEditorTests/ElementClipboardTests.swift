import CoreGraphics
import Foundation
import InkNotebookEditorKit
import Testing

/// Cut, Copy and Paste of elements (#327): the pasteboard type, the placement at the pointer or in
/// the same place, copies gathered before a paste, and the insert the helper reads.
@Suite struct ElementClipboardTests {
    static let source = ElementClipping.Source(note: "/storage/emulated/0/Note/Tests/a.note", page: 1)
    static let stroke = ClipElement.stroke(
        points: [CGPoint(x: 100, y: 200), CGPoint(x: 300, y: 260)], penColor: .black, thickness: 400)
    static let text = ClipElement.textBox(
        text: "First text box", frame: EditRect(left: 250, top: 400, right: 400, bottom: 500), fontSize: 40)
    static let picture = ClipElement.picture(
        png: Data([0x89, 0x50, 0x4E, 0x47]), frame: EditRect(left: 500, top: 100, right: 600, bottom: 180))

    static let all = [stroke, text, picture]

    static func clipping(_ elements: [ClipElement] = ElementClipboardTests.all) throws -> ElementClipping {
        try #require(ElementClipping(elements, from: source))
    }

    @Test func theTypeIsOurOwnAndCarriesEveryKindThrough() throws {
        #expect(ElementClipping.pasteboardType == "com.martonpaulo.inktools.notebookeditor.elements")
        let clipping = try Self.clipping()
        let read = try ElementClipping(data: try clipping.data())
        #expect(read == clipping)
        #expect(read.sources == [Self.source])
        #expect(read.frame == EditRect(left: 100, top: 100, right: 600, bottom: 500))
    }

    @Test func dataThatIsNoClippingIsRefused() {
        #expect(throws: (any Error).self) { try ElementClipping(data: Data("{}".utf8)) }
        #expect(throws: (any Error).self) { try ElementClipping(data: Data(#"{"elements":[],"sources":[]}"#.utf8)) }
        #expect(ElementClipping([], from: Self.source) == nil)
    }

    @Test func aColourThatIsNoPenToneIsRefused() throws {
        let json = try #require(String(bytes: try Self.clipping([Self.stroke]).data(), encoding: .utf8))
        let red = json.replacingOccurrences(of: #""penColor":0"#, with: #""penColor":255"#)
        #expect(red != json)
        #expect(throws: (any Error).self) { try ElementClipping(data: Data(red.utf8)) }
    }

    @Test func aPasteInTheSamePlaceKeepsEveryBox() throws {
        let clipping = try Self.clipping()
        let placed = try #require(clipping.placed(at: nil, width: 1920, height: 2560))
        #expect(placed == clipping.elements)
    }

    @Test func aPasteAtThePointerCentresTheSelectionThere() throws {
        let placed = try #require(try Self.clipping().placed(at: CGPoint(x: 1000, y: 1000), width: 1920, height: 2560))
        // The frame, 500 by 400, moves from 100, 100 to 750, 800: every element by 650, 700.
        #expect(
            placed.map(\.box) == [
                EditRect(left: 750, top: 900, right: 950, bottom: 960),
                EditRect(left: 900, top: 1100, right: 1050, bottom: 1200),
                EditRect(left: 1150, top: 800, right: 1250, bottom: 880),
            ])
    }

    @Test(arguments: [(CGPoint(x: 0, y: 0), 0, 0), (CGPoint(x: 1920, y: 2560), 1420, 2160)])
    func aPasteStaysOnThePage(pointer: CGPoint, left: Int, top: Int) throws {
        let placed = try #require(try Self.clipping().placed(at: pointer, width: 1920, height: 2560))
        let frame = placed.dropFirst().reduce(placed[0].box) { $0.union($1.box) }
        #expect(frame == EditRect(left: left, top: top, right: left + 500, bottom: top + 400))
    }

    @Test func aSelectionLargerThanThePagePastesNothing() throws {
        #expect(try Self.clipping().placed(at: nil, width: 400, height: 2560) == nil)
    }

    @Test func copiesGatheredBeforeAPasteLandTogether() throws {
        let other = ElementClipping.Source(note: "/storage/emulated/0/Note/Tests/b.note", page: 0)
        let first = try Self.clipping([Self.stroke])
        let second = try #require(ElementClipping([Self.picture], from: other))
        let gathered = first.gathering(second)
        #expect(gathered.elements == [Self.stroke, Self.picture])
        #expect(gathered.sources == [Self.source, other])
        // Pasted at the pointer, both move by the same offset, as one selection: the frame, 500 by
        // 160 at 100, 100, moves to 750, 920.
        let placed = try #require(gathered.placed(at: CGPoint(x: 1000, y: 1000), width: 1920, height: 2560))
        #expect(
            placed.map(\.box) == [
                EditRect(left: 750, top: 1020, right: 950, bottom: 1080),
                EditRect(left: 1150, top: 920, right: 1250, bottom: 1000),
            ])
    }

    @Test func aPasteIsOneInsertTheHelperReads() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "clipboard-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        let change = try ElementClipping.change(inserting: try Self.clipping().elements, picturesIn: folder)
        let operation = TabletOperation(note: Self.source.note, baseHash: "h", page: 1, change: change)
        #expect(operation.route == .tablet && operation.editedPages == [1])
        #expect(operation.bounds == EditRect(left: 100, top: 100, right: 600, bottom: 500))
        let json =
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(operation.helperOperations)) as? [[String: Any]]
        #expect(json?.count == 1 && json?[0]["op"] as? String == "insertElements")
        let elements = try #require(json?[0]["elements"] as? [[String: Any]])
        #expect(elements.map { $0["kind"] as? String } == ["stroke", "text", "picture"])
        #expect(elements[0]["points"] as? [[Int]] == [[100, 200], [300, 260]])
        #expect(elements[0]["penColor"] as? Int == 0 && elements[0]["thickness"] as? Int == 400)
        #expect(elements[1]["fontSize"] as? Int == 40)
        // The picture is a PNG file the change wrote, for inkctl to copy to the tablet.
        let file = try #require(elements[2]["file"] as? String)
        #expect(file.hasSuffix(".png"))
        #expect(try Data(contentsOf: URL(filePath: file)) == Data([0x89, 0x50, 0x4E, 0x47]))
    }

    @Test func thePenTonesAreTheMantasFour() {
        #expect(PenTone.allCases.map(\.rawValue) == [0x00, 0x9D, 0xC9, 0xFE])
    }
}
