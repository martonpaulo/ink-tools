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
    /// The picture or text an insert waits on, while its sheet shows (#264).
    var insertRequest: InsertRequest?
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
    /// The lifted ink of each move on its way, by ticket, drawn at its offset (#325).
    private(set) var lifts: [Int: LiftedInk] = [:]
    /// What each insert on its way shows, by ticket: its picture or its text (#264).
    private(set) var insertImages: [Int: CGImage] = [:]
    /// The open run of nudges: its ticket, until the key is released (#325).
    @ObservationIgnored private var run: Int?
    /// The page whose newest change was a move of this editor, so its selection stays.
    private(set) var movedPage: Int?
    /// The backup kept just before each applied page removal: its undo puts that note back (#329).
    @ObservationIgnored private var removalBackups: [EditID: URL] = [:]
    /// Edits undone while on their way whose undo is their backup, sent once the tablet applies them.
    @ObservationIgnored private var undoWhenApplied: Set<Int> = []
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
        endNudges()
        send(edit, history: history.record(edit))
        return true
    }

    /// Moves a selection by a drag, kept on its page (#325): drawn at once from its lifted ink,
    /// `lifted` when the drag already lifted it, sent in the background.
    @discardableResult
    func moveElements(_ move: ElementMove, lifted: LiftedInk? = nil) -> Bool {
        let size = pageSize(move.page)
        let kept = move.clamped(width: size.width, height: size.height)
        guard record(.moveElements(kept)) else { return false }
        if let lifted, let ticket = pending.last?.ticket { lifts[ticket] = lifted }
        return true
    }

    /// One arrow-key nudge of a selection: it joins the open run when it moves the same elements,
    /// so a run is one request and one Undo when the key is released (`endNudges`).
    func nudge(_ elements: [MovedElement], page: Int, dx: Int, dy: Int) {
        guard canEdit, !elements.isEmpty else { return }
        let size = pageSize(page)
        if let ticket = run, let index = pending.firstIndex(where: { $0.ticket == ticket }),
            case .moveElements(let open) = pending[index].edit, open.page == page,
            open.elements.map(\.record) == elements.map(\.record)
        {
            let moved = open.by(dx: dx, dy: dy).clamped(width: size.width, height: size.height)
            pending[index] = Pending(ticket: ticket, edit: .moveElements(moved), history: nil)
            hand(.moveElements(moved), ticket: ticket, nudge: true)
            return
        }
        endNudges()
        let move = ElementMove(page: page, elements: elements, dx: dx, dy: dy)
            .clamped(width: size.width, height: size.height)
        run = send(.moveElements(move), history: nil, nudge: true)
    }

    /// The arrow key was released: the run becomes one edit in the history and one request.
    func endNudges() {
        guard let ticket = run else { return }
        run = nil
        guard let index = pending.firstIndex(where: { $0.ticket == ticket }),
            case .moveElements(let move) = pending[index].edit
        else { return }
        if move.isEmpty {
            pending.remove(at: index)
            lifts[ticket] = nil
            Task { [sender] in _ = await sender?.drop(ticket) }
            return
        }
        pending[index] = Pending(
            ticket: ticket, edit: .moveElements(move), history: history.record(.moveElements(move)))
        let previous = handOver
        handOver = Task { [sender] in
            await previous?.value
            await sender?.endRun()
        }
    }

    /// Inserts a picture already in Manta greys at `rect` on `page`, drawn at once from `image`,
    /// the same picture the tablet gets (#264).
    @discardableResult
    func insertPicture(page: Int, file: URL, rect: EditRect, image: CGImage) -> Bool {
        insert(.insertPicture(page: page, file: file, rect: rect), image: image)
    }

    /// Inserts a typed text box at `rect` on `page`, drawn at once in the system font (#264).
    /// shortcut: the tablet's text box font is not on the Mac, so the drawing differs a little
    /// until the tablet's copy returns.
    @discardableResult
    func insertText(page: Int, text: String, rect: EditRect, fontSize: Int) -> Bool {
        let image = TextPreview.image(
            text, width: rect.right - rect.left, height: rect.bottom - rect.top, fontSize: fontSize)
        return insert(.insertText(page: page, text: text, rect: rect, fontSize: fontSize), image: image)
    }

    private func insert(_ edit: NoteEdit, image: CGImage?) -> Bool {
        guard record(edit) else { return false }
        if let image, let ticket = pending.last?.ticket { insertImages[ticket] = image }
        return true
    }

    /// The inserts on their way to page `index`: each box and what it shows.
    func insertions(on index: Int) -> [(rect: EditRect, image: CGImage)] {
        pending.compactMap { waiting in
            guard let image = insertImages[waiting.ticket] else { return nil }
            switch waiting.edit {
            case .insertPicture(let page, _, let rect) where page == index: return (rect, image)
            case .insertText(let page, _, let rect, _) where page == index: return (rect, image)
            default: return nil
            }
        }
    }

    /// Deletes the selected elements of `page` (#327): drawn at once as the template where they
    /// were, sent in the background; Undo puts them back from the backup kept before the send.
    @discardableResult
    func deleteElements(page: Int, elements: [MovedElement]) -> Bool {
        record(.deleteElements(page: page, elements: elements))
    }

    /// The deletes on their way to page `index`: the template where each selection was.
    func deletions(on index: Int) -> [LiftedInk] {
        pending.compactMap { waiting in
            guard case .deleteElements(let page, _) = waiting.edit, page == index else { return nil }
            return lifts[waiting.ticket]
        }
    }

    /// The moves on their way to page `index`, with their lifted ink once it is ready.
    func moves(on index: Int) -> [(move: ElementMove, lifted: LiftedInk)] {
        pending.compactMap { waiting in
            guard case .moveElements(let move) = waiting.edit, move.page == index, let lifted = lifts[waiting.ticket]
            else { return nil }
            return (move, lifted)
        }
    }

    /// The page's size in pixels, as it is drawn.
    func pageSize(_ index: Int) -> (width: Int, height: Int) {
        let size = shown.pageSize
        guard shown.pages.indices.contains(index) else { return size }
        return shown.pages[index].isHorizontal ? (size.height, size.width) : size
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
                    lifts[waiting.ticket] = nil
                    insertImages[waiting.ticket] = nil
                    redraw()
                } else if waiting.edit.undoneByBackup {
                    // Its backup is named only when the tablet answers: undo it then.
                    undoWhenApplied.insert(waiting.ticket)
                } else {
                    send(waiting.edit.inverse, history: nil)
                }
            }
        case .send(let inverse):
            if inverse.restoresBackup {
                // A removed page and its ink, or the page before an insert, are only in the
                // backup kept just before that edit's send.
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

    @discardableResult
    private func send(_ edit: NoteEdit, history id: EditID?, backup: URL? = nil, nudge: Bool = false) -> Int {
        let ticket = nextTicket
        nextTicket += 1
        pending.append(Pending(ticket: ticket, edit: edit, history: id, backup: backup))
        if case .moveElements(let move) = edit {
            // A move leaves the note as it is: its lifted ink is drawn over the page instead.
            lift(move.page, move.elements, ticket: ticket)
        } else if case .deleteElements(let page, let elements) = edit {
            // A delete too: the template where its elements were is drawn over the page.
            lift(page, elements, ticket: ticket)
        } else {
            redraw()
        }
        hand(edit, ticket: ticket, backup: backup, nudge: nudge)
        return ticket
    }

    /// Hands one edit to the sender, after every edit made before it.
    private func hand(_ edit: NoteEdit, ticket: Int, backup: URL? = nil, nudge: Bool = false) {
        let previous = handOver
        let copy = copy
        let note = tabletPath
        handOver = Task { [sender] in
            await previous?.value
            // The edit was made on the copy as it is now; the sender moves the base forward as
            // each edit ahead of it applies.
            let base = await Self.baseHash(copy)
            guard let operation = TabletOperation(edit, note: note, baseHash: base, backup: backup) else { return }
            if nudge {
                await sender?.nudged(operation, undo: ticket)
            } else {
                await sender?.drew(operation, undo: ticket)
            }
        }
    }

    /// Lifts elements off the page as it is shown, for drawing a move or a delete at once.
    private func lift(_ page: Int, _ elements: [MovedElement], ticket: Int) {
        let note = shown
        Task {
            guard lifts[ticket] == nil,
                let lifted = await LiftedInk.make(note, page: page, items: elements.map(\.selectable))
            else { return }
            if pending.contains(where: { $0.ticket == ticket }) { lifts[ticket] = lifted }
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
                if done?.edit.undoneByBackup == true { removalBackups[id] = backup }
            }
            // shortcut: the lifted ink leaves as the copy comes back, so the page shows its old
            // drawing until the new one is ready; keep it until then if that blink is seen.
            lifts[ticket] = nil
            insertImages[ticket] = nil
            if case .moveElements(let move) = done?.edit { movedPage = move.page } else { movedPage = nil }
            if undoWhenApplied.remove(ticket) != nil, let done {
                send(done.edit.inverse, history: nil, backup: backup)
            }
            reloadBase()
            refreshBackups()
        case .refused(let ticket, let message):
            guard let refused = pending.first(where: { $0.ticket == ticket }) else { return }
            pending.removeAll { $0.ticket == ticket }
            lifts[ticket] = nil
            insertImages[ticket] = nil
            if run == ticket { run = nil }
            // A refused edit left nothing to undo.
            if undoWhenApplied.remove(ticket) != nil {
                redraw()
                return
            }
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
        case .restorePage, .revertInsert, .restoreElements:
            guard let backup = waiting.backup else { return note }
            return try NoteFile(data: try Data(contentsOf: backup))
        case .moveElements, .insertPicture, .insertText, .deleteElements:
            // Drawn over the page: a move from its lifted ink (`moves(on:)`), an insert from its
            // picture or its text (`insertions(on:)`).
            return note
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
