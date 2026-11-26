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
    /// The page Edit › Insert Page… adds next to, while its sheet shows (#329). A sheet that opens
    /// starts on `.loading`, never on the list an earlier sheet read (#451).
    var insertNextTo: Int? {
        didSet { if insertNextTo != nil { templateList = .loading } }
    }
    /// The pages Edit › Delete Page… removes, lowest first, while its confirmation shows (#329).
    var removalAsked: [Int]?
    /// The picture or text an insert waits on, while its sheet shows (#264).
    var insertRequest: InsertRequest?
    /// A restore is running: no edit starts meanwhile.
    private(set) var restoring = false
    /// The templates Insert Page… offers, read from the tablet each time its sheet opens (#451).
    var templateList = TemplateList.loading

    @ObservationIgnored private let path: WritePath
    @ObservationIgnored private let tablet: any TabletWriting
    @ObservationIgnored private let backupStore: NoteBackups
    @ObservationIgnored private var sender: BackgroundSender<Int>?
    @ObservationIgnored private var outcomes: AsyncStream<SendOutcome<Int>>.Continuation?
    @ObservationIgnored private var listener: Task<Void, Never>?
    /// The chain of hand-overs to the sender, so two edits reach it in the order they were made.
    @ObservationIgnored private var handOver: Task<Void, Never>?
    @ObservationIgnored private var nextTicket = 0
    /// The lifted ink of each move or transform on its way, by ticket (#325, #326). Only the first
    /// change of a selection still on its way draws it, through every later change's map.
    private(set) var lifts: [Int: LiftedInk] = [:]
    /// The changes whose ink was not lifted, as an earlier change of their selection was still on its
    /// way: each lifts once that one is applied (#326).
    @ObservationIgnored private var unlifted: Set<Int> = []
    /// Where a turned, resized or moved picture's new file is written (#326).
    @ObservationIgnored var pictureFolder: () throws -> URL = { try PictureImport.folder() }
    /// What each insert on its way shows, by ticket: its picture or its text (#264).
    private(set) var insertImages: [Int: CGImage] = [:]
    /// The open run of nudges: its ticket, until the key is released (#325).
    @ObservationIgnored private var run: Int?
    /// The page whose newest change was a move or a transform with no picture, so its selection
    /// stays; a picture comes back as a new element, so its selection goes.
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
        self.tablet = tablet
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

    /// Removes the pages `at` (each from 0) as one edit and one Undo; never every page (#329).
    @discardableResult
    func removePages(at: [Int]) -> Bool {
        record(.removePages(at: at))
    }

    /// Whether `count` pages may be removed: a note keeps at least one page.
    func canRemove(_ count: Int) -> Bool { canEdit && count > 0 && count < pageCount }

    /// Whether a page may be removed.
    var canRemovePage: Bool { canRemove(1) }

    /// Asks the window to confirm the removal of `pages`; false when they cannot be removed.
    @discardableResult
    func askRemoval(of pages: [Int]) -> Bool {
        guard canRemove(pages.count) else { return false }
        removalAsked = pages
        return true
    }

    /// Whether a page may be added; its sheet reads the tablet's templates (#451).
    var canInsertPage: Bool { canEdit }

    /// What Insert Page… offers: the tablet's templates while it answers, else the note's own.
    enum TemplateList: Equatable {
        case loading
        case tablet([PageTemplateChoice])
        /// The tablet did not answer: the note's own system templates, and why.
        case noteOnly([PageTemplateChoice], reason: String)

        var choices: [PageTemplateChoice] {
            switch self {
            case .loading: []
            case .tablet(let choices), .noteOnly(let choices, _): choices
            }
        }
    }

    /// Reads the tablet's templates for an add next to `page`, its template first; on a failure,
    /// the system templates the note's pages use, each once, with the failure's sentence.
    func loadTemplates(nextTo page: Int) async {
        templateList = .loading
        let style = shown.pages.indices.contains(page) ? shown.pages[page].style : nil
        do {
            templateList = .tablet(TabletTemplates.ordered(try await tablet.templates(), first: style))
        } catch .cancelled {
            // The sheet closed while the list loaded: nothing to show, and no failure.
        } catch {
            templateList = .noteOnly(TabletTemplates.ordered(noteTemplates, first: style), reason: error.words)
        }
    }

    /// The system templates the note's pages use, in page order, each once. A custom template is
    /// left out: the note holds its picture, not the path in `MyStyle/` the tablet takes.
    var noteTemplates: [PageTemplateChoice] {
        var seen = Set<String>()
        return shown.pages.compactMap { $0.style.flatMap(PageTemplate.systemName(ofStyle:)) }
            .filter { seen.insert($0).inserted }.map(PageTemplateChoice.system)
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
        guard !pictureOnItsWay(move.page) else { return false }
        if move.elements.contains(where: \.isPicture) {
            // A picture moves as a new picture file at its new place (#326).
            Task { await send(Self.shift(move), lifted: lifted) }
            return true
        }
        let size = pageSize(move.page)
        let kept = move.clamped(width: size.width, height: size.height)
        guard record(.moveElements(kept)) else { return false }
        if let lifted, let ticket = pending.last?.ticket { lifts[ticket] = lifted }
        return true
    }

    /// One arrow-key nudge of a selection: it joins the open run when it moves the same elements,
    /// so a run is one request and one Undo when the key is released (`endNudges`).
    func nudge(_ elements: [MovedElement], page: Int, dx: Int, dy: Int) {
        guard canEdit, !elements.isEmpty, run != nil || !pictureOnItsWay(page) else { return }
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
        if move.isEmpty || move.elements.contains(where: \.isPicture) {
            pending.remove(at: index)
            lifts[ticket] = nil
            Task { [sender] in _ = await sender?.drop(ticket) }
            // A run that moved a picture is one transform: the picture moves as a new file (#326).
            if !move.isEmpty { Task { await send(Self.shift(move)) } }
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

    /// The moves and transforms on their way to page `index`, one drawing per selection: the ink
    /// the first of its changes lifted, through every change's map in order (#325, #326). A
    /// selection whose first change has not lifted its ink yet draws nothing.
    func liftedChanges(on index: Int) -> [LiftedChange] {
        var changes: [(records: Set<Int>, lifted: LiftedInk?, matrix: PageMatrix)] = []
        for waiting in pending {
            guard let target = ElementChain.target(of: waiting.edit), target.page == index,
                let matrix = ElementChain.matrix(of: waiting.edit)
            else { continue }
            if let at = changes.firstIndex(where: { $0.records == target.records }) {
                changes[at].matrix = changes[at].matrix.then(matrix)
            } else {
                changes.append((target.records, lifts[waiting.ticket], matrix))
            }
        }
        return changes.compactMap { change in
            change.lifted.map { LiftedChange(records: change.records, lifted: $0, matrix: change.matrix) }
        }
    }

    /// The selected `items` of `page` as the moves and transforms on their way leave them (#326).
    func chain(_ items: [Selectable], page: Int) -> ElementChain {
        ElementChain(items.map(MovedElement.init), page: page, after: pending.map(\.edit))
    }

    /// Resizes, rotates or flips the selected `items` of `page` (#326): `change` builds the
    /// transform from the selection as the changes on their way leave it.
    @discardableResult
    func transform(_ items: [Selectable], page: Int, _ change: ([MovedElement]) -> ElementTransform) async -> Bool {
        guard canEdit, !items.isEmpty else { return false }
        return await send(change(chain(items, page: page).elements))
    }

    /// Whether a picture's change is on its way to `page`: the tablet puts a new picture in its
    /// place and deletes the old one, which renumbers the page's elements, so no element change of
    /// the page starts until it is applied. The refusal bar says so.
    private func pictureOnItsWay(_ page: Int) -> Bool {
        let waiting = pictureWaiting(on: page)
        if waiting { refusal = Copy.pictureOnItsWay }
        return waiting
    }

    /// Whether a picture's change is on its way to `page`, for the menu items it holds back.
    func pictureWaiting(on page: Int) -> Bool {
        pending.contains { waiting in
            guard case .transformElements(let transform) = waiting.edit else { return false }
            return transform.page == page && transform.elements.contains(where: \.isPicture)
        }
    }

    /// A move as the transform that shifts its elements by its offset.
    private static func shift(_ move: ElementMove) -> ElementTransform {
        ElementTransform(
            page: move.page, elements: move.elements,
            matrix: PageMatrix(a: 1, b: 0, c: 0, d: 1, tx: Double(move.dx), ty: Double(move.dy)))
    }

    /// Keeps a transform on its page, refuses a turned text box, makes each picture's new file
    /// from the Mac's copy, then draws and sends it. A refusal shows its plain message and changes
    /// nothing. `lifted` is the ink a drag already lifted, for a first change of its selection.
    private func send(_ transform: ElementTransform, lifted: LiftedInk? = nil) async -> Bool {
        guard canEdit, !transform.isEmpty, !pictureOnItsWay(transform.page) else { return false }
        let size = pageSize(transform.page)
        guard let kept = transform.clamped(width: size.width, height: size.height) else {
            refusal = Copy.transformTooLarge
            return false
        }
        guard kept.refusal != .textBoxTurned else {
            refusal = Copy.textBoxTurned
            return false
        }
        var files: [Int: URL] = [:]
        let pictures = Set(kept.elements.filter(\.isPicture).map(\.record))
        if !pictures.isEmpty {
            // Each picture from its box in the Mac's copy, through every change on its way.
            let original = baseElements(kept.page, records: Set(kept.elements.map(\.record)))
            let before = ElementChain(original, page: kept.page, after: pending.map(\.edit))
            let note = shown
            do {
                let folder = try pictureFolder()
                for picture in original where pictures.contains(picture.record) {
                    files[picture.record] =
                        try await PictureImport.transformed(
                            note, page: kept.page, box: picture.box, matrix: before.matrix.then(kept.matrix),
                            folder: folder
                        ).file
                }
            } catch {
                refusal = Copy.pictureNotTransformed
                return false
            }
            guard files.count == pictures.count else {
                refusal = Copy.pictureNotTransformed
                return false
            }
        }
        guard record(.transformElements(kept.with(pictureFiles: files))) else { return false }
        if let lifted, let ticket = pending.last?.ticket, !unlifted.contains(ticket) { lifts[ticket] = lifted }
        return true
    }

    /// The elements `records` of `page` in the Mac's copy, as a selection names them.
    private func baseElements(_ page: Int, records: Set<Int>) -> [MovedElement] {
        ((try? base.elements(page: page)) ?? []).filter { records.contains($0.record) }.map { element in
            MovedElement(
                record: element.record, box: EditRect(element.bounds), points: element.points,
                isArea: element.kind != .stroke, isPicture: element.kind == .picture)
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
        if let target = ElementChain.target(of: edit), let elements = Self.elements(of: edit) {
            // A move or a transform leaves the note as it is: its lifted ink is drawn over the page
            // instead, lifted by the first change of its selection still on its way.
            if pending.dropLast().contains(where: { ElementChain.target(of: $0.edit).map { $0 == target } ?? false }) {
                unlifted.insert(ticket)
            } else {
                lift(target.page, elements, ticket: ticket)
            }
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

    /// The elements a move or a transform starts from.
    private static func elements(of edit: NoteEdit) -> [MovedElement]? {
        switch edit {
        case .moveElements(let move): move.elements
        case .transformElements(let transform): transform.elements
        default: nil
        }
    }

    /// Each change whose ink was not lifted, now the first of its selection on its way, lifts it
    /// from the copy the tablet's answer left (#326).
    private func liftUnlifted() {
        for (offset, waiting) in pending.enumerated() where unlifted.contains(waiting.ticket) {
            guard let target = ElementChain.target(of: waiting.edit), let elements = Self.elements(of: waiting.edit),
                !pending[..<offset].contains(where: { ElementChain.target(of: $0.edit).map { $0 == target } ?? false })
            else { continue }
            unlifted.remove(waiting.ticket)
            lift(target.page, elements, ticket: waiting.ticket)
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
            switch done?.edit {
            case .moveElements(let move): movedPage = move.page
            case .transformElements(let transform) where !transform.elements.contains(where: \.isPicture):
                movedPage = transform.page
            default: movedPage = nil
            }
            if undoWhenApplied.remove(ticket) != nil, let done {
                send(done.edit.inverse, history: nil, backup: backup)
            }
            reloadBase()
            liftUnlifted()
            refreshBackups()
        case .refused(let ticket, let message):
            guard let refused = pending.first(where: { $0.ticket == ticket }) else { return }
            pending.removeAll { $0.ticket == ticket }
            lifts[ticket] = nil
            insertImages[ticket] = nil
            unlifted.remove(ticket)
            liftUnlifted()
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
            // The new page takes the template layer of a page that has its template; with none,
            // the Mac has no picture of it and draws the page blank until the tablet's comes back.
            let choice = PageTemplateChoice.of(value: template)
            let source = note.pages.firstIndex { $0.style.map(choice.matches(style:)) ?? false }
            return try NotePreview.insertingPage(
                note, at: at, like: source ?? min(at, note.pages.count - 1), keepsTemplate: source != nil)
        case .removePages(let at):
            // Highest first, so each number still names its page.
            return try at.sorted(by: >).reduce(note) { try NotePreview.removingPage($0, at: $1) }
        case .restorePages, .revertInsert, .restoreElements:
            guard let backup = waiting.backup else { return note }
            return try NoteFile(data: try Data(contentsOf: backup))
        case .moveElements, .transformElements, .insertPicture, .insertText, .deleteElements:
            // Drawn over the page: a move or a transform from its lifted ink, an insert from its
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

/// One selection's moves and transforms on their way, drawn at once (#325, #326): the ink lifted
/// off the page and the map from where it was to where the changes put it.
struct LiftedChange {
    let records: Set<Int>
    let lifted: LiftedInk
    let matrix: PageMatrix
}
