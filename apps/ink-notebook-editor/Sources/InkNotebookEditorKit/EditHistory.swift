// Undo and redo of the editor's edits, kept on the Mac per note (#328). Our own model: it names
// no tablet call; the write path (#313) sends what it gives and reports back.
import Foundation

/// One edit of a note. Each kind keeps its inverse; a later edit kind adds its case with its own.
public enum NoteEdit: Sendable, Equatable {
    /// Moves the page at `from` to `to`, both counted from 0, as the tablet's page move does.
    case movePage(from: Int, to: Int)

    /// The edit that undoes this one.
    public var inverse: NoteEdit {
        switch self {
        case .movePage(let from, let to): .movePage(from: to, to: from)
        }
    }

    /// The page order after this edit, `pages` holding each page's id; nil when the edit does not
    /// fit the note: a page outside it, or a move to where the page already is.
    public func apply(to pages: [String]) -> [String]? {
        switch self {
        case .movePage(let from, let to):
            guard pages.indices.contains(from), pages.indices.contains(to), from != to else { return nil }
            var moved = pages
            moved.insert(moved.remove(at: from), at: to)
            return moved
        }
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
