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

    /// The tablet refuses the edit on the conflict note just made: the refusal still names that
    /// note, and the next edit on the base joins it instead of making a second one (#317).
    @Test func aRefusedReplayNamesTheConflictNoteAndTheNextEditJoinsIt() async throws {
        let base = WritePathTests.outline([2: Self.first])
        let newer = WritePathTests.outline([1: Self.first, 4: Self.first])
        let (tablet, outcomes, sender) = try movedOn(["base": base, "newer": newer])
        #expect(await sender.base() == "base")
        tablet.failEdit = .failed("tablet-refused: insert: code 802")
        await sender.drew(Self.delete(2), undo: 1)
        let conflict = try #require(tablet.others.keys.first)
        tablet.failEdit = nil
        await sender.drew(Self.delete(2), undo: 2)
        #expect(tablet.others.count == 1 && tablet.bytes == Data("newer".utf8))
        let refused = WriteFailure.conflictNotApplied(conflict, reason: "tablet-refused: insert: code 802").message
        #expect(
            outcomes.all == [
                .started(1), .refused(undo: 1, message: refused, conflict: conflict), .started(2),
                .refused(undo: 2, message: WriteFailure.conflict(conflict).message, conflict: conflict),
            ])
    }

    /// A clock only the fake tablet moves, so a send's timing is read off it, never off the wall (#530).
    final class ManualClock: @unchecked Sendable {
        private let lock = NSLock()
        private let start = ContinuousClock.now
        private var offset = Duration.zero
        func now() -> ContinuousClock.Instant { lock.withLock { start + offset } }
        func advance(_ by: Duration) { lock.withLock { offset += by } }
    }

    /// The write path's fake tablet, each call taking a set time on the manual clock: a pull 2 s,
    /// a push 1 s and an edit 3 s.
    final class SlowTablet: TabletWriting, @unchecked Sendable {
        let fake: WritePathTests.FakeTablet
        let clock: ManualClock
        static let times: [String: Duration] = ["pull": .seconds(2), "push": .seconds(1), "edit": .seconds(3)]

        init(_ fake: WritePathTests.FakeTablet, clock: ManualClock) {
            self.fake = fake
            self.clock = clock
        }

        func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
            clock.advance(Self.times["edit"] ?? .zero)
            return try await fake.edit(note: note, operations: operations)
        }

        func push(_ local: URL, to note: String) async throws(InkctlFailure) {
            clock.advance(Self.times["push"] ?? .zero)
            try await fake.push(local, to: note)
        }

        func pull(_ note: String, to destination: URL) async throws(InkctlFailure) {
            clock.advance(Self.times["pull"] ?? .zero)
            try await fake.pull(note, to: destination)
        }

        func templates() async throws(InkctlFailure) -> [PageTemplateChoice] {
            try await fake.templates()
        }
    }

    final class Timings: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [SendTiming] = []
        func add(_ timing: SendTiming) { lock.withLock { list.append(timing) } }
        var all: [SendTiming] { lock.withLock { list } }
    }

    @Test func eachSendTimesEveryTabletCallAndTheRestOnTheMac() async throws {
        let fake = WritePathTests.FakeTablet(bytes: Data("base".utf8))
        let clock = ManualClock()
        let timed = TimedTablet(SlowTablet(fake, clock: clock), now: { clock.now() })
        let copy = folder.appending(path: "copy.note")
        try Data("base".utf8).write(to: copy)
        let timings = Timings()
        let sender = BackgroundSender<Int>(
            path: WritePathTests.path(timed, folder: folder), copy: copy, timing: { timings.add($0) },
            outcome: { _ in })
        await sender.drew(Self.nudge(1), undo: 1)
        let timing = try #require(timings.all.count == 1 ? timings.all.first : nil)
        let names = fake.calls.map { $0.hasPrefix("edit") ? "edit" : $0 }
        #expect(!names.isEmpty)
        #expect(timing.steps.map(\.name) == names)
        #expect(timing.steps.map(\.duration) == names.map { SlowTablet.times[$0] ?? .zero })
        // Nothing but the tablet moves the clock, so a wait or poll added to the send shows here
        // only once it reads the clock; the Mac's own work takes no time on it.
        #expect(timing.onMac == .zero)
        #expect(timing.total == names.reduce(Duration.zero) { $0 + (SlowTablet.times[$1] ?? .zero) })
    }

    @Test func aRevertTimesEveryTabletCallAsASendDoes() async throws {
        let fake = WritePathTests.FakeTablet(bytes: Data("now".utf8))
        let clock = ManualClock()
        let timed = TimedTablet(SlowTablet(fake, clock: clock), now: { clock.now() })
        let copy = folder.appending(path: "copy.note")
        try Data("now".utf8).write(to: copy)
        let backup = folder.appending(path: "old.note")
        try Data("old".utf8).write(to: backup)
        let timings = Timings()
        try await WritePathTests.path(timed, folder: folder).restore(
            backup, note: WritePathTests.note, copy: copy, timing: { timings.add($0) })
        let timing = try #require(timings.all.count == 1 ? timings.all.first : nil)
        #expect(timing.steps.map(\.name) == ["pull", "edit", "push", "pull"])
        #expect(timing.total == .seconds(8))
        #expect(timing.waited == .zero)
    }

    /// A send over a tablet that answers at once ends at once by the wall clock: a fixed delay or
    /// poll in the queue fails here, which the manual clock cannot show (#530).
    @Test func aSendOverAnInstantTabletWaitsForNothingElse() async throws {
        let fake = WritePathTests.FakeTablet(bytes: Data("base".utf8))
        let copy = folder.appending(path: "copy.note")
        try Data("base".utf8).write(to: copy)
        let timings = Timings()
        let sender = BackgroundSender<Int>(
            path: WritePathTests.path(fake, folder: folder), copy: copy, timing: { timings.add($0) },
            outcome: { _ in })
        let wall = ContinuousClock()
        let took = await wall.measure { await sender.drew(Self.nudge(1), undo: 1) }
        #expect(timings.all.count == 1)
        // About 10 ms on a laptop; the margin keeps a loaded machine from failing it.
        #expect(took < .milliseconds(1500))
    }

    @Test func aSendTimingReadsAsOneLogLine() {
        let timing = SendTiming(
            waited: .milliseconds(100),
            steps: [
                SendTiming.Step(name: "pull", duration: .seconds(2)),
                SendTiming.Step(name: "edit", duration: .milliseconds(3300)),
            ],
            total: .milliseconds(5500))
        #expect(timing.onMac == .milliseconds(200))
        #expect(timing.line == "waited 0.1 s, pull 2.0 s, edit 3.3 s, on the Mac 0.2 s, total 5.5 s")
    }

    final class Outcomes: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [SendOutcome<Int>] = []
        func add(_ outcome: SendOutcome<Int>) { lock.withLock { list.append(outcome) } }
        var all: [SendOutcome<Int>] { lock.withLock { list } }
    }
}
