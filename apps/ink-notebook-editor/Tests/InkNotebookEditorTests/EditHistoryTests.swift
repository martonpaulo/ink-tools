import Foundation
import InkNotebookEditorKit
import NoteFormat
import Testing

@testable import InkNotebookEditor

/// Undo and redo of the editor's edits, on the Mac (#328).
@Suite struct EditHistoryTests {
    static let pages = ["P1", "P2", "P3", "P4"]

    @Test(arguments: [(0, 2), (3, 0), (1, 2)])
    func aPageMoveAndItsInverseGiveThePagesBack(from: Int, to: Int) throws {
        let edit = NoteEdit.movePage(from: from, to: to)
        let moved = try #require(edit.apply(to: Self.pages))
        #expect(moved != Self.pages)
        #expect(edit.inverse.apply(to: moved) == Self.pages)
    }

    @Test func aMoveThatDoesNotFitIsRefused() {
        #expect(NoteEdit.movePage(from: 1, to: 1).apply(to: Self.pages) == nil)
        #expect(NoteEdit.movePage(from: 4, to: 0).apply(to: Self.pages) == nil)
        #expect(NoteEdit.movePage(from: 0, to: -1).apply(to: Self.pages) == nil)
    }

    @Test func undoOfAQueuedEditDropsItAndSendsNothing() {
        var history = EditHistory()
        let id = history.record(.movePage(from: 0, to: 2))
        #expect(history.undo() == .drop(id))
        #expect(history.undoKind == nil && history.redoKind == .movePage(from: 0, to: 2))
    }

    @Test func undoOfASentOrAppliedEditSendsItsInverse() {
        var history = EditHistory()
        let first = history.record(.movePage(from: 0, to: 2))
        history.sent(first)
        let second = history.record(.movePage(from: 3, to: 1))
        history.applied(second)
        #expect(history.delivery(of: second) == .applied)
        #expect(history.undo() == .send(.movePage(from: 1, to: 3)))
        #expect(history.undo() == .send(.movePage(from: 2, to: 0)))
        #expect(history.undo() == nil)
    }

    @Test func redoRecordsTheEditAgainAndANewEditEmptiesRedo() {
        var history = EditHistory()
        history.record(.movePage(from: 0, to: 2))
        _ = history.undo()
        let redone = history.redo()
        #expect(redone?.1 == .movePage(from: 0, to: 2))
        #expect(redone.flatMap { history.delivery(of: $0.0) } == .queued)
        _ = history.undo()
        history.record(.movePage(from: 1, to: 3))
        #expect(history.redo() == nil)
    }

    @Test func aRefusedEditLeavesTheHistoryAndGivesItsInverseToDrawBack() {
        var history = EditHistory()
        let kept = history.record(.movePage(from: 0, to: 1))
        let refused = history.record(.movePage(from: 2, to: 3))
        #expect(history.refused(refused) == .movePage(from: 3, to: 2))
        #expect(history.refused(refused) == nil)
        #expect(history.undo() == .drop(kept))
    }

    @Test func aRefusedUndoPutsTheEditBackAsApplied() {
        var history = EditHistory()
        history.record(.movePage(from: 0, to: 2))
        _ = history.undo()
        let restored = history.restore(.movePage(from: 0, to: 2))
        #expect(restored)
        #expect(history.redoKind == nil && history.undoKind == .movePage(from: 0, to: 2))
        #expect(history.undo() == .send(.movePage(from: 2, to: 0)))
        let other = history.restore(.movePage(from: 1, to: 3))
        #expect(!other)
    }

    /// A list's drag counts the destination before the row leaves: dropped before the row after
    /// it, a page stays.
    @Test func aDragInThePageListIsOnePageMove() {
        #expect(NoteEdit.pageDrag(0, before: 4) == .movePage(from: 0, to: 3))
        #expect(NoteEdit.pageDrag(3, before: 0) == .movePage(from: 3, to: 0))
        #expect(NoteEdit.pageDrag(1, before: 1) == nil)
        #expect(NoteEdit.pageDrag(1, before: 2) == nil)
        #expect(NoteEdit.pageDrag(1, before: 3) == .movePage(from: 1, to: 2))
    }

    /// An add and a removal of a page, and their inverses (#329): the page numbers after each, and
    /// the last page never removed.
    @Test func pagesAddedAndRemovedAndTheirInverses() {
        let pages = ["a", "b", "c"]
        #expect(NoteEdit.insertPage(at: 1, template: "style_white").apply(to: pages) == ["a", "new", "b", "c"])
        #expect(NoteEdit.insertPage(at: 3, template: "style_white").apply(to: pages) == ["a", "b", "c", "new"])
        #expect(NoteEdit.insertPage(at: 4, template: "style_white").apply(to: pages) == nil)
        #expect(NoteEdit.removePage(at: 0).apply(to: pages) == ["b", "c"])
        #expect(NoteEdit.removePage(at: 3).apply(to: pages) == nil)
        #expect(NoteEdit.removePage(at: 0).apply(to: ["a"]) == nil)
        #expect(NoteEdit.insertPage(at: 1, template: "style_white").inverse == .removePage(at: 1))
        #expect(NoteEdit.removePage(at: 2).inverse == .restorePage(at: 2))
        #expect(NoteEdit.restorePage(at: 2).inverse == .removePage(at: 2))
        let removed = NoteEdit.removePage(at: 1).apply(to: pages) ?? []
        #expect(NoteEdit.restorePage(at: 1).apply(to: removed)?.count == pages.count)
    }

    /// An insert is undone by the backup kept before its send (#264).
    @Test func anInsertIsUndoneByItsBackup() {
        let rect = EditRect(left: 0, top: 0, right: 10, bottom: 10)
        let picture = NoteEdit.insertPicture(page: 1, file: URL(filePath: "/tmp/p.png"), rect: rect)
        #expect(picture.inverse == .revertInsert(page: 1) && picture.undoneByBackup)
        #expect(NoteEdit.insertText(page: 0, text: "a", rect: rect, fontSize: 40).inverse.restoresBackup)
        #expect(picture.apply(to: ["a", "b"]) == ["a", "b"] && picture.apply(to: ["a"]) == nil)
    }

    /// A delete is undone by the backup kept before its send (#327).
    @Test func aDeleteIsUndoneByItsBackup() {
        let element = MovedElement(record: 3, box: EditRect(left: 0, top: 0, right: 10, bottom: 10))
        let delete = NoteEdit.deleteElements(page: 1, elements: [element])
        #expect(delete.inverse == .restoreElements(page: 1) && delete.undoneByBackup && delete.inverse.restoresBackup)
        #expect(delete.apply(to: ["a", "b"]) == ["a", "b"])
        #expect(NoteEdit.deleteElements(page: 1, elements: []).apply(to: ["a", "b"]) == nil)
    }

    @Test func theMenuNamesTheEdit() {
        var history = EditHistory()
        #expect(Copy.undo(history.undoKind) == Copy.undoBare)
        history.record(.movePage(from: 0, to: 2))
        #expect(Copy.undo(history.undoKind) == "Undo Move Page")
        _ = history.undo()
        #expect(Copy.redo(history.redoKind) == "Redo Move Page")
    }

    /// The written note agrees with the model: a page move then its inverse, written with
    /// NoteWriter, gives the fixture's pages back in order.
    @Test func aWrittenMoveAndItsInverseGiveTheNoteBack() throws {
        let note = try Fixtures.note("content.note")
        let ids = note.pages.map { $0.metadata["PAGEID"] ?? "" }
        let edit = NoteEdit.movePage(from: 0, to: 2)
        guard case .movePage(let from, let to) = edit, case .movePage(let back, let into) = edit.inverse else { return }
        let moved = try NoteFile(bytes: NoteWriter.movePage(note, from: from, to: to))
        #expect(moved.pages.map { $0.metadata["PAGEID"] ?? "" } == edit.apply(to: ids))
        let restored = try NoteFile(bytes: NoteWriter.movePage(moved, from: back, to: into))
        #expect(restored.pages.map { $0.metadata["PAGEID"] ?? "" } == ids)
    }
}
