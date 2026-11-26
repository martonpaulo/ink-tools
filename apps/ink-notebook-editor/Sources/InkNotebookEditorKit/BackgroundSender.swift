// Edit without waiting (#314): the Mac draws each edit at once and the tablet catches up in the
// background. A run of edits on the same elements, such as arrow-key nudges, becomes one request
// when the run ends; a refused edit gives back what the editor draws to take it back, with a plain
// message; after a send only the edited page is drawn again. Operations carry element numbers and
// rects from the Mac's own copy, never a read of a page on the tablet.
import Foundation

/// A queued edit: its operation, and what the editor draws to take it back when the tablet refuses.
public struct QueuedEdit<Undo: Sendable & Equatable>: Sendable, Equatable {
    public let operation: TabletOperation
    public let undo: Undo
}

/// What the editor does after the tablet answers.
public enum SendOutcome<Undo: Sendable & Equatable>: Sendable, Equatable {
    /// Draw these pages again, from 0; nil when pages were added, removed or moved: all of them.
    case applied(redraw: Set<Int>?)
    /// Draw `undo` to take the edit back, and show `message`.
    case refused(undo: Undo, message: String)
}

/// The queue between the editor and the write path; pure, so the sender's rules are tested alone.
public struct EditQueue<Undo: Sendable & Equatable>: Sendable, Equatable {
    public private(set) var waiting: [QueuedEdit<Undo>] = []
    /// The open run: its edit so far, joined from each nudge.
    public private(set) var run: QueuedEdit<Undo>?

    public init() {}

    /// The editor drew an edit, sent as it is.
    public mutating func drew(_ operation: TabletOperation, undo: Undo) {
        endRun()
        waiting.append(QueuedEdit(operation: operation, undo: undo))
    }

    /// The editor drew one step of a run, such as a nudge: it joins the open run when both place
    /// the same elements of the same page, keeping the run's first base and undo and the newest
    /// rects; else it ends the open run and starts its own.
    public mutating func nudged(_ operation: TabletOperation, undo: Undo) {
        if let open = run, Self.sameTargets(open.operation, operation) {
            run = QueuedEdit(
                operation: TabletOperation(
                    note: open.operation.note, baseHash: open.operation.baseHash, page: open.operation.page,
                    change: operation.change),
                undo: open.undo)
            return
        }
        endRun()
        run = QueuedEdit(operation: operation, undo: undo)
    }

    /// The run ended, on the key's release or a quiet moment: its one edit is queued.
    public mutating func endRun() {
        guard let open = run else { return }
        waiting.append(open)
        run = nil
    }

    /// The next edit to send, taken off the queue.
    public mutating func next() -> QueuedEdit<Undo>? {
        waiting.isEmpty ? nil : waiting.removeFirst()
    }

    /// The write path applied an edit and the Mac's copy went from `old` to `new`: every queued
    /// edit drawn on `old` is now on `new`. A copy changed by anything else keeps the old base, and
    /// the write path refuses it.
    public mutating func rebase(from old: String, to new: String) {
        waiting = waiting.map { edit in
            guard edit.operation.baseHash == old else { return edit }
            let operation = edit.operation
            return QueuedEdit(
                operation: TabletOperation(
                    note: operation.note, baseHash: new, page: operation.page, change: operation.change),
                undo: edit.undo)
        }
        if let open = run, open.operation.baseHash == old {
            run = QueuedEdit(
                operation: TabletOperation(
                    note: open.operation.note, baseHash: new, page: open.operation.page, change: open.operation.change),
                undo: open.undo)
        }
    }

    /// Two placements of the same elements on the same page of the same note.
    static func sameTargets(_ first: TabletOperation, _ second: TabletOperation) -> Bool {
        guard first.note == second.note, first.page == second.page,
            case .placeElements(let old) = first.change, case .placeElements(let new) = second.change
        else { return false }
        return old.map(\.number) == new.map(\.number)
    }
}

/// The pages to draw again after an operation applied, from 0; nil for all of them.
public func pagesToRedraw(after operation: TabletOperation) -> Set<Int>? {
    switch operation.change {
    case .movePage, .insertPage, .removePage: nil
    default: [operation.page]
    }
}

extension WriteFailure {
    /// The plain message the editor shows when it takes an edit back.
    public var message: String {
        switch self {
        case .staleBase:
            String(
                localized: "The note changed on the tablet, so this edit was taken back. Make it again on the new copy."
            )
        case .openOnTablet:
            String(
                localized:
                    "The note is open on the tablet, so this edit was taken back. Close the note there and try again.")
        case .backup(let reason):
            String(localized: "No backup could be kept, so this edit was taken back: \(reason)")
        case .macWrite(let reason):
            String(localized: "The Mac could not write this edit, so it was taken back: \(reason)")
        case .tablet(let failure):
            String(localized: "The tablet did not apply this edit, so it was taken back: \(failure.words)")
        case .untouchedPagesChanged(let pages):
            String(
                localized:
                    "The tablet changed other pages too (\(pages.map(String.init).joined(separator: ", "))), so the send stopped. Check the note on the tablet."
            )
        }
    }
}

extension InkctlFailure {
    /// inkctl's own words, or what the app knows of the failure.
    var words: String {
        switch self {
        case .missing: String(localized: "inkctl is not installed.")
        case .notConnected(let text), .notFound(let text), .failed(let text): text
        case .cancelled: String(localized: "the send was cancelled.")
        }
    }
}

/// Sends the queue in the background, one edit at a time, and tells the editor each outcome.
public actor BackgroundSender<Undo: Sendable & Equatable> {
    let path: WritePath
    let copy: URL
    let outcome: @Sendable (SendOutcome<Undo>) -> Void
    var queue = EditQueue<Undo>()
    var sending = false

    public init(path: WritePath, copy: URL, outcome: @escaping @Sendable (SendOutcome<Undo>) -> Void) {
        self.path = path
        self.copy = copy
        self.outcome = outcome
    }

    public func drew(_ operation: TabletOperation, undo: Undo) async {
        queue.drew(operation, undo: undo)
        await drain()
    }

    public func nudged(_ operation: TabletOperation, undo: Undo) {
        queue.nudged(operation, undo: undo)
    }

    public func endRun() async {
        queue.endRun()
        await drain()
    }

    /// Sends until the queue is empty; a second call while one sends returns at once.
    func drain() async {
        guard !sending else { return }
        sending = true
        defer { sending = false }
        while let edit = queue.next() {
            do {
                let old = edit.operation.baseHash
                try await path.send(edit.operation, copy: copy)
                if let new = try? path.hash(copy) { queue.rebase(from: old, to: new) }
                outcome(.applied(redraw: pagesToRedraw(after: edit.operation)))
            } catch {
                outcome(.refused(undo: edit.undo, message: error.message))
            }
        }
    }
}
