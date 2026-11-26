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
        let count = note.pages.count
        state = .indexing(done: 0, of: count)
        let digest = await Self.digest(note.bytes)
        let languages = recognizer.languages
        if let stored = await Self.stored(store, digest: digest, languages: languages) {
            state = .ready(stored)
            return
        }
        var tablet: [IndexedWord] = []
        var mac: [IndexedWord] = []
        var read: Set<Int> = []
        for page in 0..<count {
            guard !Task.isCancelled else {
                state = .idle
                return
            }
            let result = await Self.read(note, page: page, recognizer: recognizer, pageImage: pageImage, logger: logger)
            tablet += result.tablet
            mac += result.mac
            if result.complete { read.insert(page) }
            state = .indexing(done: page + 1, of: count)
        }
        let index = NoteIndex(languages: languages, words: NoteIndex.merged(tablet: tablet, mac: mac), pages: read)
        await Self.save(index, to: store, digest: digest, logger: logger)
        state = .ready(index)
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
