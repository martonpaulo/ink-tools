import Foundation
import NoteEditorKit
import Testing

/// An edit sent after the owner changed the note on the tablet (#317): each operation kind is aimed
/// at the same pages and elements of the newer note, or refused so both copies are kept.
@Suite struct RetargetTests {
    static let note = "/storage/emulated/0/Note/Tests/a.note"
    static let a = EditRect(left: 100, top: 100, right: 200, bottom: 150)
    static let b = EditRect(left: 300, top: 100, right: 400, bottom: 150)
    static let c = EditRect(left: 500, top: 100, right: 600, bottom: 150)
    static let d = EditRect(left: 700, top: 900, right: 800, bottom: 950)

    /// Pages P1 and P2; P1 holds a, b and c as elements 1 to 3.
    static let base = NoteOutline(pages: [
        .init(id: "P1", boxes: [1: a, 2: b, 3: c]), .init(id: "P2", boxes: [1: d]),
    ])

    static func operation(page: Int = 0, _ change: TabletOperation.Change) -> TabletOperation {
        TabletOperation(note: note, baseHash: "base", page: page, change: change)
    }

    @Test func onTheSameNoteEveryOperationIsUnchanged() {
        let changes: [TabletOperation.Change] = [
            .deleteElements([2]), .placeElements([ElementPlacement(number: 3, rect: Self.d)]),
            .insertText("x", rect: Self.d, fontSize: 40), .insertPage(template: "style_white"),
            .removePages([1]), .movePage(from: 0, to: 1),
        ]
        for change in changes {
            let operation = Self.operation(change)
            #expect(operation.retargeted(base: Self.base, current: Self.base) == operation)
        }
    }

    @Test func anEarlierStrokeDeletedOnTheTabletShiftsTheNumberDown() {
        let current = NoteOutline(pages: [.init(id: "P1", boxes: [1: Self.b, 2: Self.c]), Self.base.pages[1]])
        let operation = Self.operation(.deleteElements([3]))
        #expect(operation.retargeted(base: Self.base, current: current)?.change == .deleteElements([2]))
        let move = Self.operation(.placeElements([ElementPlacement(number: 2, rect: Self.d)]))
        #expect(
            move.retargeted(base: Self.base, current: current)?.change
                == .placeElements([ElementPlacement(number: 1, rect: Self.d)]))
    }

    @Test func twoElementsWithTheSameBoxAreNeverGuessed() {
        let current = NoteOutline(pages: [.init(id: "P1", boxes: [1: Self.a, 2: Self.b, 3: Self.c, 4: Self.b])])
        #expect(Self.operation(.deleteElements([2])).retargeted(base: Self.base, current: current) == nil)
    }

    @Test func aTargetErasedOnTheTabletKeepsBothCopies() {
        let current = NoteOutline(pages: [.init(id: "P1", boxes: [1: Self.a, 2: Self.c])])
        #expect(Self.operation(.deleteElements([2])).retargeted(base: Self.base, current: current) == nil)
        let transform = Self.operation(.transformElements([.strokes([1, 2], PageMatrix.identity)]))
        #expect(transform.retargeted(base: Self.base, current: current) == nil)
    }

    @Test func aPageAddedBeforeTheEditedPageMovesTheEditByItsId() {
        let current = NoteOutline(pages: [.init(id: "P0", boxes: [:])] + Self.base.pages)
        let text = Self.operation(page: 1, .insertText("x", rect: Self.d, fontSize: 40))
        #expect(text.retargeted(base: Self.base, current: current)?.page == 2)
        let delete = Self.operation(.transformElements([.textBox(number: 2, rect: Self.d)]))
        let moved = delete.retargeted(base: Self.base, current: current)
        #expect(moved?.page == 1 && moved?.change == .transformElements([.textBox(number: 2, rect: Self.d)]))
        #expect(
            Self.operation(.removePages([1])).retargeted(base: Self.base, current: current)?.change == .removePages([2])
        )
        let move = Self.operation(.movePage(from: 0, to: 1)).retargeted(base: Self.base, current: current)
        #expect(move?.page == 1 && move?.change == .movePage(from: 1, to: 2))
        let append = Self.operation(page: 2, .insertPage(template: "style_white"))
        #expect(append.retargeted(base: Self.base, current: current)?.page == 3)
    }

    @Test func aPageRemovedOnTheTabletKeepsBothCopies() {
        let current = NoteOutline(pages: [Self.base.pages[0]])
        #expect(
            Self.operation(page: 1, .insertText("x", rect: Self.d, fontSize: 40))
                .retargeted(base: Self.base, current: current) == nil)
        #expect(Self.operation(.removePages([0, 1])).retargeted(base: Self.base, current: current) == nil)
    }

    @Test func aRestoreIsNeverPushedOverANewerNote() {
        let restore = Self.operation(.restoreBackup(URL(filePath: "/tmp/backup.note")))
        #expect(restore.retargeted(base: Self.base, current: Self.base) == nil)
    }

    @Test func theConflictNoteSitsBesideTheNoteWithItsTime() throws {
        let date = Date(timeIntervalSince1970: 1_795_759_677)
        let utc = try #require(TimeZone(identifier: "UTC"))
        #expect(
            ConflictName.path(for: Self.note, at: date, timeZone: utc)
                == "/storage/emulated/0/Note/Tests/a conflict 2026-11-27 06.07.57.note")
    }
}
