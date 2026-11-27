import Foundation
import Testing

@testable import NoteFormat

/// Which pages a newer copy of a note changed, so a live window redraws only those (#315).
@Suite struct ChangedPagesTests {
    static func content() throws -> NoteFile {
        try NoteFile(data: try FixtureTests.fixture("content.note"))
    }

    @Test func theSameNoteChangesNoPage() throws {
        let note = try Self.content()
        #expect(NoteDiff.changedPages(note, note) == [])
    }

    @Test func inkWrittenOnOnePageChangesThatPageOnly() throws {
        let note = try Self.content()
        let written = try NoteFile(
            bytes: NoteWriter.drawText(
                note, page: 2, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        #expect(NoteDiff.changedPages(note, written) == [2])
    }

    @Test func aMovedPageRedrawsEveryPage() throws {
        let note = try Self.content()
        let moved = try NoteFile(bytes: NoteWriter.movePage(note, from: 0, to: 2))
        #expect(NoteDiff.changedPages(note, moved) == nil)
    }

    @Test func anotherNoteRedrawsEveryPage() throws {
        let other = try NoteFile(data: try FixtureTests.fixture("templates.note"))
        #expect(NoteDiff.changedPages(try Self.content(), other) == nil)
    }

    // The write path's check of the pages an edit did not touch (#313).
    @Test func anEditOnItsOwnPageLeavesEveryOtherPageKept() throws {
        let note = try Self.content()
        let written = try NoteFile(
            bytes: NoteWriter.drawText(
                note, page: 2, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        #expect(NoteDiff.untouchedChanged(note, written, edited: [2]).isEmpty)
        #expect(NoteDiff.untouchedChanged(note, written, edited: [0]) == [3])
    }

    @Test func aMovedPageIsFoundByItsIdAndCountsAsKept() throws {
        let note = try Self.content()
        let moved = try NoteFile(bytes: NoteWriter.movePage(note, from: 0, to: 2))
        #expect(NoteDiff.untouchedChanged(note, moved, edited: []).isEmpty)
    }

    @Test func aPageThatIsGoneIsNamed() throws {
        let other = try NoteFile(data: try FixtureTests.fixture("templates.note"))
        let note = try Self.content()
        #expect(NoteDiff.untouchedChanged(note, other, edited: []) == Array(1...note.pages.count))
    }
}
