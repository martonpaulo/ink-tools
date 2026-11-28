import CoreGraphics
import Foundation
import NoteEditorKit
import Synchronization
import Testing

@testable import NoteEditor
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
    /// in page pixels from the top left. GitHub's macOS runner is a virtual machine where Vision's
    /// accurate model fails to compile (`e5rt_e5_compiler_compile call failed`, every run since
    /// 898b8ec, #303), so the test runs on a real Mac only: the local gate.
    /// shortcut: skipped on GitHub's runner; run it there once its image compiles Vision's model.
    /// A real Mac whose Vision cannot load that model on any device, the CPU too, fails with
    /// `e5rtError` 13 (`create_precompiled_compute_operation`, macOS 27.2.1) and reads at the fast
    /// level instead (#558), so the words are found either way.
    @Test(
        .disabled(
            if: ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil,
            "Vision cannot compile its model on GitHub's macOS VM"))
    func testVisionFindsDrawnWordsWhereTheyStand() async throws {
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

    /// A Mac whose Neural Engine or GPU cannot compile Vision's model reads the page on the CPU
    /// (#319), and a cancelled read is never tried again.
    @Test func testAFailedReadTriesTheCPUOnceAndACancelledOneNever() async throws {
        struct CompileFailed: Error {}
        let tries = FakeRecognizer.Counter()
        let read = try await VisionRecognizer.withCPUFallback { onCPU in
            tries.add()
            if !onCPU { throw CompileFailed() }
            return "read on the CPU"
        }
        #expect(read == "read on the CPU")
        #expect(tries.value == 2)

        let cancelled = FakeRecognizer.Counter()
        await #expect(throws: CancellationError.self) {
            try await VisionRecognizer.withCPUFallback { _ -> String in
                cancelled.add()
                throw CancellationError()
            }
        }
        #expect(cancelled.value == 1)
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

/// A live note's index follows each newer copy (#315).
@MainActor
struct NoteIndexRefreshTests {
    @Test func aNewerCopyReadsOnlyItsChangedPagesAgain() async throws {
        let store = try NoteIndexTests.scratch()
        defer { try? FileManager.default.removeItem(at: store) }
        let recognizer = FakeRecognizer(delay: .zero)
        let indexer = NoteIndexer(store: NoteIndexStore(root: store), recognizer: recognizer)
        let note = try Fixtures.note("content.note")
        await indexer.run(note: note)
        #expect(recognizer.calls.value == note.pages.count)
        let written = try NoteFile(
            bytes: NoteWriter.drawText(
                note, page: 2, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        await indexer.refresh(note: written, changed: [2])
        // Only page 3 is read again; the other pages keep their words.
        #expect(recognizer.calls.value == note.pages.count + 1)
        guard case .ready(let index) = indexer.state else {
            Issue.record("the index is not ready: \(indexer.state)")
            return
        }
        #expect(Set(index.words.map(\.page)) == Set(note.pages.indices))
        #expect(index.words.count == note.pages.count)
    }

    @Test func aNoteWithMovedPagesIsReadAgainWhole() async throws {
        let store = try NoteIndexTests.scratch()
        defer { try? FileManager.default.removeItem(at: store) }
        let recognizer = FakeRecognizer(delay: .zero)
        let indexer = NoteIndexer(store: NoteIndexStore(root: store), recognizer: recognizer)
        let note = try Fixtures.note("content.note")
        await indexer.run(note: note)
        let moved = try NoteFile(bytes: NoteWriter.movePage(note, from: 0, to: 2))
        await indexer.refresh(note: moved, changed: nil)
        #expect(recognizer.calls.value == 2 * note.pages.count)
        guard case .ready = indexer.state else {
            Issue.record("the index is not ready: \(indexer.state)")
            return
        }
    }

    @Test func theFindRunsAgainOnTheNewerCopy() async throws {
        let store = try NoteIndexTests.scratch()
        defer { try? FileManager.default.removeItem(at: store) }
        let text = NoteText(
            indexer: NoteIndexer(store: NoteIndexStore(root: store), recognizer: FakeRecognizer(delay: .zero)))
        let note = try Fixtures.note("content.note")
        await text.indexer.run(note: note)
        text.query = "word"
        #expect(text.search.matches.count == note.pages.count)
        let written = try NoteFile(
            bytes: NoteWriter.drawText(
                note, page: 2, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        await text.refresh(note: written, changed: [2])
        #expect(text.search.matches.count == note.pages.count)
        #expect(text.index != nil)
    }
}

/// A Mac whose Vision cannot load its accurate text model reads at the fast level, and the index
/// reads those pages again at the accurate level later (#558).
@MainActor
struct FastLevelTests {
    /// The error this Mac's Vision gives at the accurate level on every device (macOS 27.2.1).
    struct AccurateModelFailed: Error {}

    @Test func anAccurateFailureReadsAtTheFastLevelAndLaterPagesGoThereAtOnce() async throws {
        let failed = Mutex(false)
        let accurateTries = FakeRecognizer.Counter()
        let first = try await VisionRecognizer.withFastFallback(failed: failed) {
            accurateTries.add()
            throw AccurateModelFailed()
        } fast: {
            "fast"
        }
        #expect(first.0 == "fast" && first.fast)
        let second = try await VisionRecognizer.withFastFallback(failed: failed) {
            accurateTries.add()
            return "accurate"
        } fast: {
            "fast"
        }
        #expect(second.0 == "fast" && second.fast)
        #expect(accurateTries.value == 1)

        let working = Mutex(false)
        let read = try await VisionRecognizer.withFastFallback(failed: working) {
            "accurate"
        } fast: {
            "fast"
        }
        #expect(read.0 == "accurate" && !read.fast)

        let cancelled = Mutex(false)
        await #expect(throws: CancellationError.self) {
            _ = try await VisionRecognizer.withFastFallback(failed: cancelled) { () -> String in
                throw CancellationError()
            } fast: {
                "fast"
            }
        }
        #expect(!cancelled.withLock { $0 })
    }

    @Test func fastWordsAreMarkedAndAnAccurateReadReplacesThem() async throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "fast-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        let note = try NoteIndexTests.longNote(pages: 3)

        let fast = LevelRecognizer(fast: true)
        let first = NoteIndexer(store: NoteIndexStore(root: folder), recognizer: fast, pageImage: NoteIndexTests.blank)
        await first.run(note: note)
        guard case .ready(let read) = first.state else {
            Issue.record("state \(first.state)")
            return
        }
        #expect(read.fastPages == [0, 1, 2])
        #expect(read.words.filter { $0.source != .tablet }.allSatisfy { $0.source == .macFast })

        let accurate = LevelRecognizer(fast: false)
        let second = NoteIndexer(
            store: NoteIndexStore(root: folder), recognizer: accurate, pageImage: NoteIndexTests.blank)
        await second.run(note: note)
        guard case .ready(let again) = second.state else {
            Issue.record("state \(second.state)")
            return
        }
        #expect(accurate.calls.value == 3)
        #expect(again.fastPages.isEmpty)
        #expect(again.words.filter { $0.source == .mac }.count == 3)
        #expect(!again.words.contains { $0.source == .macFast })

        // Once replaced, a third opening reads nothing.
        let third = LevelRecognizer(fast: false)
        await NoteIndexer(store: NoteIndexStore(root: folder), recognizer: third, pageImage: NoteIndexTests.blank)
            .run(note: note)
        #expect(third.calls.value == 0)
    }
}

/// One word per page, read at the fast level or at the recognizer's own.
final class LevelRecognizer: PageRecognizer {
    let fast: Bool
    let languages = ["en"]
    let calls = FakeRecognizer.Counter()

    init(fast: Bool) {
        self.fast = fast
    }

    func words(in image: CGImage) async throws -> [(text: String, box: CGRect)] {
        try await read(image).words
    }

    func read(_ image: CGImage) async throws -> (words: [(text: String, box: CGRect)], fast: Bool) {
        calls.add()
        return ([(fast ? "w0rd" : "word", CGRect(x: 10, y: 10, width: 50, height: 20))], fast)
    }
}
