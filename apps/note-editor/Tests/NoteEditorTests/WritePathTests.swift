import Foundation
import NoteEditorKit
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

    /// A tablet that records each call and holds the note's bytes, and those of each other note
    /// the write path makes, such as a conflict note (#317).
    final class FakeTablet: TabletWriting, @unchecked Sendable {
        var bytes: Data
        /// Every note but `WritePathTests.note`, by its path.
        var others: [String: Data] = [:]
        var calls: [String] = []
        var sent: [[String: Any]] = []
        var failEdit: InkctlFailure?
        var openNote: String?
        /// What the tablet does to the bytes on an edit, as its save would.
        var onEdit: (Data) -> Data = { $0 + Data("edited".utf8) }

        init(bytes: Data) { self.bytes = bytes }

        func read(_ note: String) -> Data {
            note == WritePathTests.note ? bytes : others[note] ?? Data()
        }

        func write(_ data: Data, to note: String) {
            if note == WritePathTests.note { bytes = data } else { others[note] = data }
        }

        func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
            let list = (try? JSONSerialization.jsonObject(with: Data(contentsOf: operations))) as? [[String: Any]] ?? []
            let ops = list.compactMap { $0["op"] as? String }
            calls.append("edit \(ops.joined(separator: ","))")
            if ops != ["openNote"] {
                if let failEdit { throw failEdit }
                sent.append(contentsOf: list)
                write(onEdit(read(note)), to: note)
            }
            return EditAnswer(openNote: openNote)
        }

        func push(_ local: URL, to note: String) async throws(InkctlFailure) {
            calls.append("push")
            write((try? Data(contentsOf: local)) ?? Data(), to: note)
        }

        func pull(_ note: String, to destination: URL) async throws(InkctlFailure) {
            calls.append("pull")
            try? read(note).write(to: destination)
        }

        /// The tablet's templates (#451): `templateList`, or `failTemplates` when set.
        var templateList: [PageTemplateChoice] = [.system("style_white"), .system("style_8mm_lines")]
        var failTemplates: InkctlFailure?

        func templates() async throws(InkctlFailure) -> [PageTemplateChoice] {
            calls.append("templates")
            if let failTemplates { throw failTemplates }
            return templateList
        }
    }

    func copy(_ text: String = "base") throws -> URL {
        let url = folder.appending(path: "copy.note")
        try Data(text.utf8).write(to: url)
        return url
    }

    func path(
        _ tablet: FakeTablet, stray: [Int] = [], outlines: [String: NoteOutline] = [:],
        now: @escaping @Sendable () -> Date = { Date() }
    ) -> WritePath {
        Self.path(tablet, folder: folder, stray: stray, outlines: outlines, now: now)
    }

    /// The write path over the fake tablet: a copy's hash is its text, a page move adds `moved`,
    /// and a note's outline is the one `outlines` holds for its text.
    static func path(
        _ tablet: any TabletWriting, folder: URL, stray: [Int] = [], outlines: [String: NoteOutline] = [:],
        now: @escaping @Sendable () -> Date = { Date() }
    ) -> WritePath {
        WritePath(
            tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups"), now: now),
            hash: { url in String(bytes: try Data(contentsOf: url), encoding: .utf8) ?? "" },
            macWrite: { _, url in try Data(contentsOf: url) + Data("moved".utf8) },
            untouchedChanged: { _, _, _ in stray },
            outline: { url in
                let text = String(bytes: try Data(contentsOf: url), encoding: .utf8) ?? ""
                guard let outline = outlines[text] else { throw CocoaError(.fileReadCorruptFile) }
                return outline
            },
            now: now)
    }

    /// Two pages, `P1` and `P2`, with these element boxes on the first, by number from 1.
    static func outline(_ boxes: [Int: EditRect]) -> NoteOutline {
        NoteOutline(pages: [.init(id: "P1", boxes: boxes), .init(id: "P2", boxes: [:])])
    }

    static let other = EditRect(left: 500, top: 600, right: 700, bottom: 800)

    /// A snapshot of the base, as the sender keeps it, in the suite's folder.
    func snapshot(_ text: String = "base") throws -> URL {
        let url = folder.appending(path: "snapshot.note")
        try Data(text.utf8).write(to: url)
        return url
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
    /// A delete goes to the helper by each element's tablet number, in order (#327).
    @Test func aDeleteNamesEachElementByItsTabletNumber() throws {
        let elements = [9, 2, 5].map { MovedElement(record: $0, box: Self.rect) }
        let delete = try #require(
            TabletOperation(.deleteElements(page: 1, elements: elements), note: Self.note, baseHash: "h"))
        #expect(delete.helperOperations == [.deleteElements(page: 1, nums: [3, 6, 10])])
        #expect(delete.editedPages == [1] && delete.route == .tablet)
        #expect(TabletOperation(.restoreElements(page: 1), note: Self.note, baseHash: "h") == nil)
    }

    @Test func pagesAreAddedAndRemovedByTheTabletAndARemovalUndoneByItsBackup() throws {
        let insert = try #require(
            TabletOperation(.insertPage(at: 2, template: "style_white"), note: Self.note, baseHash: "h"))
        #expect(insert.route == .tablet && insert.helperOperations == [.insertPage(page: 2, template: "style_white")])
        let remove = try #require(TabletOperation(.removePages(at: [1]), note: Self.note, baseHash: "h"))
        #expect(remove.helperOperations == [.removePage(page: 1)] && remove.editedPages == [1])
        // Several pages: one request, highest first, so each number still names its page.
        let several = try #require(TabletOperation(.removePages(at: [0, 3, 1]), note: Self.note, baseHash: "h"))
        #expect(several.helperOperations == [.removePage(page: 3), .removePage(page: 1), .removePage(page: 0)])
        #expect(several.editedPages == [0, 1, 3] && several.page == 0 && several.route == .tablet)
        #expect(TabletOperation(.restorePages(at: [1]), note: Self.note, baseHash: "h") == nil)
        let backup = URL(filePath: "/tmp/backup.note")
        let restore = try #require(
            TabletOperation(.restorePages(at: [1]), note: Self.note, baseHash: "h", backup: backup))
        #expect(restore.route == .mac && restore.change == .restoreBackup(backup))
        #expect(restore.editedPages.isEmpty && restore.helperOperations.isEmpty)
        // An undo that puts one page's content back edits that page (#264).
        let back = try #require(
            TabletOperation(.restoreElements(page: 2), note: Self.note, baseHash: "h", backup: backup))
        #expect(back.change == .restoreBackup(backup, restoresPage: true) && back.editedPages == [2])
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

    @Test func aShapeIsTheGeometryElementTheHelperReads() throws {
        func json(_ element: HelperElement) throws -> [String: Any] {
            try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(element)) as? [String: Any])
        }
        let line = try json(
            .geometry(.line(from: CGPoint(x: 10, y: 20), to: CGPoint(x: 300.4, y: 20)), penColor: .black, penWidth: 400)
        )
        #expect(line["kind"] as? String == "geometry" && line["shape"] as? String == "straightLine")
        #expect(line["points"] as? [[Int]] == [[10, 20], [300, 20]])
        #expect(line.keys.sorted() == ["kind", "penColor", "penWidth", "points", "shape"])
        let corners = [
            CGPoint(x: 100, y: 100), CGPoint(x: 300, y: 100), CGPoint(x: 300, y: 200), CGPoint(x: 100, y: 200),
        ]
        let rectangle = try json(.geometry(.polygon(corners), penColor: .black, penWidth: 400))
        #expect(rectangle["shape"] as? String == "GEO_polygon")
        #expect(rectangle["points"] as? [[Int]] == [[100, 100], [300, 100], [300, 200], [100, 200], [100, 100]])
        let ellipse = try json(
            .geometry(
                .ellipse(center: CGPoint(x: 600, y: 800), horizontal: 200, vertical: 120), penColor: .darkGrey,
                penWidth: 200))
        #expect(ellipse["shape"] as? String == "GEO_ellipse" && ellipse["center"] as? [Int] == [600, 800])
        #expect(ellipse["major"] as? Int == 200 && ellipse["minor"] as? Int == 120 && ellipse["angle"] as? Int == 0)
        #expect(ellipse["penColor"] as? Int == 0x9D)
        let circle = try json(
            .geometry(
                .ellipse(center: CGPoint(x: 600, y: 800), horizontal: 90, vertical: 90), penColor: .black, penWidth: 400
            ))
        #expect(circle["shape"] as? String == "GEO_circle")
        #expect(
            HelperElement.geometry(
                .ellipse(center: CGPoint(x: 600, y: 800), horizontal: 90, vertical: 60), penColor: .black, penWidth: 400
            ).box
                == EditRect(left: 510, top: 740, right: 690, bottom: 860))
    }

    @Test func aShapeOffThePageOrWithTooManyCornersDoesNotFit() {
        let page = CGSize(width: 1920, height: 2560)
        #expect(GeometryShape.line(from: .zero, to: CGPoint(x: 1920, y: 2560)).fits(on: page))
        #expect(!GeometryShape.line(from: CGPoint(x: 10, y: 10), to: CGPoint(x: 10, y: 10)).fits(on: page))
        #expect(!GeometryShape.line(from: CGPoint(x: 10, y: 10), to: CGPoint(x: 2000, y: 10)).fits(on: page))
        let corners = (0..<GeometryShape.maxPolygonPoints).map { CGPoint(x: 10 + $0, y: 10 + $0 % 2) }
        #expect(!GeometryShape.polygon(corners).fits(on: page))
        #expect(GeometryShape.polygon(Array(corners.prefix(63))).fits(on: page))
        #expect(!GeometryShape.polygon(Array(corners.prefix(2))).fits(on: page))
        #expect(!GeometryShape.ellipse(center: CGPoint(x: 100, y: 800), horizontal: 200, vertical: 120).fits(on: page))
        #expect(!GeometryShape.ellipse(center: CGPoint(x: 600, y: 800), horizontal: 0, vertical: 120).fits(on: page))
        #expect(
            GeometryShape.ellipse(center: CGPoint(x: 1200, y: 800), horizontal: 1000, vertical: 100)
                .fits(on: CGSize(width: 2560, height: 1920)))
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
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .removePages([0]))
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
        #expect(tablet.calls == ["pull", "edit openNote", "push", "pull"])
        #expect(try String(contentsOf: copy, encoding: .utf8) == "old")
        let kept = try NoteBackups(folder: folder.appending(path: "Backups")).list(for: Self.note)
        #expect(try kept.map { try String(contentsOf: $0, encoding: .utf8) } == ["now"])
    }

    // The tablet's note read before the send (#317).

    @Test func onItsOwnBaseTheTabletsNoteTakesTheEditAsItIs() async throws {
        let tablet = FakeTablet(bytes: Data("base".utf8))
        let copy = try copy()
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2]))
        let result = try await path(tablet).send(operation, copy: copy, base: TabletBase(snapshot: nil))
        guard case .applied(_, let retargeted) = result else {
            Issue.record("\(result)")
            return
        }
        #expect(!retargeted)
        #expect(tablet.calls == ["pull", "edit deleteElements", "pull"])
        #expect(try String(contentsOf: copy, encoding: .utf8) == "baseedited")
    }

    /// The owner deleted an earlier stroke on the tablet: the target is found by its box and sent
    /// by its new number, and the Mac's copy becomes the tablet's newer note.
    @Test func onANewerNoteThatHoldsTheTargetTheEditIsSentByItsNewNumber() async throws {
        let tablet = FakeTablet(bytes: Data("newer".utf8))
        let copy = try copy()
        let outlines = ["base": Self.outline([1: Self.other, 2: Self.rect]), "newer": Self.outline([1: Self.rect])]
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2]))
        let result = try await path(tablet, outlines: outlines).send(
            operation, copy: copy, base: TabletBase(snapshot: try snapshot()))
        guard case .applied(let backup, let retargeted) = result else {
            Issue.record("\(result)")
            return
        }
        #expect(retargeted)
        #expect(tablet.sent.first?["nums"] as? [Int] == [1])
        #expect(try String(contentsOf: backup, encoding: .utf8) == "newer")
        #expect(try String(contentsOf: copy, encoding: .utf8) == "neweredited")
    }

    /// Two elements with the target's box: never a guess, so the base goes beside the note as a
    /// conflict note, takes the edits of that base in order, and the tablet's note is untouched.
    @Test func onANewerNoteWithoutOneMatchBothCopiesAreKept() async throws {
        let tablet = FakeTablet(bytes: Data("newer".utf8))
        let copy = try copy()
        let outlines = ["base": Self.outline([2: Self.rect]), "newer": Self.outline([1: Self.rect, 2: Self.rect])]
        let clock = Date(timeIntervalSince1970: 1_800_000_000)
        let earlier = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([7]))
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2]))
        let result = try await path(tablet, outlines: outlines, now: { clock }).send(
            operation, copy: copy, base: TabletBase(snapshot: try snapshot(), sentOnBase: [earlier]))
        let conflict = ConflictName.path(for: Self.note, at: clock)
        #expect(result == .kept(conflict: conflict))
        #expect(tablet.calls == ["pull", "push", "edit deleteElements", "edit deleteElements"])
        #expect(tablet.sent.compactMap { $0["nums"] as? [Int] } == [[7], [2]])
        #expect(tablet.bytes == Data("newer".utf8))
        #expect(tablet.others[conflict] == Data("baseeditededited".utf8))
        #expect(try String(contentsOf: copy, encoding: .utf8) == "base")
        // A later edit on that base joins the same conflict note.
        let later = try await path(tablet, outlines: outlines).send(
            operation, copy: copy, base: TabletBase(snapshot: try snapshot(), conflict: conflict))
        #expect(later == .kept(conflict: conflict))
        #expect(tablet.bytes == Data("newer".utf8) && tablet.others.count == 1)
    }

    /// The tablet refuses the edit on a conflict note the write path just made, as it did for a
    /// rect off the page on the Manta: the note stays on the tablet, so the failure names it, and
    /// the tablet's note is untouched.
    @Test func aRefusedReplayStillNamesTheConflictNoteItMade() async throws {
        let tablet = FakeTablet(bytes: Data("newer".utf8))
        tablet.failEdit = .failed("tablet-refused: operation 1 (insertElements): insert: code 802")
        let copy = try copy()
        let outlines = ["base": Self.outline([2: Self.rect]), "newer": Self.outline([1: Self.rect, 2: Self.rect])]
        let clock = Date(timeIntervalSince1970: 1_800_000_000)
        let conflict = ConflictName.path(for: Self.note, at: clock)
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .deleteElements([2]))
        let failure = WriteFailure.conflictNotApplied(
            conflict, reason: "tablet-refused: operation 1 (insertElements): insert: code 802")
        await #expect(throws: failure) {
            try await self.path(tablet, outlines: outlines, now: { clock }).send(
                operation, copy: copy, base: TabletBase(snapshot: try self.snapshot()))
        }
        #expect(tablet.others[conflict] == Data("base".utf8))
        #expect(tablet.bytes == Data("newer".utf8))
        #expect(failure.conflictNote == conflict)
        #expect(failure.message.contains(URL(filePath: conflict).deletingPathExtension().lastPathComponent))
        // An edit that joins that conflict note and fails names it too.
        await #expect(throws: failure) {
            try await self.path(tablet, outlines: outlines).send(
                operation, copy: copy, base: TabletBase(snapshot: try self.snapshot(), conflict: conflict))
        }
    }

    /// The loss #317 closes: a page move drawn before a pen change is written from the tablet's
    /// newer note, never from the Mac's older copy.
    @Test func aPageMoveOnANewerNoteIsWrittenFromItNeverOverIt() async throws {
        let tablet = FakeTablet(bytes: Data("newer".utf8))
        let copy = try copy()
        let outlines = ["base": Self.outline([:]), "newer": Self.outline([1: Self.rect])]
        let operation = TabletOperation(note: Self.note, baseHash: "base", page: 0, change: .movePage(from: 0, to: 1))
        let result = try await path(tablet, outlines: outlines).send(
            operation, copy: copy, base: TabletBase(snapshot: try snapshot()))
        guard case .applied(_, true) = result else {
            Issue.record("\(result)")
            return
        }
        #expect(tablet.calls == ["pull", "edit openNote", "push", "pull"])
        #expect(tablet.bytes == Data("newermoved".utf8))
        // Without the base's snapshot, nothing is pushed.
        let stale = FakeTablet(bytes: Data("newer".utf8))
        await #expect(throws: WriteFailure.staleBase) {
            try await self.path(stale, outlines: outlines).send(operation, copy: copy, base: TabletBase(snapshot: nil))
        }
        #expect(stale.calls == ["pull"])
    }

    @Test func aRestoreOverANewerNoteGoesBesideItAsAConflictNote() async throws {
        let tablet = FakeTablet(bytes: Data("newer".utf8))
        let copy = try copy("now")
        let backup = folder.appending(path: "old.note")
        try Data("old".utf8).write(to: backup)
        let clock = Date(timeIntervalSince1970: 1_800_000_000)
        let conflict = ConflictName.path(for: Self.note, at: clock)
        await #expect(throws: WriteFailure.restoreConflict(conflict)) {
            try await self.path(tablet, now: { clock }).restore(backup, note: Self.note, copy: copy)
        }
        #expect(tablet.bytes == Data("newer".utf8))
        #expect(tablet.others[conflict] == Data("old".utf8))
        #expect(try String(contentsOf: copy, encoding: .utf8) == "now")
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
