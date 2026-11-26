// The one write path's operation (#313): what the Mac sends for one edit, in our own words. The
// tablet helper inside Device Link applies it (#312, route T); a page move alone is written by the
// Mac (route B), the recorded exception of AGENTS.md. No field carries a colour, so no colour can
// enter a note through an operation (only Manta tones, owner 2026-11-26).
import Foundation

/// A rectangle on a page, in page pixels.
public struct EditRect: Sendable, Equatable, Codable {
    public let left: Int
    public let top: Int
    public let right: Int
    public let bottom: Int

    public init(left: Int, top: Int, right: Int, bottom: Int) {
        self.left = left
        self.top = top
        self.right = right
        self.bottom = bottom
    }
}

/// Who writes an operation's bytes.
public enum WriteRoute: Sendable, Equatable {
    /// The tablet helper, with the tablet's own file API.
    case tablet
    /// The Mac writes the note and copies it back: a page move only (#263).
    case mac
}

/// One edit of one note, made on the Mac's copy whose hash is `baseHash`.
public struct TabletOperation: Sendable, Equatable {
    public enum Change: Sendable, Equatable {
        /// Moves page `from` to `to`, both from 0.
        case movePage(from: Int, to: Int)
        /// A typed text box at `rect`.
        case insertText(String, rect: EditRect, fontSize: Int)
        /// A picture file on the Mac, already in Manta greys, at `rect`.
        case insertPicture(URL, rect: EditRect)
        /// Moves or resizes each element, by its number on the page from 1, to its rect.
        case placeElements([ElementPlacement])
        /// Resizes, rotates or flips elements: each target one tablet call, in order (#326).
        case transformElements([TransformTarget])
        /// Deletes the elements, by their numbers on the page from 1.
        case deleteElements([Int])
        /// Inserts a page at `page` with a system template such as `style_white`.
        case insertPage(template: String)
        /// Removes the pages at these places, each from 0; `page` is the lowest.
        case removePages([Int])
        /// Puts the note back as the backup kept before an edit: Revert to Backup's route, for
        /// the undo of a removal (#329).
        case restoreBackup(URL)
    }

    /// The note on the tablet, by its full path.
    public let note: String
    /// The hash of the Mac's copy the edit was made on.
    public let baseHash: String
    /// The page the change targets, from 0.
    public let page: Int
    public let change: Change

    public init(note: String, baseHash: String, page: Int, change: Change) {
        self.note = note
        self.baseHash = baseHash
        self.page = page
        self.change = change
    }

    /// The operation of an edit from the history (#328); nil for the restore of a page without
    /// the backup kept before its removal, the only copy of that page's content.
    public init?(_ edit: NoteEdit, note: String, baseHash: String, backup: URL? = nil) {
        switch edit {
        case .movePage(let from, let to):
            self.init(note: note, baseHash: baseHash, page: from, change: .movePage(from: from, to: to))
        case .insertPage(let at, let template):
            self.init(note: note, baseHash: baseHash, page: at, change: .insertPage(template: template))
        case .removePages(let at):
            guard let lowest = at.min() else { return nil }
            self.init(note: note, baseHash: baseHash, page: lowest, change: .removePages(at.sorted()))
        case .moveElements(let move):
            self.init(note: note, baseHash: baseHash, page: move.page, change: .placeElements(move.placements))
        case .insertPicture(let page, let file, let rect):
            self.init(note: note, baseHash: baseHash, page: page, change: .insertPicture(file, rect: rect))
        case .insertText(let page, let text, let rect, let fontSize):
            self.init(
                note: note, baseHash: baseHash, page: page, change: .insertText(text, rect: rect, fontSize: fontSize))
        case .transformElements(let transform):
            guard transform.refusal == nil else { return nil }
            self.init(
                note: note, baseHash: baseHash, page: transform.page, change: .transformElements(transform.targets))
        case .deleteElements(let page, let elements):
            self.init(
                note: note, baseHash: baseHash, page: page,
                change: .deleteElements(elements.map { $0.record + 1 }.sorted()))
        case .restorePages(let pages):
            guard let backup, let lowest = pages.min() else { return nil }
            self.init(note: note, baseHash: baseHash, page: lowest, change: .restoreBackup(backup))
        case .revertInsert(let page), .restoreElements(let page):
            guard let backup else { return nil }
            self.init(note: note, baseHash: baseHash, page: page, change: .restoreBackup(backup))
        }
    }

    public var route: WriteRoute {
        switch change {
        case .movePage, .restoreBackup: .mac
        default: .tablet
        }
    }

    /// The pages of the note before the edit that the edit may change, from 0; every other page
    /// must keep its bytes. A page move changes none: each page keeps its bytes at a new place.
    public var editedPages: Set<Int> {
        switch change {
        case .movePage, .insertPage, .restoreBackup: []
        case .removePages(let pages): Set(pages)
        default: [page]
        }
    }

    /// The bounds the edit writes into, when it writes into one place of a page.
    public var bounds: EditRect? {
        switch change {
        case .insertText(_, let rect, _), .insertPicture(_, let rect): rect
        case .placeElements(let placements) where placements.count == 1: placements[0].rect
        default: nil
        }
    }

    /// The refusal of this operation on a copy whose hash is `hash`: nil on its own base.
    public func refusal(onBase hash: String) -> WriteFailure? {
        hash == baseHash ? nil : .staleBase
    }

    /// The helper's operations, as `plugins/device-link/src/editor/operations.ts` reads them; empty
    /// for an operation the Mac writes. A picture names its local file; inkctl copies it.
    public var helperOperations: [HelperOperation] {
        switch change {
        case .movePage, .restoreBackup: []
        case .insertText(let text, let rect, let fontSize):
            [.insertElements(page: page, elements: [.text(text, rect: rect, fontSize: fontSize)])]
        case .insertPicture(let file, let rect):
            [.insertElements(page: page, elements: [.picture(file.path(percentEncoded: false), rect: rect)])]
        case .placeElements(let placements):
            placements.map { .modifyElements(page: page, num: $0.number, rect: $0.rect) }
        case .transformElements(let targets):
            targets.map { target in
                switch target {
                case .strokes(let numbers, let matrix):
                    .transformElements(page: page, nums: numbers, matrix: matrix.values)
                case .textBox(let number, let rect): .modifyElements(page: page, num: number, rect: rect)
                case .picture(let number, let rect, let file):
                    .modifyElements(page: page, num: number, rect: rect, file: file.path(percentEncoded: false))
                }
            }
        case .deleteElements(let numbers): [.deleteElements(page: page, nums: numbers)]
        case .insertPage(let template): [.insertPage(page: page, template: template)]
        // Highest first, so each number still names the page the owner picked.
        case .removePages(let pages): pages.sorted(by: >).map { .removePage(page: $0) }
        }
    }
}

/// One element's new place.
public struct ElementPlacement: Sendable, Equatable {
    public let number: Int
    public let rect: EditRect

    public init(number: Int, rect: EditRect) {
        self.number = number
        self.rect = rect
    }
}

/// An operation of the tablet helper, in its JSON shape.
public enum HelperOperation: Sendable, Equatable, Encodable {
    case insertElements(page: Int, elements: [HelperElement])
    /// A picture names its new file: the helper inserts it at `rect` and deletes the old one.
    case modifyElements(page: Int, num: Int, rect: EditRect, file: String? = nil)
    case transformElements(page: Int, nums: [Int], matrix: [Double])
    case deleteElements(page: Int, nums: [Int])
    case insertPage(page: Int, template: String)
    case removePage(page: Int)
    case openNote

    private enum Key: String, CodingKey { case op, page, elements, num, rect, file, nums, matrix, template }

    /// The helper's name of the operation.
    private var name: String {
        switch self {
        case .insertElements: "insertElements"
        case .modifyElements: "modifyElements"
        case .transformElements: "transformElements"
        case .deleteElements: "deleteElements"
        case .insertPage: "insertPage"
        case .removePage: "removePage"
        case .openNote: "openNote"
        }
    }

    /// The page the operation targets, from 0; none for `openNote`.
    private var page: Int? {
        switch self {
        case .insertElements(let page, _), .modifyElements(let page, _, _, _), .transformElements(let page, _, _),
            .deleteElements(let page, _), .insertPage(let page, _), .removePage(let page):
            page
        case .openNote: nil
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        try container.encode(name, forKey: .op)
        try container.encodeIfPresent(page, forKey: .page)
        switch self {
        case .insertElements(_, let elements):
            try container.encode(elements, forKey: .elements)
        case .modifyElements(_, let num, let rect, let file):
            try container.encode(num, forKey: .num)
            try container.encode(rect, forKey: .rect)
            try container.encodeIfPresent(file, forKey: .file)
        case .transformElements(_, let nums, let matrix):
            try container.encode(nums, forKey: .nums)
            try container.encode(matrix, forKey: .matrix)
        case .deleteElements(_, let nums):
            try container.encode(nums, forKey: .nums)
        case .insertPage(_, let template):
            try container.encode(template, forKey: .template)
        case .removePage, .openNote:
            break
        }
    }
}

/// An element the helper inserts, in its JSON shape.
public enum HelperElement: Sendable, Equatable, Encodable {
    case text(String, rect: EditRect, fontSize: Int)
    case picture(String, rect: EditRect)

    private enum Key: String, CodingKey { case kind, text, rect, fontSize, file }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        switch self {
        case .text(let text, let rect, let fontSize):
            try container.encode("text", forKey: .kind)
            try container.encode(text, forKey: .text)
            try container.encode(rect, forKey: .rect)
            try container.encode(fontSize, forKey: .fontSize)
        case .picture(let file, let rect):
            try container.encode("picture", forKey: .kind)
            try container.encode(file, forKey: .file)
            try container.encode(rect, forKey: .rect)
        }
    }
}
