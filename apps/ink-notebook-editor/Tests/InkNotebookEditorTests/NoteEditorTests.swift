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
