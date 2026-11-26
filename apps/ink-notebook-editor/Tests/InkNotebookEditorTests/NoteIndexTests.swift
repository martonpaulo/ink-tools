import CoreGraphics
import Foundation
import InkNotebookEditorKit
import Testing

@testable import InkNotebookEditor
@testable import NoteFormat

/// The word index of a note (#321): the merge of both sources, its cache, and the indexer.
@MainActor
struct NoteIndexTests {
    /// A scratch folder removed by each test that makes one.
    static func scratch() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appending(path: "note-index-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    static func word(_ text: String, _ box: CGRect, page: Int = 0, _ source: IndexedWord.Source) -> IndexedWord {
        IndexedWord(page: page, text: text, box: box, source: source)
    }

    @Test func testTheMergeDropsAMacWordTheTabletHoldsAndKeepsANewOne() {
        let tablet = [Self.word("Maçã", CGRect(x: 100, y: 100, width: 200, height: 60), .tablet)]
        let mac = [
            // The same word, folded, over the same place.
            Self.word("maca", CGRect(x: 110, y: 105, width: 180, height: 50), .mac),
            // The same word elsewhere on the page, and on another page.
            Self.word("maca", CGRect(x: 100, y: 900, width: 200, height: 60), .mac),
            Self.word("maçã", CGRect(x: 100, y: 100, width: 200, height: 60), page: 1, .mac),
            // Another word over the same place: the tablet may have misread it.
            Self.word("manga", CGRect(x: 100, y: 100, width: 200, height: 60), .mac),
        ]
        #expect(NoteIndex.merged(tablet: tablet, mac: mac) == tablet + mac.dropFirst())
    }

    @Test func testTheStoreKeepsAnIndexOnlyForItsVersionAndLanguages() throws {
        let folder = try Self.scratch()
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = NoteIndexStore(root: folder.appending(path: "Index"))
        let index = NoteIndex(
            languages: ["pt-BR", "en"], words: [Self.word("olá", CGRect(x: 1, y: 2, width: 3, height: 4), .mac)],
            pages: [0])
        #expect(store.index(digest: "abc", languages: ["pt-BR", "en"]) == nil)
        try store.save(index, digest: "abc")
        #expect(store.index(digest: "abc", languages: ["pt-BR", "en"]) == index)
        #expect(store.index(digest: "abc", languages: ["en"]) == nil)
        #expect(store.index(digest: "other", languages: ["pt-BR", "en"]) == nil)
        // An index of another format version is rebuilt, never trusted.
        let old = try String(contentsOf: folder.appending(path: "Index/abc.json"), encoding: .utf8)
            .replacingOccurrences(of: "\"formatVersion\":\(NoteIndex.formatVersion)", with: "\"formatVersion\":0")
        try old.write(to: folder.appending(path: "Index/abc.json"), atomically: true, encoding: .utf8)
        #expect(store.index(digest: "abc", languages: ["pt-BR", "en"]) == nil)
    }

    @Test func testIndexingLeavesTheNoteFileAsItWas() async throws {
        let folder = try Self.scratch()
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appending(path: "content.note")
        try Fixtures.data("content.note").write(to: file)
        let before = try Data(contentsOf: file)
        let modified = try FileManager.default.attributesOfItem(atPath: file.path())[.modificationDate] as? Date
        let indexer = NoteIndexer(
            store: NoteIndexStore(root: folder.appending(path: "Index")), recognizer: FakeRecognizer(delay: .zero),
            pageImage: Self.blank)
        await indexer.run(note: try NoteFile(data: before))
        guard case .ready(let index) = indexer.state else {
            Issue.record("the indexer did not finish: \(indexer.state)")
            return
        }
        #expect(index.pages == [0, 1, 2, 3])
        #expect(try Data(contentsOf: file) == before)
        #expect(try FileManager.default.attributesOfItem(atPath: file.path())[.modificationDate] as? Date == modified)
        // The index went to its own folder, and the note's folder holds only the note.
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: folder.path()).sorted() == ["Index", "content.note"])
    }

    @Test func testASecondOpeningReadsTheStoredIndex() async throws {
        let folder = try Self.scratch()
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = NoteIndexStore(root: folder)
        let note = try Fixtures.note("content.note")
        await NoteIndexer(store: store, recognizer: FakeRecognizer(delay: .zero), pageImage: Self.blank).run(note: note)
        let counting = FakeRecognizer(delay: .zero)
        let second = NoteIndexer(store: store, recognizer: counting, pageImage: Self.blank)
        await second.run(note: note)
        #expect(counting.calls.value == 0)
        guard case .ready(let index) = second.state else {
            Issue.record("the stored index was not read: \(second.state)")
            return
        }
        #expect(index.words.count == note.pages.count)
    }

    /// A 60-page note indexes off the main actor: no page is drawn or recognised on the main
    /// thread, so the window keeps answering. Other suites keep the main actor busy while this
    /// one runs, so the test checks where the work runs rather than how long the main actor waits.
    @Test func testA60PageNoteIndexesOffTheMainThread() async throws {
        let folder = try Self.scratch()
        defer { try? FileManager.default.removeItem(at: folder) }
        let recognizer = FakeRecognizer(delay: .milliseconds(5))
        let drawnOnMain = FakeRecognizer.Counter()
        let indexer = NoteIndexer(
            store: NoteIndexStore(root: folder), recognizer: recognizer,
            pageImage: { note, page in
                if pthread_main_np() != 0 { drawnOnMain.add() }
                return try Self.blank(note, page)
            })
        await indexer.run(note: try Self.longNote(pages: 60))
        guard case .ready(let index) = indexer.state else {
            Issue.record("the indexer did not finish: \(indexer.state)")
            return
        }
        #expect(index.pages.count == 60)
        #expect(recognizer.calls.value == 60)
        #expect(recognizer.onMain.value == 0)
        #expect(drawnOnMain.value == 0)
    }

    /// Vision reads typed words drawn into a page, and their box stands where they were drawn,
    /// in page pixels from the top left.
    @Test func testVisionFindsDrawnWordsWhereTheyStand() async throws {
        let base = try Fixtures.note("content.note")
        let rect = PageRect(x: 200, y: 400, width: 1200, height: 160)
        let note = try NoteFile(
            bytes: try NoteWriter.drawText(base, page: 0, text: "Quarterly harvest", in: rect, fontSize: 110))
        let image = try #require(try note.render(page: 0).cgImage())
        let words = try await VisionRecognizer(preferred: ["en-US"]).words(in: image)
        let harvest = try #require(words.first { IndexedWord.fold($0.text) == "harvest" }, "Vision read \(words)")
        let drawn = CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
        #expect(drawn.contains(CGPoint(x: harvest.box.midX, y: harvest.box.midY)), "box \(harvest.box)")
    }

    @Test func testThePreferredLanguagesThatVisionReadsAreKept() {
        let languages = VisionRecognizer(preferred: ["pt-BR", "en-GB", "xx"]).languages.map(Locale.Language.init)
        #expect(languages.map(\.languageCode) == [.portuguese, .english])
        #expect(languages.first?.region == .brazil)
        #expect(VisionRecognizer(preferred: ["xx"]).languages.isEmpty)
    }

    /// A small white page in place of a drawn one: a debug build takes seconds to draw a page.
    nonisolated static let blank: NoteIndexer.PageImage = { _, _ in
        CGContext(
            data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue)?.makeImage()
    }

    /// `content.note` with `pages` pages: the footer names its pages again and again.
    static func longNote(pages: Int) throws -> NoteFile {
        let file = try Fixtures.note("content.note")
        let addresses = try NoteWriter.pageAddresses(file)
        var pairs = file.footer.pairs.filter { NoteWriter.pageNumber(of: $0.key) == nil }
        pairs += (0..<pages).map {
            Metadata.Pair(key: "PAGE\($0 + 1)", value: String(addresses[$0 % addresses.count]))
        }
        return try NoteFile(
            bytes: try NoteWriter.withFooter(
                file, prefix: Array(file.bytes[..<NoteWriter.footerAddress(file)]), pairs: pairs))
    }
}

/// One word per page, after `delay` of work; counts its calls and those made on the main thread.
final class FakeRecognizer: PageRecognizer {
    let delay: Duration
    let languages = ["en"]
    let calls = Counter()
    let onMain = Counter()

    init(delay: Duration) {
        self.delay = delay
    }

    func words(in image: CGImage) async throws -> [(text: String, box: CGRect)] {
        calls.add()
        if pthread_main_np() != 0 { onMain.add() }
        // A busy wait, as recognition keeps a core busy rather than sleeping.
        let end = ContinuousClock.now + delay
        while ContinuousClock.now < end {}
        return [("word", CGRect(x: 10, y: 10, width: 50, height: 20))]
    }

    final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        var value: Int { lock.withLock { count } }
        func add() { lock.withLock { count += 1 } }
    }
}
