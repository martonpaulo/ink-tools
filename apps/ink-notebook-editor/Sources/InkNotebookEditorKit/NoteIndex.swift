// The words of one open note, for Find in Note and Copy as Text (#321). A rebuildable cache kept
// in the Mac's Caches folder: Mac OCR only reads and indexes, it never writes into the note.
import CoreGraphics
import Foundation

/// One word on a page, with its box in page pixels from the top left of the upright page.
public struct IndexedWord: Sendable, Equatable, Codable {
    /// Who read the word: the tablet's own recognition, or the Mac's OCR.
    public enum Source: String, Sendable, Codable {
        case tablet, mac
    }

    public let page: Int
    public let text: String
    public let box: CGRect
    public let source: Source

    public init(page: Int, text: String, box: CGRect, source: Source) {
        self.page = page
        self.text = text
        self.box = box
        self.source = source
    }

    /// The text with case and diacritics folded, as Find compares it.
    public var folded: String { Self.fold(text) }

    public static func fold(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
    }
}

/// Every word the Mac and the tablet read in one note, and which pages were read.
public struct NoteIndex: Sendable, Equatable, Codable {
    /// Raised when the stored shape or the way words are read changes, so old caches rebuild.
    public static let formatVersion = 1

    public let formatVersion: Int
    /// The recognition languages the Mac's OCR used, as language codes.
    public let languages: [String]
    public let words: [IndexedWord]
    /// The pages, from 0, whose words are all read; a page that failed is left out.
    public let pages: Set<Int>

    public init(languages: [String], words: [IndexedWord], pages: Set<Int>) {
        formatVersion = Self.formatVersion
        self.languages = languages
        self.words = words
        self.pages = pages
    }

    /// The share of a Mac word's box that a tablet word must cover to be the same word.
    public static let sameWordCover = 0.5

    /// Every tablet word, and each Mac word that no tablet word on its page already holds: the
    /// same folded text over half or more of the Mac word's box.
    public static func merged(tablet: [IndexedWord], mac: [IndexedWord]) -> [IndexedWord] {
        let extra = mac.filter { word in
            !tablet.contains { other in
                other.page == word.page && other.folded == word.folded
                    && cover(of: word.box, by: other.box) >= sameWordCover
            }
        }
        return tablet + extra
    }

    /// The share of `box`'s area inside `other`.
    static func cover(of box: CGRect, by other: CGRect) -> Double {
        let area = box.width * box.height
        guard area > 0 else { return 0 }
        let inside = box.intersection(other)
        return inside.isNull ? 0 : Double(inside.width * inside.height / area)
    }
}

/// The index files of every note opened, one per note content, in a folder of the Caches.
public struct NoteIndexStore: Sendable {
    public let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// The index of the note whose bytes hash to `digest`, read for `languages`; nil when there is
    /// none, or it was written by another format version or for other languages.
    public func index(digest: String, languages: [String]) -> NoteIndex? {
        guard let data = try? Data(contentsOf: file(digest)),
            let index = try? JSONDecoder().decode(NoteIndex.self, from: data),
            index.formatVersion == NoteIndex.formatVersion, index.languages == languages
        else { return nil }
        return index
    }

    public func save(_ index: NoteIndex, digest: String) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(index).write(to: file(digest), options: .atomic)
    }

    func file(_ digest: String) -> URL {
        root.appending(path: "\(digest).json")
    }
}
