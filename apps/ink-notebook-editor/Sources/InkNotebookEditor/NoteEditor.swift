import CryptoKit
import Foundation
import InkNotebookEditorKit
import NoteFormat
import Observation
import SwiftUI
import os

/// The edits of one note opened from the tablet (#313, #314): Undo and Redo through the history
/// (#328), each edit drawn at once and sent in the background, a refusal taken back with its plain
/// message, and File › Revert to Backup. The window shows the Mac's copy with every edit still on
/// its way applied in order, so a refused or dropped edit only leaves that list: nothing is drawn
/// on a state it was not made for.
@Observable
final class NoteEditor {
    /// One edit on its way to the tablet; `history` is nil for the inverse an undo sends, and
    /// `backup` names the note a page restore puts back.
    struct Pending: Equatable {
        let ticket: Int
        let edit: NoteEdit
        let history: EditID?
        var backup: URL?
    }

    let tabletPath: String
    let copy: URL
    /// The Mac's copy as last read: the base of every edit.
    private(set) var base: NoteFile
    /// The copy with every pending edit applied: what the window draws.
    private(set) var shown: NoteFile
    /// Counts the changes of `shown`, for the window to draw again.
    private(set) var revision = 0
    private(set) var history = EditHistory()
    private(set) var pending: [Pending] = []
    /// The plain message of the newest refusal, until dismissed.
    var refusal: String?
    /// The backups of the note, newest first, for File › Revert to Backup.
    private(set) var backups: [URL] = []
    /// The backup File › Revert to Backup picked, waiting for the window's confirmation.
    var revertCandidate: URL?
    /// The page Edit › Insert Page… adds next to, while its sheet shows (#329).
    var insertNextTo: Int?
    /// The page Edit › Delete Page… removes, while its confirmation shows (#329).
    var removalAsked: Int?
    /// A restore is running: no edit starts meanwhile.
    private(set) var restoring = false

    @ObservationIgnored private let path: WritePath
    @ObservationIgnored private let backupStore: NoteBackups
    @ObservationIgnored private var sender: BackgroundSender<Int>?
    @ObservationIgnored private var outcomes: AsyncStream<SendOutcome<Int>>.Continuation?
    @ObservationIgnored private var listener: Task<Void, Never>?
    /// The chain of hand-overs to the sender, so two edits reach it in the order they were made.
    @ObservationIgnored private var handOver: Task<Void, Never>?
    @ObservationIgnored private var nextTicket = 0
    /// The backup kept just before each applied page removal: its undo puts that note back (#329).
    @ObservationIgnored private var removalBackups: [EditID: URL] = [:]
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.notebookeditor", category: "edit")

    init(tabletPath: String, copy: URL, base: NoteFile, tablet: any TabletWriting, backups: NoteBackups) {
        self.tabletPath = tabletPath
        self.copy = copy
        self.base = base
        self.shown = base
        self.backupStore = backups
        let path = Self.writePath(tablet: tablet, backups: backups)
        self.path = path
        let (stream, continuation) = AsyncStream.makeStream(of: SendOutcome<Int>.self)
        outcomes = continuation
        sender = BackgroundSender(path: path, copy: copy) { continuation.yield($0) }
        listener = Task { [weak self] in
            for await outcome in stream { self?.handle(outcome) }
        }
        refreshBackups()
    }

    isolated deinit {
        outcomes?.finish()
        listener?.cancel()
    }

    /// The editor of a live note's window, on the app's own write path; nil when the backups
    /// folder cannot be made, so no edit can start without its backup.
    static func of(_ live: LiveNote?, note: NoteFile) -> NoteEditor? {
        guard let live, live.watches else { return nil }
        do {
            return NoteEditor(
                tabletPath: live.tabletPath, copy: live.local, base: note, tablet: live.inkctl,
                backups: try NoteBackups.standard())
        } catch {
            Logger(subsystem: "com.martonpaulo.inktools.notebookeditor", category: "edit").error(
                "no backups folder, so no edits: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// The SHA-256 of a copy, in hexadecimal: the base an edit is made on.
    nonisolated static func hash(_ url: URL) throws -> String {
        SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
    }

    /// The app's write path: SHA-256 bases, `NoteWriter.movePage` for the Mac's page move and
    /// `NoteDiff.untouchedChanged` for the check after each pull.
    nonisolated static func writePath(tablet: any TabletWriting, backups: NoteBackups) -> WritePath {
        WritePath(
            tablet: tablet, backups: backups,
            hash: { try hash($0) },
            macWrite: { operation, url in
                switch operation.change {
                case .movePage(let from, let to):
                    return Data(
                        try NoteWriter.movePage(try NoteFile(data: try Data(contentsOf: url)), from: from, to: to))
                case .restoreBackup(let backup):
                    // A backup the reader cannot read is never pushed.
                    let bytes = try Data(contentsOf: backup)
                    _ = try NoteFile(data: bytes)
                    return bytes
                default:
                    throw NoteFormatError.badPage(operation.page)
                }
            },
            untouchedChanged: { before, after, edited in
                NoteDiff.untouchedChanged(
                    try NoteFile(data: try Data(contentsOf: before)), try NoteFile(data: try Data(contentsOf: after)),
                    edited: edited)
            })
    }

    var pageCount: Int { shown.pages.count }

    /// Whether an edit may start: not while a restore runs.
    var canEdit: Bool { !restoring }

    /// Whether Revert to Backup may start: every edit reached the tablet first.
    var canRevert: Bool { pending.isEmpty && !restoring && !backups.isEmpty }

    var canUndo: Bool { canEdit && history.undoKind != nil }
    var canRedo: Bool { canEdit && history.redoKind != nil }

    /// Moves page `from` to the place `to`, both from 0: drawn now, sent in the background. A move
    /// to its own place, or of a page outside the note, records nothing.
    @discardableResult
    func movePage(from: Int, to: Int) -> Bool {
        record(.movePage(from: from, to: to))
    }

    /// Adds a page of no ink at `at` (from 0, up to the page count) on `template` (#329).
    @discardableResult
    func insertPage(at: Int, template: String) -> Bool {
        record(.insertPage(at: at, template: template))
    }

    /// Removes page `at` (from 0); never the last page (#329).
    @discardableResult
    func removePage(at: Int) -> Bool {
        record(.removePage(at: at))
    }

    /// Whether a page may be removed: a note keeps at least one page.
    var canRemovePage: Bool { canEdit && pageCount > 1 }

    /// The templates the note's pages use, in page order, each once: what an added page may take.
    var templates: [String] {
        var seen = Set<String>()
        return shown.pages.compactMap(\.style).filter { seen.insert($0).inserted }
    }

    private func record(_ edit: NoteEdit) -> Bool {
        guard canEdit, edit.apply(to: shown.pages.indices.map(String.init)) != nil else { return false }
        send(edit, history: history.record(edit))
        return true
    }

    func undo() {
        let undone = history.undoID
        guard canEdit, let step = history.undo() else { return }
        switch step {
        case .drop(let id):
            guard let waiting = pending.first(where: { $0.history == id }) else { return }
            Task {
                // An edit that already left is taken back by its inverse, as one the tablet applied.
                if await sender?.drop(waiting.ticket) == true {
                    pending.removeAll { $0.ticket == waiting.ticket }
                    redraw()
                } else {
                    send(waiting.edit.inverse, history: nil)
                }
            }
        case .send(let inverse):
            if case .restorePage = inverse {
                // The page and its ink are only in the backup kept just before the removal.
                guard let id = undone, let backup = removalBackups[id] else { return }
                send(inverse, history: nil, backup: backup)
            } else {
                send(inverse, history: nil)
            }
        }
    }

    func redo() {
        guard canEdit, let (id, edit) = history.redo() else { return }
        send(edit, history: id)
    }

    /// A newer copy from the tablet's watch (#315): the base of what is drawn. An edit still on
    /// its way was made on the old copy, and the write path refuses it.
    func baseChanged(_ newer: NoteFile) {
        base = newer
        redraw()
    }

    /// Replaces the tablet's note with `backup` through the write path (#313). The history starts
    /// over, as no edit before the restore fits the restored note.
    func revert(to backup: URL) async {
        guard canRevert else { return }
        restoring = true
        defer { restoring = false }
        do {
            try await path.restore(backup, note: tabletPath, copy: copy)
            history = EditHistory()
            reloadBase()
        } catch {
            refusal = error.message
        }
        refreshBackups()
    }

    private func send(_ edit: NoteEdit, history id: EditID?, backup: URL? = nil) {
        let ticket = nextTicket
        nextTicket += 1
        pending.append(Pending(ticket: ticket, edit: edit, history: id, backup: backup))
        redraw()
        let previous = handOver
        let copy = copy
        let note = tabletPath
        handOver = Task { [sender] in
            await previous?.value
            // The edit was made on the copy as it is now; the sender moves the base forward as
            // each edit ahead of it applies.
            let base = await Self.baseHash(copy)
            guard let operation = TabletOperation(edit, note: note, baseHash: base, backup: backup) else { return }
            await sender?.drew(operation, undo: ticket)
        }
    }

    @concurrent
    private static func baseHash(_ copy: URL) async -> String {
        // An unreadable copy gives a base no copy has, so the write path refuses the edit.
        (try? hash(copy)) ?? ""
    }

    private func handle(_ outcome: SendOutcome<Int>) {
        switch outcome {
        case .started(let ticket):
            if let id = pending.first(where: { $0.ticket == ticket })?.history { history.sent(id) }
        case .applied(let ticket, _, let backup):
            let done = pending.first { $0.ticket == ticket }
            pending.removeAll { $0.ticket == ticket }
            if let id = done?.history {
                history.applied(id)
                if case .removePage = done?.edit { removalBackups[id] = backup }
            }
            reloadBase()
            refreshBackups()
        case .refused(let ticket, let message):
            guard let refused = pending.first(where: { $0.ticket == ticket }) else { return }
            pending.removeAll { $0.ticket == ticket }
            if let id = refused.history {
                _ = history.refused(id)
            } else {
                history.restore(refused.edit.inverse)
                // A refused page restore leaves the removal done, still undone by its backup.
                if let backup = refused.backup, let id = history.undoID { removalBackups[id] = backup }
            }
            refusal = message
            redraw()
        }
    }

    /// Reads the Mac's copy again, as the write path left it.
    private func reloadBase() {
        do {
            base = try NoteFile(data: try Data(contentsOf: copy))
        } catch {
            logger.error("the copy is unreadable after a send: \(String(describing: error), privacy: .public)")
        }
        redraw()
    }

    /// Draws the copy with every pending edit, in order. A page edit is a new footer, and an added
    /// page one new block, over the same page bytes, so this costs a parse, never a page decode.
    private func redraw() {
        var note = base
        for waiting in pending {
            do {
                note = try Self.drawn(waiting, on: note)
            } catch {
                logger.error("an edit could not be drawn: \(String(describing: error), privacy: .public)")
            }
        }
        shown = note
        revision += 1
    }

    /// `note` with one pending edit, for drawing only.
    nonisolated static func drawn(_ waiting: Pending, on note: NoteFile) throws -> NoteFile {
        switch waiting.edit {
        case .movePage(let from, let to):
            return try NoteFile(bytes: NoteWriter.movePage(note, from: from, to: to))
        case .insertPage(let at, let template):
            // The new page takes the template layer of a page that has its template.
            let source = note.pages.firstIndex { $0.style == template } ?? min(at, note.pages.count - 1)
            return try NotePreview.insertingPage(note, at: at, like: source)
        case .removePage(let at):
            return try NotePreview.removingPage(note, at: at)
        case .restorePage:
            guard let backup = waiting.backup else { return note }
            return try NoteFile(data: try Data(contentsOf: backup))
        }
    }

    private func refreshBackups() {
        do {
            backups = try backupStore.list(for: tabletPath)
        } catch {
            backups = []
            logger.error("the backups are unreadable: \(String(describing: error), privacy: .public)")
        }
    }
}

extension FocusedValues {
    /// The edits of the notebook window in front, for Edit › Undo and Redo, Move Page and
    /// File › Revert to Backup.
    @Entry var noteEditor: NoteEditor?
}

/// The bar over the pages that says why an edit was taken back (#314), as the find bar stands:
/// one sentence and Dismiss, said aloud when it shows.
struct RefusalBar: View {
    let message: String
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .symbolRenderingMode(.multicolor)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(Copy.dismiss, action: dismiss)
        }
        .controlSize(.small)
        .padding(FindBar.inset)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .onAppear { AccessibilityNotification.Announcement(message).post() }
        .onChange(of: message) { _, message in AccessibilityNotification.Announcement(message).post() }
    }
}
