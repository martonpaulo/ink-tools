import CoreGraphics
import Foundation
import ImageIO
import NoteEditorKit
import PDFKit
import Testing
import UniformTypeIdentifiers

@testable import NoteEditor
@testable import NoteFormat

/// Copy and drag a page out of the note (#323), read back through the item provider a paste or a
/// drop into Finder reads, never on screen.
struct PageExportTests {
    static func load(_ provider: NSItemProvider, _ type: UTType) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadDataRepresentation(for: type) { data, error in
                if let data {
                    continuation.resume(returning: data)
                } else {
                    continuation.resume(throwing: error ?? CocoaError(.fileReadUnknown))
                }
            }
        }
    }

    @Test func testAPageWithWordsGivesPNGPDFAndText() async throws {
        let note = try Fixtures.note("landscape.note")
        let provider = PageExport.itemProvider(
            note: note, page: 0, name: PageExport.name(note: "Sketches", page: 0), text: "Primeira linha")
        #expect(provider.registeredContentTypes == [.png, .pdf, .utf8PlainText])
        #expect(provider.suggestedName == "Sketches page 1")
        // A drop into Finder writes this PNG: the drawn page, landscape and upright.
        let png = try await Self.load(provider, .png)
        let source = try #require(CGImageSourceCreateWithData(png as CFData, nil))
        #expect(CGImageSourceGetType(source) as String? == UTType.png.identifier)
        let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
        #expect(image.width > image.height)
        // The PDF is one page as large as the page on paper, landscape too.
        let pdf = try #require(PDFDocument(data: try await Self.load(provider, .pdf)))
        #expect(pdf.pageCount == 1)
        let box = try #require(pdf.page(at: 0)).bounds(for: .mediaBox)
        #expect(abs(box.width - Double(image.width) * 72 / 300) < 1)
        #expect(String(bytes: try await Self.load(provider, .utf8PlainText), encoding: .utf8) == "Primeira linha")
    }

    @Test func testAPageWithoutWordsGivesNoText() throws {
        let provider = PageExport.itemProvider(
            note: try Fixtures.note("content.note"), page: 1, name: "Note page 2", text: "")
        #expect(provider.registeredContentTypes == [.png, .pdf])
    }

    @Test func testAWordBothSourcesReadIsCopiedOnceAsTheTabletReadIt() {
        let box = CGRect(x: 100, y: 100, width: 200, height: 60)
        let index = NoteIndex(
            languages: ["en"],
            words: [
                IndexedWord(page: 0, text: "maçã", box: box, source: .tablet),
                IndexedWord(page: 0, text: "maca!", box: box.insetBy(dx: 10, dy: 5), source: .mac),
                IndexedWord(page: 0, text: "verde", box: box.offsetBy(dx: 250, dy: 0), source: .mac),
                IndexedWord(page: 1, text: "outra", box: box, source: .tablet),
            ],
            pages: [0, 1])
        #expect(ReadingOrder.text(index.textWords(pages: [0])) == "maçã verde")
        #expect(ReadingOrder.text(index.textWords(pages: nil)) == "maçã verde\n\noutra")
    }
}
