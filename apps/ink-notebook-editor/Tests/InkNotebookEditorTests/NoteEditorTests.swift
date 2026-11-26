import Foundation
import InkNotebookEditorKit
import Testing

@testable import InkNotebookEditor
@testable import NoteFormat

/// The app's edits of a note from the tablet (#313, #314, #330): a page move drawn at once, sent
/// through the real write path (SHA-256 bases, `NoteWriter.movePage`, `NoteDiff`) to the fake
/// tablet of the write path's tests, Undo and Redo, a refusal taken back, and Revert to Backup.
@MainActor
@Suite final class NoteEditorTests {
    let folder: URL
    let copy: URL
    let original: Data
    let tablet: WritePathTests.FakeTablet

    init() throws {
        folder = try WritePathTests.makeFolder("note-editor-tests")
        copy = folder.appending(path: "Edit.note")
        original = try Fixtures.data("content.note")
        try original.write(to: copy)
        tablet = WritePathTests.FakeTablet(bytes: original)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    func editor() throws -> NoteEditor {
        NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original), tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
    }

    static func ids(_ note: NoteFile) -> [String] { note.pages.map { $0.metadata["PAGEID"] ?? "" } }

    static func ids(_ data: Data) throws -> [String] { ids(try NoteFile(data: data)) }

    /// Waits until every edit has its answer, at most two seconds.
    func settle(_ editor: NoteEditor) async {
        for _ in 0..<200 where !editor.pending.isEmpty || editor.restoring {
            // timing-independent: a poll on the condition with a deadline; the assertion below fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.pending.isEmpty)
    }

    @Test(arguments: [(0, 3), (3, 0), (1, 2)])
    func aMoveIsDrawnAtOnceAndTheTabletGetsTheSameOrder(from: Int, to: Int) async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        let expected = NoteEdit.movePage(from: from, to: to).apply(to: before)
        #expect(editor.movePage(from: from, to: to))
        // Drawn before the tablet answers.
        #expect(Self.ids(editor.shown) == expected)
        #expect(editor.pending.count == 1)
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == expected)
        #expect(Self.ids(editor.base) == expected)
        #expect(editor.history.undoKind == .movePage(from: from, to: to))
        #expect(tablet.calls == ["edit openNote", "push", "pull"])
    }

    @Test func aMoveToItsOwnPlaceRecordsAndSendsNothing() throws {
        let editor = try editor()
        #expect(!editor.movePage(from: 2, to: 2))
        #expect(!editor.movePage(from: 0, to: 9))
        #expect(editor.pending.isEmpty && editor.history.undoKind == nil)
        #expect(tablet.calls.isEmpty)
    }

    @Test func undoAndRedoGiveTheTabletEachOrderBack() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        editor.movePage(from: 0, to: 2)
        // Undone before it is sent or after: either way the tablet ends with the old order.
        editor.undo()
        await settle(editor)
        #expect(Self.ids(editor.shown) == before)
        #expect(try Self.ids(tablet.bytes) == before)
        #expect(editor.history.redoKind == .movePage(from: 0, to: 2))
        editor.redo()
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == NoteEdit.movePage(from: 0, to: 2).apply(to: before))
        #expect(editor.history.redoKind == nil)
    }

    @Test func aRefusedMoveIsTakenBackWithItsMessageAndTheFirstStays() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        editor.movePage(from: 0, to: 1)
        await settle(editor)
        let first = NoteEdit.movePage(from: 0, to: 1).apply(to: before)
        // The note is open on the tablet now, so the Mac may not write the next move.
        tablet.openNote = WritePathTests.note
        editor.movePage(from: 2, to: 3)
        #expect(Self.ids(editor.shown) != first)
        await settle(editor)
        #expect(Self.ids(editor.shown) == first)
        #expect(try Self.ids(tablet.bytes) == first)
        #expect(editor.refusal == WriteFailure.openOnTablet.message)
        #expect(editor.history.undoKind == .movePage(from: 0, to: 1))
    }

    /// The tablet's own add or delete of a page, as the helper applies it.
    func tabletApplies(_ edit: @escaping @Sendable (NoteFile) throws -> NoteFile) {
        tablet.onEdit = Self.applying(edit)
    }

    /// Built outside the main actor, as the tablet calls it from the sender's.
    nonisolated static func applying(_ edit: @escaping @Sendable (NoteFile) throws -> NoteFile) -> (Data) -> Data {
        { data in (try? NoteFile(data: data)).flatMap { try? edit($0) }.map { Data($0.bytes) } ?? data }
    }

    @Test func anAddedPageIsDrawnAtOnceOnItsTemplateAndUndoneByItsRemoval() async throws {
        let editor = try editor()
        let before = Self.ids(editor.shown)
        let template = try #require(editor.templates.first)
        tabletApplies { @Sendable in try NotePreview.insertingPage($0, at: 1, like: 0) }
        #expect(editor.insertPage(at: 1, template: template))
        #expect(editor.shown.pages.count == before.count + 1)
        #expect(editor.shown.pages[1].style == template)
        await settle(editor)
        #expect(try NoteFile(data: tablet.bytes).pages.count == before.count + 1)
        #expect(tablet.sent.first?["op"] as? String == "insertPage")
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 1) }
        editor.undo()
        await settle(editor)
        #expect(try Self.ids(tablet.bytes) == before)
        #expect(tablet.sent.last?["op"] as? String == "removePage")
    }

    @Test func aDeletedPageComesBackWithItsInkByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 0) }
        #expect(editor.removePage(at: 0))
        #expect(editor.shown.pages.count == 3)
        await settle(editor)
        #expect(try NoteFile(data: tablet.bytes).pages.count == 3)
        editor.undo()
        // Drawn at once from the backup, then pushed back by the Mac's route.
        #expect(editor.shown.pages.count == 4)
        await settle(editor)
        #expect(tablet.bytes == original)
        #expect(tablet.calls.suffix(3) == ["edit openNote", "push", "pull"])
        #expect(editor.history.redoKind == .removePage(at: 0))
    }

    @Test func theLastPageIsNeverDeleted() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in try NotePreview.removingPage($0, at: 0) }
        for _ in 0..<3 {
            #expect(editor.removePage(at: 0))
            await settle(editor)
        }
        #expect(!editor.canRemovePage)
        #expect(!editor.removePage(at: 0))
        #expect(editor.pending.isEmpty && editor.shown.pages.count == 1)
    }

    /// The selection of page 1 of `content.note`: its text box and its picture.
    func selection() throws -> [MovedElement] {
        try NoteFile(data: original).elements(page: 0).map { element in
            MovedElement(
                record: element.record, box: EditRect(element.bounds), points: element.points,
                isArea: element.kind != .stroke)
        }
    }

    @Test func aDraggedSelectionIsDrawnAtOnceAndSentAsOneModify() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let elements = try selection()
        let move = ElementMove(page: 0, elements: elements, dx: 120, dy: -40)
        // The drag lifted the selection's ink: its pixels under the selection, none elsewhere.
        let lifted = try #require(
            await LiftedInk.make(try NoteFile(data: original), page: 0, items: elements.map(\.selectable)))
        #expect(lifted.frame.contains(CGRect(x: 760, y: 1130, width: 300, height: 200)))
        #expect(editor.moveElements(move, lifted: lifted))
        // Drawn from the lifted ink before the tablet answers.
        #expect(editor.moves(on: 0).map(\.move) == [move])
        await settle(editor)
        let sent = tablet.sent.filter { $0["op"] as? String == "modifyElements" }
        #expect(sent.count == elements.count)
        #expect(sent.compactMap { $0["num"] as? Int } == elements.map { $0.record + 1 })
        #expect(editor.history.undoKind == .moveElements(move))
        #expect(editor.movedPage == 0)
    }

    @Test func tenNudgesAreOneRequestAndOneUndo() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let elements = try selection()
        for _ in 0..<10 { editor.nudge(elements, page: 0, dx: 0, dy: 4) }
        #expect(editor.pending.count == 1 && editor.history.undoKind == nil)
        editor.endNudges()
        await settle(editor)
        #expect(
            tablet.calls.filter { $0.hasPrefix("edit") } == [
                "edit " + elements.map { _ in "modifyElements" }.joined(separator: ",")
            ])
        let rects = tablet.sent.compactMap { $0["rect"] as? [String: Int] }
        #expect(rects.first?["top"] == elements[0].box.top + 40)
        #expect(editor.history.undoKind == .moveElements(ElementMove(page: 0, elements: elements, dx: 0, dy: 40)))
        editor.undo()
        await settle(editor)
        #expect(
            tablet.sent.suffix(elements.count).compactMap { ($0["rect"] as? [String: Int])?["top"] }
                == elements.map(\.box.top))
    }

    @Test func aRefusedMoveLeavesTheSelectionInPlaceAndSaysWhy() async throws {
        let editor = try editor()
        tablet.failEdit = .failed("device-link edit: no-element: operation 1")
        #expect(editor.moveElements(ElementMove(page: 0, elements: try selection(), dx: 10, dy: 10)))
        await settle(editor)
        #expect(editor.moves(on: 0).isEmpty && editor.history.undoKind == nil)
        #expect(editor.refusal?.contains("no-element") == true)
    }

    @Test func anInsertedPictureIsDrawnAtOnceSentAsAnElementAndUndoneByItsBackup() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        let picture = try PictureImport.make(try PictureImportTests.colourImage(), folder: folder)
        let rect = EditRect(left: 100, top: 100, right: 500, bottom: 300)
        #expect(editor.insertPicture(page: 1, file: picture.file, rect: rect, image: picture.image))
        #expect(editor.insertions(on: 1).map(\.rect) == [rect])
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "insertElements" })
        let element = try #require((sent["elements"] as? [[String: Any]])?.first)
        #expect(
            element["kind"] as? String == "picture"
                && element["file"] as? String == picture.file.path(percentEncoded: false))
        #expect(
            editor.insertions(on: 1).isEmpty
                && editor.history.undoKind == .insertPicture(page: 1, file: picture.file, rect: rect))
        editor.undo()
        await settle(editor)
        #expect(tablet.bytes == original)
        #expect(tablet.calls.suffix(3) == ["edit openNote", "push", "pull"])
    }

    @Test func pastedTextIsOneTextBoxInTheMiddleOfThePageInBlack() async throws {
        let editor = try editor()
        tabletApplies { @Sendable in $0 }
        #expect(editor.pasteText("Plan\nBuy paper", page: 0))
        await settle(editor)
        let sent = try #require(tablet.sent.first { $0["op"] as? String == "insertElements" })
        let element = try #require((sent["elements"] as? [[String: Any]])?.first)
        #expect(element["kind"] as? String == "text" && element["text"] as? String == "Plan\nBuy paper")
        #expect(element["fontSize"] as? Int == InsertSheet.defaultFontSize)
        // No colour travels with a text box: the tablet sets it in black.
        #expect(element.keys.sorted() == ["fontSize", "kind", "rect", "text"])
        let rect = try #require(element["rect"] as? [String: Int])
        let page = editor.pageSize(0)
        #expect(((rect["left"] ?? 0) + (rect["right"] ?? 0)) / 2 == page.width / 2)
    }

    @Test func aRefusedInsertLeavesThePageAndSaysWhy() async throws {
        let editor = try editor()
        tablet.failEdit = .failed("device-link edit: tablet-refused: operation 1")
        #expect(
            editor.insertText(
                page: 0, text: "Hello", rect: EditRect(left: 0, top: 0, right: 600, bottom: 60), fontSize: 40))
        await settle(editor)
        #expect(editor.insertions(on: 0).isEmpty && editor.history.undoKind == nil)
        #expect(editor.refusal?.contains("tablet-refused") == true)
    }

    @Test func revertToTheOldestBackupGivesTheNoteBackAndStartsUndoOver() async throws {
        let editor = try editor()
        #expect(!editor.canRevert)
        editor.movePage(from: 0, to: 3)
        await settle(editor)
        #expect(editor.canRevert)
        let oldest = try #require(editor.backups.last)
        await editor.revert(to: oldest)
        #expect(tablet.bytes == original)
        #expect(try Data(contentsOf: copy) == original)
        #expect(Self.ids(editor.shown) == (try Self.ids(original)))
        #expect(editor.history.undoKind == nil && editor.refusal == nil)
    }

    @Test func revertWaitsUntilEveryEditReachedTheTablet() async throws {
        let editor = try editor()
        editor.movePage(from: 0, to: 1)
        await settle(editor)
        editor.movePage(from: 1, to: 2)
        #expect(!editor.canRevert)
        await settle(editor)
        #expect(editor.canRevert)
    }
}
