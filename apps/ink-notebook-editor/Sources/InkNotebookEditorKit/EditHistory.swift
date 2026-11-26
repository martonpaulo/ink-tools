// Undo and redo of the editor's edits, kept on the Mac per note (#328). Our own model: it names
// no tablet call; the write path (#313) sends what it gives and reports back.
import Foundation

/// One edit of a note. Each kind keeps its inverse; a later edit kind adds its case with its own.
public enum NoteEdit: Sendable, Equatable {
    /// Moves the page at `from` to `to`, both counted from 0, as the tablet's page move does.
    case movePage(from: Int, to: Int)
    /// Adds a page of no ink at `at` (from 0, up to the page count) on a system or note template.
    case insertPage(at: Int, template: String)
    /// Removes the page at `at`, from 0; never the last page.
    case removePage(at: Int)
    /// Puts back the page a removal took out at `at`, with its content: the undo of a removal.
    case restorePage(at: Int)
    /// Moves a selection on its page (#325).
    case moveElements(ElementMove)
    /// Inserts a picture, already in Manta greys, at `rect` on `page` (#264).
    case insertPicture(page: Int, file: URL, rect: EditRect)
    /// Inserts a typed text box at `rect` on `page` (#264).
    case insertText(page: Int, text: String, rect: EditRect, fontSize: Int)
    /// Puts `page` back as it was before an insert, from the backup kept before its send: the
    /// undo of an insert, whose new element's number is known only on the tablet (#264).
    case revertInsert(page: Int)

    /// The edit that undoes this one.
    public var inverse: NoteEdit {
        switch self {
        case .movePage(let from, let to): .movePage(from: to, to: from)
        case .insertPage(let at, _): .removePage(at: at)
        case .removePage(let at): .restorePage(at: at)
        case .restorePage(let at): .removePage(at: at)
        case .moveElements(let move): .moveElements(move.inverse)
        case .insertPicture(let page, _, _), .insertText(let page, _, _, _): .revertInsert(page: page)
        // An insert undone is done again by Redo, never by this inverse.
        case .revertInsert(let page): .revertInsert(page: page)
        }
    }

    /// Whether this edit puts back a backup, so the editor names the backup its undo restores.
    public var restoresBackup: Bool {
        switch self {
        case .restorePage, .revertInsert: true
        default: false
        }
    }

    /// Whether the backup kept before this edit's send is what undoes it.
    public var undoneByBackup: Bool {
        switch self {
        case .removePage, .insertPicture, .insertText: true
        default: false
        }
    }

    /// The id an added or restored page shows until the tablet's copy names it.
    static let newPage = "new"

    /// The page order after this edit, `pages` holding each page's id; nil when the edit does not
    /// fit the note: a page outside it, a move to where the page already is, or the removal of
    /// the last page.
    public func apply(to pages: [String]) -> [String]? {
        var changed = pages
        switch self {
        case .movePage(let from, let to):
            guard pages.indices.contains(from), pages.indices.contains(to), from != to else { return nil }
            changed.insert(changed.remove(at: from), at: to)
        case .insertPage(let at, _), .restorePage(let at):
            guard (0...pages.count).contains(at) else { return nil }
            changed.insert(Self.newPage, at: at)
        case .removePage(let at):
            guard pages.indices.contains(at), pages.count > 1 else { return nil }
            changed.remove(at: at)
        case .moveElements(let move):
            // A move keeps the pages; it fits a page of the note and moves something.
            guard pages.indices.contains(move.page), !move.isEmpty else { return nil }
        case .insertPicture(let page, _, _), .insertText(let page, _, _, _), .revertInsert(let page):
            guard pages.indices.contains(page) else { return nil }
        }
        return changed
    }

    /// The page move a list's drag makes: `source` dropped before the row `destination`, both
    /// counted from 0 before the row leaves, as SwiftUI's `onMove` counts them; nil when the page
    /// stays where it is.
    public static func pageDrag(_ source: Int, before destination: Int) -> NoteEdit? {
        let to = destination > source ? destination - 1 : destination
        return to == source ? nil : .movePage(from: source, to: to)
    }
}

/// Where an edit stands on its way to the tablet.
public enum Delivery: Sendable, Equatable {
    /// Drawn on the Mac, waiting for the write path.
    case queued
    /// Handed to the write path, no answer yet.
    case sent
    /// The tablet applied it.
    case applied
}

/// What an undo asks of the write path.
public enum UndoStep: Sendable, Equatable {
    /// The edit was never sent: drop it from the queue.
    case drop(EditID)
    /// The edit was sent or applied: send its inverse as a new edit.
    case send(NoteEdit)
}

/// An edit's place in one note's history.
public struct EditID: Sendable, Hashable {
    let value: Int
}

/// The edits of one open note, newest last, and the edits undone, newest last.
public struct EditHistory: Sendable, Equatable {
    struct Entry: Sendable, Equatable {
        let id: EditID
        let edit: NoteEdit
        var delivery: Delivery
    }

    private(set) var done: [Entry] = []
    private(set) var undone: [NoteEdit] = []
    private var next = 0

    public init() {}

    /// Records a new edit, queued; a new edit empties the redo list, as every Mac app's Undo does.
    @discardableResult
    public mutating func record(_ edit: NoteEdit) -> EditID {
        undone = []
        return push(edit)
    }

    /// The write path handed the edit to the tablet.
    public mutating func sent(_ id: EditID) { set(id, .sent) }

    /// The tablet applied the edit.
    public mutating func applied(_ id: EditID) { set(id, .applied) }

    /// The tablet refused the edit: it leaves the history, and its inverse is what the Mac draws
    /// to take it back (#314). Nil for an edit the history does not hold.
    public mutating func refused(_ id: EditID) -> NoteEdit? {
        guard let index = done.firstIndex(where: { $0.id == id }) else { return nil }
        return done.remove(at: index).edit.inverse
    }

    /// The tablet refused the inverse an undo sent: the note still holds `edit`, so it is done
    /// again, as applied, and leaves the redo list. False when no undone edit is `edit`.
    @discardableResult
    public mutating func restore(_ edit: NoteEdit) -> Bool {
        guard let index = undone.lastIndex(of: edit) else { return false }
        undone.remove(at: index)
        let id = push(edit)
        set(id, .applied)
        return true
    }

    /// Undoes the newest edit: nil with nothing to undo.
    public mutating func undo() -> UndoStep? {
        guard let last = done.popLast() else { return nil }
        undone.append(last.edit)
        return last.delivery == .queued ? .drop(last.id) : .send(last.edit.inverse)
    }

    /// Redoes the newest undone edit, recorded again as queued: nil with nothing to redo.
    public mutating func redo() -> (EditID, NoteEdit)? {
        guard let edit = undone.popLast() else { return nil }
        return (push(edit), edit)
    }

    /// The edit Undo would take back, by its place in the history.
    public var undoID: EditID? { done.last?.id }

    /// The kind of edit Undo would take back, and Redo would do again, for the menu's name.
    public var undoKind: NoteEdit? { done.last?.edit }
    public var redoKind: NoteEdit? { undone.last }

    /// The delivery of an edit still in the history.
    public func delivery(of id: EditID) -> Delivery? {
        done.first { $0.id == id }?.delivery
    }

    private mutating func push(_ edit: NoteEdit) -> EditID {
        let id = EditID(value: next)
        next += 1
        done.append(Entry(id: id, edit: edit, delivery: .queued))
        return id
    }

    private mutating func set(_ id: EditID, _ delivery: Delivery) {
        guard let index = done.firstIndex(where: { $0.id == id }) else { return }
        done[index].delivery = delivery
    }
}
