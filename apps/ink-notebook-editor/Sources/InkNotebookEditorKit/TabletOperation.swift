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
        /// Deletes the elements, by their numbers on the page from 1.
        case deleteElements([Int])
        /// Inserts a page at `page` with a system template such as `style_white`.
        case insertPage(template: String)
        /// Removes the page at `page`.
        case removePage
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
        case .removePage(let at):
            self.init(note: note, baseHash: baseHash, page: at, change: .removePage)
        case .moveElements(let move):
            self.init(note: note, baseHash: baseHash, page: move.page, change: .placeElements(move.placements))
        case .restorePage(let at):
            guard let backup else { return nil }
            self.init(note: note, baseHash: baseHash, page: at, change: .restoreBackup(backup))
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
        case .deleteElements(let numbers): [.deleteElements(page: page, nums: numbers)]
        case .insertPage(let template): [.insertPage(page: page, template: template)]
        case .removePage: [.removePage(page: page)]
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
    case modifyElements(page: Int, num: Int, rect: EditRect)
    case deleteElements(page: Int, nums: [Int])
    case insertPage(page: Int, template: String)
    case removePage(page: Int)
    case openNote

    private enum Key: String, CodingKey { case op, page, elements, num, rect, nums, template }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        switch self {
        case .insertElements(let page, let elements):
            try container.encode("insertElements", forKey: .op)
            try container.encode(page, forKey: .page)
            try container.encode(elements, forKey: .elements)
        case .modifyElements(let page, let num, let rect):
            try container.encode("modifyElements", forKey: .op)
            try container.encode(page, forKey: .page)
            try container.encode(num, forKey: .num)
            try container.encode(rect, forKey: .rect)
        case .deleteElements(let page, let nums):
            try container.encode("deleteElements", forKey: .op)
            try container.encode(page, forKey: .page)
            try container.encode(nums, forKey: .nums)
        case .insertPage(let page, let template):
            try container.encode("insertPage", forKey: .op)
            try container.encode(page, forKey: .page)
            try container.encode(template, forKey: .template)
        case .removePage(let page):
            try container.encode("removePage", forKey: .op)
            try container.encode(page, forKey: .page)
        case .openNote:
            try container.encode("openNote", forKey: .op)
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
