// The one write path (#313): every edit reaches the note through the tablet. In order: the
// operation's base must be the Mac's copy, a backup of that copy is kept, the tablet applies the
// operation (or, for a page move, takes the Mac's bytes), the Mac pulls the note back, and every
// page the edit did not touch must have kept its bytes. A failure at any step leaves the Mac's
// copy as it was and keeps the backup.
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

    public init(
        tablet: any TabletWriting,
        backups: NoteBackups,
        hash: @escaping @Sendable (URL) throws -> String,
        macWrite: @escaping @Sendable (TabletOperation, URL) throws -> Data,
        untouchedChanged: @escaping @Sendable (URL, URL, Set<Int>) throws -> [Int]
    ) {
        self.tablet = tablet
        self.backups = backups
        self.hash = hash
        self.macWrite = macWrite
        self.untouchedChanged = untouchedChanged
    }

    /// Sends one operation made on `copy`, the Mac's copy of the note; on success `copy` holds the
    /// note as the tablet saved it. Answers the backup kept before the send.
    @discardableResult
    public func send(_ operation: TabletOperation, copy: URL) async throws(WriteFailure) -> URL {
        let found: String
        do {
            found = try hash(copy)
        } catch {
            throw .backup(error.localizedDescription)
        }
        if let refusal = operation.refusal(onBase: found) { throw refusal }
        let backup: URL
        do {
            backup = try backups.keep(copy, for: operation.note)
        } catch {
            throw .backup(error.localizedDescription)
        }
        let work = FileManager.default.temporaryDirectory.appending(path: "write-path-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: work) }
        do {
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        } catch {
            throw .backup(error.localizedDescription)
        }
        switch operation.route {
        case .tablet:
            let file = work.appending(path: "operations.json")
            do {
                try JSONEncoder().encode(operation.helperOperations).write(to: file)
            } catch {
                throw .macWrite(error.localizedDescription)
            }
            do {
                _ = try await tablet.edit(note: operation.note, operations: file)
            } catch {
                throw .tablet(error)
            }
        case .mac:
            try await pushMacBytes(operation, copy: copy, work: work)
        }
        try await pullAndCheck(operation.note, into: copy, edited: operation.editedPages, work: work)
        return backup
    }

    /// Restores `backup` as the tablet's note through the same path: the current copy is kept as a
    /// backup first, and the restored note is pulled back and compared byte for byte.
    public func restore(_ backup: URL, note: String, copy: URL) async throws(WriteFailure) {
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
        let pulled = FileManager.default.temporaryDirectory.appending(path: "restore-\(UUID().uuidString).note")
        defer { try? FileManager.default.removeItem(at: pulled) }
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

    private func pushMacBytes(_ operation: TabletOperation, copy: URL, work: URL) async throws(WriteFailure) {
        try await refuseWhenOpen(operation.note)
        let file = work.appending(path: "written.note")
        do {
            try macWrite(operation, copy).write(to: file)
        } catch {
            throw .macWrite(error.localizedDescription)
        }
        do {
            _ = try await tablet.push(file, to: operation.note)
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

    private func pullAndCheck(_ note: String, into copy: URL, edited: Set<Int>, work: URL) async throws(WriteFailure) {
        let pulled = work.appending(path: "pulled.note")
        do {
            _ = try await tablet.pull(note, to: pulled)
        } catch {
            throw .tablet(error)
        }
        let stray: [Int]
        do {
            stray = try untouchedChanged(copy, pulled, edited)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
        if !stray.isEmpty { throw .untouchedPagesChanged(stray) }
        try replace(copy, with: pulled)
    }

    private func replace(_ copy: URL, with pulled: URL) throws(WriteFailure) {
        do {
            _ = try FileManager.default.replaceItemAt(copy, withItemAt: pulled)
        } catch {
            throw .tablet(.failed(error.localizedDescription))
        }
    }
}
