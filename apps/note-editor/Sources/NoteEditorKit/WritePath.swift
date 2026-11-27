// The one write path (#313): every edit reaches the note through the tablet. In order: the
// operation's base must be the note it is sent to, a backup of that note is kept, the tablet
// applies the operation (or, for a page move, takes the Mac's bytes), the Mac pulls the note back,
// and every page the edit did not touch must have kept its bytes. A failure at any step leaves the
// Mac's copy as it was and keeps the backup. When the tablet's note moved on since the edit was
// drawn, the edit is re-targeted at it, or kept in a conflict note beside it (#317).
import Foundation

/// Why a send stopped, each with a plain message.
public enum WriteFailure: Error, Sendable, Equatable {
    /// The Mac's copy is not the one the edit was made on.
    case staleBase
    /// A page move would write the note while it is open on the tablet, whose next save would undo it.
    case openOnTablet
    /// The backup could not be kept, so nothing was sent.
    case backup(String)
    /// The Mac could not write the page move.
    case macWrite(String)
    /// inkctl or the tablet refused or failed, with its words.
    case tablet(InkctlFailure)
    /// The pulled note changed pages the edit did not touch, by number from 1.
    case untouchedPagesChanged([Int])
    /// The tablet's note changed where the edit was, so the edit went to this conflict note, by its
    /// tablet path, and the note keeps the tablet's changes (#317).
    case conflict(String)
    /// A Revert to Backup found the tablet's note changed, so the backup went to this conflict
    /// note, by its tablet path, and the note keeps the tablet's changes (#317).
    case restoreConflict(String)
    /// The note changed on the tablet, so this conflict note, by its tablet path, holds the base,
    /// but the edit could not be applied to it, for `reason` (#317). The note stays on the tablet.
    case conflictNotApplied(String, reason: String)

    /// The conflict note the failure left on the tablet, by its tablet path; nil with none.
    public var conflictNote: String? {
        switch self {
        case .conflict(let path), .restoreConflict(let path), .conflictNotApplied(let path, _): path
        case .staleBase, .openOnTablet, .backup, .macWrite, .tablet, .untouchedPagesChanged: nil
        }
    }
}

/// What the tablet answered to an edit.
public struct EditAnswer: Sendable, Equatable {
    /// The note open on the tablet, nil with none.
    public let openNote: String?

    public init(openNote: String?) {
        self.openNote = openNote
    }
}

/// The tablet calls of the write path; `Inkctl` is the real one.
public protocol TabletWriting: Sendable {
    /// Applies the helper's operations, in a JSON file, to `note`.
    func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer
    /// Replaces `note` with the Mac's file.
    func push(_ local: URL, to note: String) async throws(InkctlFailure)
    func pull(_ note: String, to destination: URL) async throws(InkctlFailure)
    /// The tablet's page templates an added page may take, a read that changes nothing (#451).
    func templates() async throws(InkctlFailure) -> [PageTemplateChoice]
}

/// What a send checked against the tablet's note did (#317).
public enum SendResult: Sendable, Equatable {
    /// The tablet's note took the edit, after a backup; `retargeted` when the note had moved on and
    /// the edit was aimed at its newer pages and elements.
    case applied(backup: URL, retargeted: Bool)
    /// The edit could not be aimed at the newer note, so it went to this conflict note, by its
    /// tablet path; the note itself is untouched.
    case kept(conflict: String)
}

/// What the sender knows of an operation's base when the tablet's note may have moved on (#317).
public struct TabletBase: Sendable, Equatable {
    /// The Mac's copy as the operation saw it; nil when none was kept, so a newer note refuses it.
    public let snapshot: URL?
    /// The edits on the same base already re-targeted and applied, in order: a conflict note starts
    /// from the snapshot, so it takes them again before this one.
    public let sentOnBase: [TabletOperation]
    /// The conflict note an earlier edit on this base made, which later ones join.
    public let conflict: String?

    public init(snapshot: URL?, sentOnBase: [TabletOperation] = [], conflict: String? = nil) {
        self.snapshot = snapshot
        self.sentOnBase = sentOnBase
        self.conflict = conflict
    }
}

public struct WritePath: Sendable {
    let tablet: any TabletWriting
    let backups: NoteBackups
    /// The hash the operation's base is checked against.
    let hash: @Sendable (URL) throws -> String
    /// The Mac's bytes of a page move (`NoteWriter.movePage`), from the copy.
    let macWrite: @Sendable (TabletOperation, URL) throws -> Data
    /// The pages of `before` (by number from 1) that changed in `after` although not in `edited`
    /// (from 0): `NoteDiff.untouchedChanged`, matching pages by their ids.
    let untouchedChanged: @Sendable (_ before: URL, _ after: URL, _ edited: Set<Int>) throws -> [Int]
    /// A note's page ids and element boxes, which a re-target reads (#317).
    let outline: @Sendable (URL) throws -> NoteOutline
    /// The time a conflict note is named by.
    let now: @Sendable () -> Date

    public init(
        tablet: any TabletWriting,
        backups: NoteBackups,
        hash: @escaping @Sendable (URL) throws -> String,
        macWrite: @escaping @Sendable (TabletOperation, URL) throws -> Data,
        untouchedChanged: @escaping @Sendable (URL, URL, Set<Int>) throws -> [Int],
        outline: @escaping @Sendable (URL) throws -> NoteOutline,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.tablet = tablet
        self.backups = backups
        self.hash = hash
        self.macWrite = macWrite
        self.untouchedChanged = untouchedChanged
        self.outline = outline
        self.now = now
    }

    /// Sends one operation made on `copy`, the Mac's copy of the note, trusting that the copy is the
    /// tablet's note, as it is right after a send pulled it; on success `copy` holds the note as
    /// the tablet saved it. Answers the backup kept before the send.
    @discardableResult
    public func send(_ operation: TabletOperation, copy: URL) async throws(WriteFailure) -> URL {
        let found: String
        do {
            found = try hash(copy)
        } catch {
            throw .backup(error.localizedDescription)
        }
        if let refusal = operation.refusal(onBase: found) { throw refusal }
        let work = try makeWork()
        defer { try? FileManager.default.removeItem(at: work) }
        return try await apply(operation, copy: copy, current: copy, work: work)
    }

    /// Sends one operation after reading the tablet's note as it is now (#317). On the operation's
    /// own base it is sent as it is; on a newer note it is re-targeted from `base.snapshot`; when a
    /// target is not found exactly once, the snapshot is pushed beside the note as a conflict note
    /// and takes the edits of that base, and the tablet's note is left as the owner wrote it.
    public func send(_ operation: TabletOperation, copy: URL, base: TabletBase) async throws(WriteFailure)
        -> SendResult
    {
        let work = try makeWork()
        defer { try? FileManager.default.removeItem(at: work) }
        let current = work.appending(path: "current.note")
        do {
            _ = try await tablet.pull(operation.note, to: current)
        } catch {
            throw .tablet(error)
        }
        let found: String
        do {
            found = try hash(current)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
        if found == operation.baseHash {
            return .applied(
                backup: try await apply(operation, copy: copy, current: current, work: work), retargeted: false)
        }
        if let conflict = base.conflict {
            try await replay([operation], on: conflict, work: work)
            return .kept(conflict: conflict)
        }
        guard let snapshot = base.snapshot else { throw .staleBase }
        let retargeted: TabletOperation?
        do {
            retargeted = operation.retargeted(base: try outline(snapshot), current: try outline(current))
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
        if let retargeted {
            return .applied(
                backup: try await apply(retargeted, copy: copy, current: current, work: work), retargeted: true)
        }
        let conflict = ConflictName.path(for: operation.note, at: now())
        do {
            _ = try await tablet.push(snapshot, to: conflict)
        } catch {
            throw .tablet(error)
        }
        try await replay(base.sentOnBase + [operation], on: conflict, work: work)
        return .kept(conflict: conflict)
    }

    /// Restores `backup` as the tablet's note through the same path: the current copy is kept as a
    /// backup first, and the restored note is pulled back and compared byte for byte. When the
    /// tablet's note is no longer the copy, the backup goes beside it as a conflict note instead,
    /// and `restoreConflict` names it (#317).
    public func restore(_ backup: URL, note: String, copy: URL) async throws(WriteFailure) {
        let work = try makeWork()
        defer { try? FileManager.default.removeItem(at: work) }
        let current = work.appending(path: "current.note")
        do {
            _ = try await tablet.pull(note, to: current)
        } catch {
            throw .tablet(error)
        }
        let same: Bool
        do {
            same = try hash(current) == hash(copy)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
        if !same {
            let conflict = ConflictName.path(for: note, at: now())
            do {
                _ = try await tablet.push(backup, to: conflict)
            } catch {
                throw .tablet(error)
            }
            throw .restoreConflict(conflict)
        }
        do {
            try backups.keep(copy, for: note)
        } catch {
            throw .backup(error.localizedDescription)
        }
        try await refuseWhenOpen(note)
        do {
            _ = try await tablet.push(backup, to: note)
        } catch {
            throw .tablet(error)
        }
        let pulled = work.appending(path: "restored.note")
        do {
            _ = try await tablet.pull(note, to: pulled)
        } catch {
            throw .tablet(error)
        }
        guard
            FileManager.default.contentsEqual(
                atPath: pulled.path(percentEncoded: false), andPath: backup.path(percentEncoded: false))
        else {
            throw .tablet(.failed(String(localized: "The tablet's note is not the backup after the restore.")))
        }
        try replace(copy, with: pulled)
    }

    /// Keeps a backup of `current`, the tablet's note before the send, applies the operation and
    /// pulls the note back into `copy`, checking that no other page changed.
    private func apply(_ operation: TabletOperation, copy: URL, current: URL, work: URL) async throws(WriteFailure)
        -> URL
    {
        let backup: URL
        do {
            backup = try backups.keep(current, for: operation.note)
        } catch {
            throw .backup(error.localizedDescription)
        }
        switch operation.route {
        case .tablet:
            try await edit(operation, on: operation.note, work: work)
        case .mac:
            try await refuseWhenOpen(operation.note)
            try await pushMacBytes(operation, from: current, to: operation.note, work: work)
        }
        try await pullAndCheck(operation.note, into: copy, before: current, edited: operation.editedPages, work: work)
        return backup
    }

    /// Applies `operations` in order to the conflict note `note`, which no one has open yet. A
    /// failure names the note, which stays on the tablet either way.
    private func replay(_ operations: [TabletOperation], on note: String, work: URL) async throws(WriteFailure) {
        do {
            try await applyInOrder(operations, on: note, work: work)
        } catch {
            throw .conflictNotApplied(note, reason: error.reason)
        }
    }

    private func applyInOrder(_ operations: [TabletOperation], on note: String, work: URL) async throws(WriteFailure) {
        for operation in operations {
            switch operation.route {
            case .tablet:
                try await edit(operation, on: note, work: work)
            case .mac:
                let local = work.appending(path: "conflict.note")
                try? FileManager.default.removeItem(at: local)
                do {
                    _ = try await tablet.pull(note, to: local)
                } catch {
                    throw .tablet(error)
                }
                try await pushMacBytes(operation, from: local, to: note, work: work)
            }
        }
    }

    private func edit(_ operation: TabletOperation, on note: String, work: URL) async throws(WriteFailure) {
        let file = work.appending(path: "operations.json")
        do {
            try JSONEncoder().encode(operation.helperOperations).write(to: file)
        } catch {
            throw .macWrite(error.localizedDescription)
        }
        do {
            _ = try await tablet.edit(note: note, operations: file)
        } catch {
            throw .tablet(error)
        }
    }

    private func pushMacBytes(_ operation: TabletOperation, from source: URL, to note: String, work: URL)
        async throws(WriteFailure)
    {
        let file = work.appending(path: "written.note")
        do {
            try macWrite(operation, source).write(to: file)
        } catch {
            throw .macWrite(error.localizedDescription)
        }
        do {
            _ = try await tablet.push(file, to: note)
        } catch {
            throw .tablet(error)
        }
    }

    /// A Mac-written note is refused while the tablet has it open: the tablet's next save would
    /// write its own copy over it.
    private func refuseWhenOpen(_ note: String) async throws(WriteFailure) {
        let probe = FileManager.default.temporaryDirectory.appending(path: "open-note-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: probe) }
        do {
            try JSONEncoder().encode([HelperOperation.openNote]).write(to: probe)
        } catch {
            throw .macWrite(error.localizedDescription)
        }
        let answer: EditAnswer
        do {
            answer = try await tablet.edit(note: note, operations: probe)
        } catch {
            throw .tablet(error)
        }
        if answer.openNote == note { throw .openOnTablet }
    }

    private func pullAndCheck(_ note: String, into copy: URL, before: URL, edited: Set<Int>, work: URL)
        async throws(WriteFailure)
    {
        let pulled = work.appending(path: "pulled.note")
        do {
            _ = try await tablet.pull(note, to: pulled)
        } catch {
            throw .tablet(error)
        }
        let stray: [Int]
        do {
            stray = try untouchedChanged(before, pulled, edited)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
        if !stray.isEmpty { throw .untouchedPagesChanged(stray) }
        try replace(copy, with: pulled)
    }

    private func makeWork() throws(WriteFailure) -> URL {
        let work = FileManager.default.temporaryDirectory.appending(path: "write-path-\(UUID().uuidString)")
        do {
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        } catch {
            throw .backup(error.localizedDescription)
        }
        return work
    }

    private func replace(_ copy: URL, with pulled: URL) throws(WriteFailure) {
        do {
            _ = try FileManager.default.replaceItemAt(copy, withItemAt: pulled)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
    }
}
