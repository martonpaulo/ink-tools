import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

@testable import NoteEditor
@testable import NoteEditorKit
@testable import NoteFormat

/// Copy and drag a selection out of the note (#323 with #324): its ink on a transparent
/// background, read back through the item provider a paste or a drop reads, never on screen.
struct SelectionExportTests {
    /// Page 1 of `content.note`: a text box at 200, 200, 1200 x 54 and a picture at 720, 1120.
    static let textBox = Selectable(
        id: 0, bounds: CGRect(x: 200, y: 200, width: 1200, height: 54), points: [], isArea: true)
    static let picture = Selectable(
        id: 1, bounds: CGRect(x: 720, y: 1120, width: 480, height: 320), points: [], isArea: true, isPicture: true)

    static func pixel(_ image: CGImage, _ x: Int, _ y: Int) throws -> [UInt8] {
        let data = try #require(image.dataProvider?.data as Data?)
        let at = y * image.bytesPerRow + x * PageExport.bytesPerPixel
        return Array(data[at..<(at + PageExport.bytesPerPixel)])
    }

    @Test func aSelectionsInkIsBlackOnTransparentCutToItsFrame() throws {
        let note = try Fixtures.note("content.note")
        let image = try PageExport.selectionImage(of: note, page: 0, items: [Self.textBox])
        let margin = Int(PageExport.margin)
        #expect(image.width == Int(Self.textBox.bounds.width) + 2 * margin)
        #expect(image.height == Int(Self.textBox.bounds.height) + 2 * margin)
        // The corner holds no ink: fully transparent, not a white page.
        #expect(try Self.pixel(image, 0, 0)[3] == 0)
        // The text's ink is there, black at full opacity somewhere.
        let opaque = try (0..<image.height).contains { y in
            try (0..<image.width).contains { x in try Self.pixel(image, x, y) == [0, 0, 0, 255] }
        }
        #expect(opaque)
    }

    @Test func aSelectedPictureKeepsItsGreysOpaque() throws {
        let note = try Fixtures.note("content.note")
        let image = try PageExport.selectionImage(of: note, page: 0, items: [Self.picture])
        let margin = Int(PageExport.margin)
        // Inside the picture every pixel is opaque, its white too; outside it, nothing shows.
        let inside = try Self.pixel(image, margin + 5, margin + 5)
        #expect(inside[3] == 255)
        #expect(try Self.pixel(image, 0, 0)[3] == 0)
    }

    @Test func aTemplateNeverComesWithTheInk() throws {
        let note = try Fixtures.note("templates.note")
        // Page 2 has a dot grid template and one written word.
        let plain = try note.render(page: 1, template: false)
        let full = try note.render(page: 1)
        let dark = { (bitmap: PageBitmap) in bitmap.pixels.filter { $0 < 128 }.count }
        #expect(dark(plain) > 0)
        #expect(dark(plain) < dark(full))
    }

    @Test func aSelectionGivesPNGPDFAndItsWords() async throws {
        let provider = PageExport.selectionProvider(
            note: try Fixtures.note("content.note"), page: 0, items: [Self.textBox],
            name: PageExport.selectionName(note: "Sketches", page: 0), text: "Notebook editor fixture")
        #expect(provider.registeredContentTypes == [.png, .pdf, .utf8PlainText])
        #expect(provider.suggestedName == "Sketches page 1 selection")
        let png = try await PageExportTests.load(provider, .png)
        let source = try #require(CGImageSourceCreateWithData(png as CFData, nil))
        let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
        #expect(image.alphaInfo != .none && image.alphaInfo != .noneSkipLast)
    }

    @Test func aSelectionWithoutWordsGivesNoText() throws {
        let provider = PageExport.selectionProvider(
            note: try Fixtures.note("content.note"), page: 0, items: [Self.picture],
            name: "Note page 1 selection", text: "")
        #expect(provider.registeredContentTypes == [.png, .pdf])
    }

    @Test func aNeighbouringStrokesInkStaysOutThoughTheBoxesOverlap() throws {
        let note = try Fixtures.note("landscape-tablet.note")
        let strokes = try note.elements(page: 0).enumerated().map { id, element in
            Selectable(id: id, bounds: element.bounds, points: element.points, isArea: false)
        }
        // Strokes 3 and 4 of the word overlap at their boxes' edge; only stroke 3 is selected.
        let chosen = strokes[2]
        let other = strokes[3]
        #expect(chosen.bounds.intersects(other.bounds))
        let image = try PageExport.selectionImage(of: note, page: 0, items: [chosen])
        let frame = chosen.bounds.insetBy(dx: -PageExport.margin, dy: -PageExport.margin).integral
        let far = other.points.filter {
            frame.contains($0) && HitTest.distance(from: $0, to: chosen.points) > PageExport.inkReach + 2
        }
        #expect(!far.isEmpty)
        for point in far {
            let pixel = try Self.pixel(image, Int(point.x - frame.minX), Int(point.y - frame.minY))
            #expect(pixel[3] == 0, "the other stroke's ink at \(point) came along")
        }
    }
}
