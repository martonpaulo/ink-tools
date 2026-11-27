import Foundation
import NoteEditorKit
import Testing

/// Edit without waiting (#314): the queue's rules, and the sender against the fake tablet of the
/// write path's tests.
@Suite final class BackgroundSenderTests {
    static let note = WritePathTests.note
    let folder: URL

    init() throws {
        folder = try WritePathTests.makeFolder("sender-tests")
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    static func nudge(_ step: Int, base: String = "base", number: Int = 4) -> TabletOperation {
        let rect = EditRect(left: 100 + step, top: 200, right: 300 + step, bottom: 400)
        return TabletOperation(
            note: note, baseHash: base, page: 1, change: .placeElements([ElementPlacement(number: number, rect: rect)]))
    }

    @Test func tenNudgesThenAReleaseMakeOneRequest() {
        var queue = EditQueue<Int>()
        for step in 1...10 { queue.nudged(Self.nudge(step, base: "base"), undo: step) }
        #expect(queue.waiting.isEmpty)
        queue.endRun()
        #expect(queue.waiting.count == 1)
        let edit = queue.next()
        #expect(edit?.operation == Self.nudge(10, base: "base"))
        #expect(edit?.undo == 1)
        #expect(queue.next() == nil)
    }

    @Test func aNudgeOfOtherElementsStartsItsOwnRun() {
        var queue = EditQueue<Int>()
        queue.nudged(Self.nudge(1), undo: 1)
        queue.nudged(Self.nudge(2, number: 7), undo: 2)
        queue.endRun()
        #expect(queue.waiting.map(\.undo) == [1, 2])
    }

    @Test func aDrawnEditEndsTheOpenRunFirst() {
        var queue = EditQueue<Int>()
        queue.nudged(Self.nudge(1), undo: 1)
        queue.drew(TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2])), undo: 9)
        #expect(queue.waiting.map(\.undo) == [1, 9])
    }

    @Test func anUndoDropsAWaitingEditAndNotOneThatLeft() {
        var queue = EditQueue<Int>()
        queue.drew(Self.nudge(1), undo: 1)
        queue.nudged(Self.nudge(2, number: 7), undo: 2)
        let waiting = queue.drop(2)
        #expect(waiting)
        #expect(queue.run == nil && queue.waiting.map(\.undo) == [1])
        _ = queue.next()
        let left = queue.drop(1)
        #expect(!left)
        #expect(queue.waiting.isEmpty)
    }

    @Test func onlyTheEditedPageIsRedrawnAfterAPull() {
        #expect(pagesToRedraw(after: Self.nudge(1)) == [1])
        let move = TabletOperation(note: Self.note, baseHash: "h", page: 0, change: .movePage(from: 0, to: 2))
        #expect(pagesToRedraw(after: move) == nil)
    }

    @Test func theMacSendsNoWholePageReadForAnyEditKind() throws {
        let rect = EditRect(left: 0, top: 0, right: 10, bottom: 10)
        let changes: [TabletOperation.Change] = [
            .movePage(from: 0, to: 1), .insertText("a", rect: rect, fontSize: 40),
            .insertPicture(URL(filePath: "/tmp/p.png"), rect: rect),
            .placeElements([ElementPlacement(number: 1, rect: rect)]), .deleteElements([1]),
            .insertPage(template: "style_white"), .removePages([0]),
        ]
        let writes: Set<String> = ["insertElements", "modifyElements", "deleteElements", "insertPage", "removePage"]
        for change in changes {
            let operation = TabletOperation(note: Self.note, baseHash: "h", page: 0, change: change)
            let json =
                try JSONSerialization.jsonObject(with: JSONEncoder().encode(operation.helperOperations))
                as? [[String: Any]]
            let ops = Set((json ?? []).compactMap { $0["op"] as? String })
            #expect(ops.isSubset(of: writes), "\(change) sends \(ops)")
        }
    }

    @Test func aRefusedOperationRevertsTheDrawnEditAndShowsTheMessage() async throws {
        let tablet = WritePathTests.FakeTablet(bytes: Data("base".utf8))
        tablet.failEdit = .failed("device-link edit: no-element: operation 1")
        let copy = folder.appending(path: "copy.note")
        try Data("base".utf8).write(to: copy)
        let outcomes = Outcomes()
        let sender = BackgroundSender<Int>(path: WritePathTests.path(tablet, folder: folder), copy: copy) {
            outcomes.add($0)
        }
        await sender.drew(Self.nudge(1), undo: 42)
        #expect(
            outcomes.all == [
                .started(42),
                .refused(
                    undo: 42,
                    message: WriteFailure.tablet(.failed("device-link edit: no-element: operation 1")).message),
            ])
        #expect(
            outcomes.all.last.map {
                if case .refused(_, let text, _) = $0 { text.contains("no-element") } else { false }
            }
                == true)
    }

    @Test func twoQueuedEditsBothApplyOnTheCopyTheFirstLeft() async throws {
        let tablet = WritePathTests.FakeTablet(bytes: Data("base".utf8))
        let copy = folder.appending(path: "copy.note")
        try Data("base".utf8).write(to: copy)
        let outcomes = Outcomes()
        let sender = BackgroundSender<Int>(path: WritePathTests.path(tablet, folder: folder), copy: copy) {
            outcomes.add($0)
        }
        await sender.nudged(Self.nudge(1), undo: 1)
        await sender.nudged(Self.nudge(2, number: 9), undo: 2)
        await sender.endRun()
        // The backups, oldest first: each send names the one it kept, by its file's name, as the
        // temporary folder reads with and without /private.
        let backups = try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note)
            .reversed().map(\.lastPathComponent)
        let named = outcomes.all.map { outcome in
            if case .applied(let ticket, let redraw, let backup) = outcome {
                return "applied \(ticket) \(redraw ?? []) \(backup.lastPathComponent)"
            }
            return "\(outcome)"
        }
        try #require(backups.count == 2)
        #expect(
            named == [
                "\(SendOutcome<Int>.started(1))", "applied 1 [1] \(backups[0])",
                "\(SendOutcome<Int>.started(2))", "applied 2 [1] \(backups[1])",
            ])
        // The tablet's note is read before the first send only: the second trusts the first's pull.
        #expect(tablet.calls == ["pull", "edit modifyElements", "pull", "edit modifyElements", "pull"])
    }

    /// A sender on a copy the tablet moved past (#317): the copy says "base", the tablet "newer".
    func movedOn(_ outlines: [String: NoteOutline]) throws -> (
        WritePathTests.FakeTablet, Outcomes, BackgroundSender<Int>
    ) {
        let tablet = WritePathTests.FakeTablet(bytes: Data("newer".utf8))
        let copy = folder.appending(path: "copy.note")
        try Data("base".utf8).write(to: copy)
        let outcomes = Outcomes()
        let sender = BackgroundSender<Int>(
            path: WritePathTests.path(tablet, folder: folder, outlines: outlines), copy: copy,
            snapshots: BaseSnapshots(folder: folder.appending(path: "Snapshots"))
        ) { outcomes.add($0) }
        return (tablet, outcomes, sender)
    }

    static func delete(_ number: Int) -> TabletOperation {
        TabletOperation(note: note, baseHash: "base", page: 0, change: .deleteElements([number]))
    }

    static let first = EditRect(left: 0, top: 0, right: 10, bottom: 10)
    static let second = EditRect(left: 50, top: 50, right: 60, bottom: 60)

    /// Each edit keeps its base after a re-targeted send, so the next is re-targeted from it too,
    /// and every page is drawn again from the tablet's newer note.
    @Test func editsOnANewerNoteAreEachRetargetedAndNotRebased() async throws {
        let base = WritePathTests.outline([2: Self.first, 5: Self.second])
        let newer = WritePathTests.outline([3: Self.first, 6: Self.second])
        let (tablet, outcomes, sender) = try movedOn(["base": base, "newer": newer, "neweredited": newer])
        #expect(await sender.base() == "base")
        // Both are queued before the first is sent, as edits made in a quick run are.
        await sender.nudged(Self.delete(2), undo: 1)
        await sender.nudged(Self.delete(5), undo: 2)
        await sender.endRun()
        #expect(tablet.sent.compactMap { $0["nums"] as? [Int] } == [[3], [6]])
        let redraws = outcomes.all.compactMap { outcome -> Set<Int>?? in
            if case .applied(_, let redraw, _) = outcome { return .some(redraw) }
            return nil
        }
        #expect(redraws == [nil, nil])
    }

    @Test func aConflictNamesItsNoteAndALaterEditOnThatBaseJoinsIt() async throws {
        let base = WritePathTests.outline([2: Self.first])
        let newer = WritePathTests.outline([1: Self.first, 4: Self.first])
        let (tablet, outcomes, sender) = try movedOn(["base": base, "newer": newer])
        #expect(await sender.base() == "base")
        await sender.drew(Self.delete(2), undo: 1)
        await sender.drew(Self.delete(2), undo: 2)
        let conflict = try #require(tablet.others.keys.first)
        #expect(tablet.others.count == 1 && tablet.bytes == Data("newer".utf8))
        let message = WriteFailure.conflict(conflict).message
        #expect(message.contains(URL(filePath: conflict).deletingPathExtension().lastPathComponent))
        #expect(message != WriteFailure.restoreConflict(conflict).message)
        #expect(
            outcomes.all == [
                .started(1), .refused(undo: 1, message: message, conflict: conflict), .started(2),
                .refused(undo: 2, message: message, conflict: conflict),
            ])
    }

    final class Outcomes: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [SendOutcome<Int>] = []
        func add(_ outcome: SendOutcome<Int>) { lock.withLock { list.append(outcome) } }
        var all: [SendOutcome<Int>] { lock.withLock { list } }
    }
}
