import Foundation
import InkNotebookEditorKit
import Testing

/// The one write path (#313) against a fake tablet: the operation model, the base check, the
/// backups and the order of the calls. The real tablet is never reached.
@Suite final class WritePathTests {
    static let note = "/storage/emulated/0/Note/Tests/Edit.note"
    let folder: URL

    init() throws {
        folder = try Self.makeFolder("write-path-tests")
    }

    /// A new folder of its own in the temporary folder, which the suite's deinit removes.
    static func makeFolder(_ name: String) throws -> URL {
        let made = FileManager.default.temporaryDirectory.appending(path: "\(name)-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true)
        return made
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A tablet that records each call and holds one note's bytes.
    final class FakeTablet: TabletWriting, @unchecked Sendable {
        var bytes: Data
        var calls: [String] = []
        var sent: [[String: Any]] = []
        var failEdit: InkctlFailure?
        var openNote: String?
        /// What the tablet does to the bytes on an edit, as its save would.
        var onEdit: (Data) -> Data = { $0 + Data("edited".utf8) }

        init(bytes: Data) { self.bytes = bytes }

        func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
            let list = (try? JSONSerialization.jsonObject(with: Data(contentsOf: operations))) as? [[String: Any]] ?? []
            let ops = list.compactMap { $0["op"] as? String }
            calls.append("edit \(ops.joined(separator: ","))")
            if ops != ["openNote"] {
                if let failEdit { throw failEdit }
                sent.append(contentsOf: list)
                bytes = onEdit(bytes)
            }
            return EditAnswer(openNote: openNote)
        }

        func push(_ local: URL, to note: String) async throws(InkctlFailure) {
            calls.append("push")
            bytes = (try? Data(contentsOf: local)) ?? Data()
        }

        func pull(_ note: String, to destination: URL) async throws(InkctlFailure) {
            calls.append("pull")
            try? bytes.write(to: destination)
        }
    }

    func copy(_ text: String = "base") throws -> URL {
        let url = folder.appending(path: "copy.note")
        try Data(text.utf8).write(to: url)
        return url
    }

    func path(_ tablet: FakeTablet, stray: [Int] = [], now: @escaping @Sendable () -> Date = { Date() }) -> WritePath {
        Self.path(tablet, folder: folder, stray: stray, now: now)
    }

    /// The write path over the fake tablet: a copy's hash is its text, and a page move adds `moved`.
    static func path(
        _ tablet: FakeTablet, folder: URL, stray: [Int] = [], now: @escaping @Sendable () -> Date = { Date() }
    ) -> WritePath {
        WritePath(
            tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups"), now: now),
            hash: { url in String(bytes: try Data(contentsOf: url), encoding: .utf8) ?? "" },
            macWrite: { _, url in try Data(contentsOf: url) + Data("moved".utf8) },
            untouchedChanged: { _, _, _ in stray })
    }

    static let rect = EditRect(left: 10, top: 20, right: 110, bottom: 220)

    @Test func eachOperationRecordsItsBaseAndTarget() {
        let operation = TabletOperation(
            note: Self.note, baseHash: "abc", page: 2, change: .insertText("Plan", rect: Self.rect, fontSize: 40))
        #expect(operation.baseHash == "abc")
        #expect(operation.note == Self.note)
        #expect(operation.page == 2)
        #expect(operation.bounds == Self.rect)
        #expect(operation.editedPages == [2])
        #expect(operation.route == .tablet)
        #expect(operation.refusal(onBase: "abc") == nil)
        #expect(operation.refusal(onBase: "def") == .staleBase)
    }

    @Test func aPageMoveFromTheHistoryIsWrittenByTheMacAndTouchesNoPageBytes() throws {
        let operation = try #require(TabletOperation(.movePage(from: 0, to: 2), note: Self.note, baseHash: "h"))
        #expect(operation.route == .mac)
        #expect(operation.change == .movePage(from: 0, to: 2))
        #expect(operation.editedPages.isEmpty)
        #expect(operation.helperOperations.isEmpty)
    }

    /// An add and a removal go to the helper; the undo of a removal is the backup kept before it,
    /// by the Mac's route, and there is none without that backup (#329).
    @Test func pagesAreAddedAndRemovedByTheTabletAndARemovalUndoneByItsBackup() throws {
        let insert = try #require(
            TabletOperation(.insertPage(at: 2, template: "style_white"), note: Self.note, baseHash: "h"))
        #expect(insert.route == .tablet && insert.helperOperations == [.insertPage(page: 2, template: "style_white")])
        let remove = try #require(TabletOperation(.removePage(at: 1), note: Self.note, baseHash: "h"))
        #expect(remove.helperOperations == [.removePage(page: 1)] && remove.editedPages == [1])
        #expect(TabletOperation(.restorePage(at: 1), note: Self.note, baseHash: "h") == nil)
        let backup = URL(filePath: "/tmp/backup.note")
        let restore = try #require(
            TabletOperation(.restorePage(at: 1), note: Self.note, baseHash: "h", backup: backup))
        #expect(restore.route == .mac && restore.change == .restoreBackup(backup))
        #expect(restore.editedPages.isEmpty && restore.helperOperations.isEmpty)
    }

    @Test func theHelperOperationsAreTheJSONTheHelperReads() throws {
        let placements = [ElementPlacement(number: 3, rect: Self.rect), ElementPlacement(number: 5, rect: Self.rect)]
        let operation = TabletOperation(note: Self.note, baseHash: "h", page: 1, change: .placeElements(placements))
        let json =
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(operation.helperOperations)) as? [[String: Any]]
        #expect(json?.count == 2)
        #expect(json?[0]["op"] as? String == "modifyElements")
        #expect(json?[1]["num"] as? Int == 5)
        #expect((json?[0]["rect"] as? [String: Int])?["bottom"] == 220)
        let picture = TabletOperation(
            note: Self.note, baseHash: "h", page: 0,
            change: .insertPicture(URL(filePath: "/tmp/p.png"), rect: Self.rect))
        let element =
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(picture.helperOperations)) as? [[String: Any]]
        let first = (element?[0]["elements"] as? [[String: Any]])?.first
        #expect(first?["kind"] as? String == "picture")
        #expect(first?["file"] as? String == "/tmp/p.png")
    }

    @Test func aSendKeepsABackupThenAppliesThenPullsBack() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        let copy = try copy()
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2]))
        let backup = try await path(tablet).send(operation, copy: copy)
        #expect(tablet.calls == ["edit deleteElements", "pull"])
        #expect(tablet.sent.first?["nums"] as? [Int] == [2])
        #expect(try String(contentsOf: backup, encoding: .utf8) == "base")
        #expect(try String(contentsOf: copy, encoding: .utf8) == "baseedited")
    }

    @Test func anOperationOnAnotherBaseIsRefusedBeforeAnyCall() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        let copy = try copy("newer")
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .removePage)
        await #expect(throws: WriteFailure.staleBase) { try await self.path(tablet).send(operation, copy: copy) }
        #expect(tablet.calls.isEmpty)
        #expect(try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note).isEmpty)
    }

    @Test func aFailingInkctlLeavesTheFileAsItWasAndKeepsTheBackup() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        tablet.failEdit = .notConnected("no tablet on USB")
        let copy = try copy()
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 1, change: .deleteElements([1]))
        await #expect(throws: WriteFailure.tablet(.notConnected("no tablet on USB"))) {
            try await self.path(tablet).send(operation, copy: copy)
        }
        #expect(tablet.bytes == Data("base".utf8))
        #expect(try String(contentsOf: copy, encoding: .utf8) == "base")
        let backups = try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note)
        #expect(backups.count == 1)
        #expect(try String(contentsOf: backups[0], encoding: .utf8) == "base")
    }

    @Test func aChangedUntouchedPageStopsTheSendAndNamesThePage() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        let copy = try copy()
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([1]))
        await #expect(throws: WriteFailure.untouchedPagesChanged([3])) {
            try await self.path(tablet, stray: [3]).send(operation, copy: copy)
        }
        #expect(try String(contentsOf: copy, encoding: .utf8) == "base")
    }

    @Test func aPageMoveIsWrittenByTheMacAndPushedWhenTheNoteIsNotOpen() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        tablet.openNote = "/storage/emulated/0/Note/Other.note"
        let copy = try copy()
        try await path(tablet).send(
            TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .movePage(from: 0, to: 1)), copy: copy)
        #expect(tablet.calls == ["edit openNote", "push", "pull"])
        #expect(try String(contentsOf: copy, encoding: .utf8) == "basemoved")
    }

    @Test func aPageMoveOnTheNoteOpenOnTheTabletIsRefused() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        tablet.openNote = Self.note
        let copy = try copy()
        await #expect(throws: WriteFailure.openOnTablet) {
            try await self.path(tablet).send(
                TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .movePage(from: 0, to: 1)),
                copy: copy)
        }
        #expect(!tablet.calls.contains("push"))
    }

    @Test func theBackupFolderKeepsExactlyTenCopiesAfterElevenSends() async throws {
        let tablet = FakeTablet(bytes: Data("v0".utf8))
        tablet.onEdit = { _ in Data() }
        let copy = try copy("v0")
        let clock = Clock()
        let writer = path(tablet, now: { clock.tick() })
        for index in 0..<11 {
            tablet.onEdit = { _ in Data("v\(index + 1)".utf8) }
            try await writer.send(
                TabletOperation(note: Self.note, baseHash: "v\(index)", page: 0, change: .deleteElements([1])),
                copy: copy)
        }
        let backups = try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note)
        #expect(backups.count == 10)
        #expect(try backups.map { try String(contentsOf: $0, encoding: .utf8) } == (1...10).reversed().map { "v\($0)" })
    }

    @Test func aRestoreKeepsTheCurrentCopyThenPushesTheBackupAndChecksIt() async throws {
        let tablet = FakeTablet(bytes: Data("now".utf8))
        let copy = try copy("now")
        let backup = folder.appending(path: "old.note")
        try Data("old".utf8).write(to: backup)
        try await path(tablet).restore(backup, note: Self.note, copy: copy)
        #expect(tablet.calls == ["edit openNote", "push", "pull"])
        #expect(try String(contentsOf: copy, encoding: .utf8) == "old")
        let kept = try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note)
        #expect(try kept.map { try String(contentsOf: $0, encoding: .utf8) } == ["now"])
    }

    @Test func backupsOfTwoNotesOfOneNameKeepApart() {
        let backups = NoteBackups(folder: folder)
        #expect(backups.folder(for: "/a/X.note") != backups.folder(for: "/b/X.note"))
    }

    /// A clock that moves one millisecond per read, so each backup has its own time.
    final class Clock: @unchecked Sendable {
        private var time = Date(timeIntervalSince1970: 1_800_000_000)
        func tick() -> Date {
            time = time.addingTimeInterval(0.001)
            return time
        }
    }
}
