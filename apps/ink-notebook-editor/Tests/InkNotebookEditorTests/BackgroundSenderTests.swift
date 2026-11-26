import Foundation
import InkNotebookEditorKit
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

    @Test func onlyTheEditedPageIsRedrawnAfterAPull() {
        #expect(pagesToRedraw(after: Self.nudge(1)) == [1])
        #expect(pagesToRedraw(after: TabletOperation(.movePage(from: 0, to: 2), note: Self.note, baseHash: "h")) == nil)
    }

    @Test func theMacSendsNoWholePageReadForAnyEditKind() throws {
        let rect = EditRect(left: 0, top: 0, right: 10, bottom: 10)
        let changes: [TabletOperation.Change] = [
            .movePage(from: 0, to: 1), .insertText("a", rect: rect, fontSize: 40),
            .insertPicture(URL(filePath: "/tmp/p.png"), rect: rect),
            .placeElements([ElementPlacement(number: 1, rect: rect)]), .deleteElements([1]),
            .insertPage(template: "style_white"), .removePage,
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
                .refused(
                    undo: 42,
                    message: WriteFailure.tablet(.failed("device-link edit: no-element: operation 1")).message)
            ])
        #expect(
            outcomes.all.first.map { if case .refused(_, let text) = $0 { text.contains("no-element") } else { false } }
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
        #expect(outcomes.all == [.applied(redraw: [1]), .applied(redraw: [1])])
        #expect(tablet.calls == ["edit modifyElements", "pull", "edit modifyElements", "pull"])
    }

    final class Outcomes: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [SendOutcome<Int>] = []
        func add(_ outcome: SendOutcome<Int>) { lock.withLock { list.append(outcome) } }
        var all: [SendOutcome<Int>] { lock.withLock { list } }
    }
}
