import CoreGraphics
import CryptoKit
import Foundation
import InkNotebookEditorKit
import NoteFormat
import Observation
import os

/// Builds the word index of one open note in the background (#321): the tablet's own recognition
/// and the Mac's OCR of every drawn page, kept in the Caches folder by the note's content. Only
/// reading: the note's file is never written.
@Observable
final class NoteIndexer {
    enum State: Equatable {
        case idle
        case indexing(done: Int, of: Int)
        case ready(NoteIndex)
    }

    private(set) var state = State.idle
    /// Counts the copies of the note the indexer was given; a reading of an older copy stops and
    /// leaves the state to the newer one (#315).
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private let store: NoteIndexStore
    @ObservationIgnored private let recognizer: any PageRecognizer
    @ObservationIgnored private let pageImage: PageImage
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.notebookeditor", category: "index")

    /// Draws one page for the OCR, at full size.
    typealias PageImage = @Sendable (NoteFile, Int) throws -> CGImage?

    init(
        store: NoteIndexStore = NoteIndexer.defaultStore(), recognizer: any PageRecognizer = VisionRecognizer(),
        pageImage: @escaping PageImage = { try $0.render(page: $1).cgImage() }
    ) {
        self.store = store
        self.recognizer = recognizer
        self.pageImage = pageImage
    }

    /// The index files live in the app's own Caches folder: the system may empty it, and the
    /// index then rebuilds.
    static func defaultStore() -> NoteIndexStore {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return NoteIndexStore(
            root: caches.appending(path: "com.martonpaulo.inktools.notebookeditor/Index", directoryHint: .isDirectory))
    }

    /// Reads the stored index of `note`, else reads every page, one at a time, off the main actor.
    /// A second call while one runs or after it finished does nothing.
    func run(note: NoteFile) async {
        guard state == .idle else { return }
        await index(note, pages: nil, keeping: nil)
    }

    /// Brings the index to a newer copy of the note, as a live note pulls one (#315): the words of
    /// the pages that did not change stay, the `changed` pages are read again; every page is when
    /// `changed` is nil or no index is ready yet. A reading of the older copy still under way
    /// stops.
    func refresh(note: NoteFile, changed: Set<Int>?) async {
        if case .ready(let old) = state, let changed {
            await index(note, pages: changed, keeping: old)
        } else {
            await index(note, pages: nil, keeping: nil)
        }
    }

    /// Reads `pages` of `note` (every page when nil) and keeps `old`'s words of the others.
    private func index(_ note: NoteFile, pages: Set<Int>?, keeping old: NoteIndex?) async {
        generation += 1
        let mine = generation
        let current = { mine == self.generation }
        let count = note.pages.count
        let reading = (pages ?? Set(0..<count)).filter { $0 < count }.sorted()
        // A refresh keeps showing the older index until the newer one is ready.
        if old == nil { state = .indexing(done: 0, of: reading.count) }
        let digest = await Self.digest(note.bytes)
        let languages = recognizer.languages
        if let stored = await Self.stored(store, digest: digest, languages: languages) {
            if current() { state = .ready(stored) }
            return
        }
        let kept = old.map { index in index.words.filter { !reading.contains($0.page) && $0.page < count } } ?? []
        var words = kept
        var readPages: Set<Int> = old.map { $0.pages.subtracting(reading).filter { $0 < count } } ?? []
        for (done, page) in reading.enumerated() {
            guard !Task.isCancelled, current() else {
                if current() { state = .idle }
                return
            }
            let result = await Self.read(note, page: page, recognizer: recognizer, pageImage: pageImage, logger: logger)
            words += NoteIndex.merged(tablet: result.tablet, mac: result.mac)
            if result.complete { readPages.insert(page) }
            if old == nil, current() { state = .indexing(done: done + 1, of: reading.count) }
        }
        guard current() else { return }
        let built = NoteIndex(languages: languages, words: words, pages: readPages)
        await Self.save(built, to: store, digest: digest, logger: logger)
        if current() { state = .ready(built) }
    }

    /// The stored index, read and decoded off the main actor.
    @concurrent
    static func stored(_ store: NoteIndexStore, digest: String, languages: [String]) async -> NoteIndex? {
        store.index(digest: digest, languages: languages)
    }

    /// Writes the index off the main actor; a failure is logged, and the next opening reads again.
    @concurrent
    static func save(_ index: NoteIndex, to store: NoteIndexStore, digest: String, logger: Logger) async {
        do {
            try store.save(index, digest: digest)
        } catch {
            logger.error("the index was not saved: \(String(describing: error), privacy: .public)")
        }
    }

    /// The SHA-256 of the note's bytes, in hexadecimal: a changed note gets a new index.
    @concurrent
    static func digest(_ bytes: [UInt8]) async -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }

    /// The tablet's words and the Mac's words of one page; `complete` is false when either failed.
    @concurrent
    static func read(
        _ note: NoteFile, page: Int, recognizer: any PageRecognizer, pageImage: PageImage, logger: Logger
    ) async -> (tablet: [IndexedWord], mac: [IndexedWord], complete: Bool) {
        var complete = true
        var tablet: [IndexedWord] = []
        do {
            tablet = try note.recognizedWords(page: page).map { word in
                IndexedWord(
                    page: page, text: word.text,
                    box: CGRect(x: word.box.x, y: word.box.y, width: word.box.width, height: word.box.height),
                    source: .tablet)
            }
        } catch {
            complete = false
            logger.error("page \(page + 1, privacy: .public): \(String(describing: error), privacy: .public)")
        }
        var mac: [IndexedWord] = []
        do {
            if let image = try pageImage(note, page) {
                mac = try await recognizer.words(in: image).map {
                    IndexedWord(page: page, text: $0.text, box: $0.box, source: .mac)
                }
            } else {
                complete = false
                logger.error("page \(page + 1, privacy: .public) OCR: the page has no image")
            }
        } catch {
            complete = false
            logger.error("page \(page + 1, privacy: .public) OCR: \(String(describing: error), privacy: .public)")
        }
        return (tablet, mac, complete)
    }
}
