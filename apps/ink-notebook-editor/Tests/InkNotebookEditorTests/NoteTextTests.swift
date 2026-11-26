import CoreGraphics
import Foundation
import InkNotebookEditorKit
import Testing

@testable import InkNotebookEditor
@testable import NoteFormat

/// What the find bar says and finds (#322), and a Heading's label from the index (#331).
@MainActor
struct NoteTextTests {
    /// The note's text once a recognizer that reads «word» at the top left of every page is done.
    static func read(_ name: String = "content.note") async throws -> (NoteText, URL) {
        let folder = try NoteIndexTests.scratch()
        let text = NoteText(
            indexer: NoteIndexer(
                store: NoteIndexStore(root: folder), recognizer: FakeRecognizer(delay: .zero),
                pageImage: NoteIndexTests.blank))
        await text.indexer.run(note: try Fixtures.note(name))
        return (text, folder)
    }

    @Test func testTheBarSaysTheReadingThenTheCountThenNoResults() async throws {
        let waiting = NoteText(indexer: NoteIndexer(store: NoteIndexStore(root: URL(filePath: "/dev/null"))))
        waiting.showFind()
        #expect(waiting.status == "")
        waiting.query = "word"
        #expect(waiting.status == Copy.readingHandwritingStart)
        let (text, folder) = try await Self.read()
        defer { try? FileManager.default.removeItem(at: folder) }
        text.showFind()
        text.query = "WORD"
        #expect(text.status == Copy.matchOf(1, 4))
        text.previous()
        #expect(text.status == Copy.matchOf(4, 4))
        #expect(text.search.currentMatch?.page == 3)
        text.query = "orchard"
        #expect(text.status == Copy.noResults)
        text.closeFind()
        #expect(!text.findShown && text.query.isEmpty)
    }

    @Test func testAHeadingIsLabelledByTheWordsInsideItsBox() async throws {
        let (text, folder) = try await Self.read()
        defer { try? FileManager.default.removeItem(at: folder) }
        let over = Heading(
            page: 1, level: 1, box: PageRect(x: 0, y: 0, width: 100, height: 60), bitmapAddress: 0, encoding: nil)
        let elsewhere = Heading(
            page: 1, level: 1, box: PageRect(x: 500, y: 500, width: 100, height: 60), bitmapAddress: 0, encoding: nil)
        #expect(text.words(in: over) == "word")
        #expect(text.words(in: elsewhere) == nil)
        #expect(text.text(pages: [0, 2]) == "word\n\nword")
    }
}
