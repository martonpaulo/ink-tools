import Foundation
import InkNotebookEditorKit
import NoteFormat
import Testing

@testable import InkNotebookEditor

/// The watch of a note opened from the tablet (#315).
@Suite struct NoteWatchTests {
    static let first = NoteStamp(bytes: 377_142, modified: "2026-11-26T09:10:01+01:00")
    static let saved = NoteStamp(bytes: 377_996, modified: "2026-11-26T09:10:07+01:00")
    static let time = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aChangedSizeOrTimePullsAndAnUnchangedOneDoesNot() {
        var watch = NoteWatch()
        let first = watch.needsPull(Self.first, at: Self.time)
        #expect(first)
        watch.pulled(Self.first, at: Self.time)
        let unchanged = watch.needsPull(Self.first, at: Self.time.addingTimeInterval(2))
        #expect(!unchanged)
        #expect(watch.state == .synced(Self.time.addingTimeInterval(2)))
        let bigger = watch.needsPull(Self.saved, at: Self.time)
        #expect(bigger)
        let later = watch.needsPull(NoteStamp(bytes: Self.first.bytes, modified: Self.saved.modified), at: Self.time)
        #expect(later)
    }

    @Test func aFailedPullNamesItsFailureAndTheNextLookRetries() {
        var watch = NoteWatch()
        watch.pulled(Self.first, at: Self.time)
        _ = watch.needsPull(Self.saved, at: Self.time)
        watch.failed(.notConnected("no tablet answers on USB or Wi-Fi"))
        #expect(watch.state == .notConnected("no tablet answers on USB or Wi-Fi"))
        let retry = watch.needsPull(Self.saved, at: Self.time)
        #expect(retry)
        watch.failed(.notFound("Note/Plan.note is not on the tablet."))
        #expect(watch.state == .failed("Note/Plan.note is not on the tablet."))
        #expect(watch.copied == Self.first)
    }

    @Test(arguments: [(0.0, 0), (3.9, 3), (-5.0, 0)])
    func secondsAgoCountsWholeSeconds(after: Double, seconds: Int) {
        #expect(NoteWatch.secondsAgo(Self.time, now: Self.time.addingTimeInterval(after)) == seconds)
    }

    @Test func aCopyKnowsItsTabletPathAndAnyOtherFileIsNotLive() {
        let copies = TabletCopyLocation(root: URL(filePath: "/tmp/copies", directoryHint: .isDirectory))
        let local = copies.localURL(for: "Note/Plans/Garden.note")
        #expect(local.flatMap(copies.tabletPath(for:)) == "Note/Plans/Garden.note")
        #expect(copies.tabletPath(for: URL(filePath: "/Users/someone/Desktop/Garden.note")) == nil)
        #expect(copies.tabletPath(for: URL(filePath: "/tmp/copies")) == nil)
    }
}

/// A live note against a fake `inkctl` that answers `files ls` with a recorded listing and copies a
/// fixture for `files pull`; the real tablet is never reached.
@MainActor
@Suite final class LiveNoteTests {
    let folder: URL

    init() throws {
        folder = FileManager.default.temporaryDirectory.appending(path: "live-note-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    var stampFile: URL { folder.appending(path: "stamp") }
    var pulls: URL { folder.appending(path: "pulls") }
    var offline: URL { folder.appending(path: "offline") }

    /// The listing the fake prints, as `inkctl --json files ls Note/Garden.note` prints one note.
    func record(bytes: Int, modified: String) throws {
        let listing = """
            {"path": "/storage/emulated/0/Note/Garden.note", "entries": [{"name": "Garden.note", "type": "file", "bytes": \(bytes), "modified": "\(modified)"}]}
            """
        try listing.write(to: stampFile, atomically: true, encoding: .utf8)
    }

    func fake() throws -> Inkctl {
        let fixture = Fixtures.folder.appending(path: "content.note").path(percentEncoded: false)
        let script = """
            #!/bin/sh
            if [ -e '\(offline.path(percentEncoded: false))' ]; then
              echo '{"error": "unreachable", "message": "no tablet answers on USB or Wi-Fi"}'; exit 3
            fi
            case "$4" in
              ls) cat '\(stampFile.path(percentEncoded: false))' ;;
              pull) echo pull >> '\(pulls.path(percentEncoded: false))'; cp '\(fixture)' "$7"; echo '{}' ;;
            esac
            """
        let executable = folder.appending(path: "inkctl")
        try script.write(to: executable, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path())
        return Inkctl(executable: executable, environment: ["PATH": "/usr/bin:/bin"])
    }

    func pullCount() -> Int {
        ((try? String(contentsOf: pulls, encoding: .utf8)) ?? "").split(separator: "\n").count
    }

    func live() throws -> LiveNote {
        LiveNote(
            tabletPath: "Note/Garden.note", local: folder.appending(path: "copies/Note/Garden.note"), inkctl: try fake()
        )
    }

    @Test func aChangedNoteIsPulledOnceAndAnUnchangedOneNever() async throws {
        let live = try live()
        try record(bytes: 377_142, modified: "2026-11-26T09:10:01+01:00")
        #expect(await live.look() != nil)
        #expect(await live.look() == nil)
        #expect(pullCount() == 1)
        try record(bytes: 377_996, modified: "2026-11-26T09:10:07+01:00")
        let newer = await live.look()
        #expect(newer?.pages.count == 4)
        #expect(pullCount() == 2)
        guard case .synced = live.watch.state else {
            Issue.record("not synced: \(live.watch.state)")
            return
        }
    }

    @Test func aTabletThatGoesAwayIsNamedAndTheNextLookPullsAgain() async throws {
        let live = try live()
        try record(bytes: 1, modified: "a")
        _ = await live.look()
        try Data().write(to: offline)
        try record(bytes: 2, modified: "b")
        #expect(await live.look() == nil)
        #expect(live.watch.state == .notConnected("no tablet answers on USB or Wi-Fi"))
        try FileManager.default.removeItem(at: offline)
        #expect(await live.look() != nil)
        #expect(pullCount() == 2)
    }

    // timing-independent: the limit only turns a hang into a failure, as for
    // aCancelledPullStopsInkctlAndLeavesNoFile (#148, #446); the test waits on the pull itself.
    @Test(.timeLimit(.minutes(LoadedMac.minutes)))
    func theWatchStopsWithItsTask() async throws {
        let live = try live()
        try record(bytes: 1, modified: "a")
        let watch = Task { await live.run { _ in } }
        // The first look pulls; then the watch waits NoteWatch.interval between looks.
        while pullCount() == 0 {
            // A sleep, not a yield, since a spin takes the CPU the fake needs to start.
            // timing-independent: waits on the pull, bounded by the test's time limit.
            try await Task.sleep(for: .milliseconds(10))
        }
        watch.cancel()
        // The run returns once its task is cancelled, so a closed window stops the watch.
        await watch.value
        let pulled = pullCount()
        try record(bytes: 2, modified: "b")
        #expect(pulled == 1)
        #expect(pullCount() == pulled)
    }

    @Test func aNewerCopyRedrawsOnlyItsChangedPages() async throws {
        let note = try Fixtures.note("content.note")
        let pages = PageImages(note: note)
        await pages.show(Set(note.pages.indices))
        let written = try NoteFile(
            bytes: NoteWriter.drawText(
                note, page: 2, text: "Ink", in: PageRect(x: 100, y: 100, width: 300, height: 120), fontSize: 80))
        #expect(pages.update(written) == [2])
        // The changed page keeps its old drawing on screen until the new one is ready.
        #expect(pages.pages.count == 4 && pages.isStale(2) && !pages.isStale(1))
        #expect(pages.generation == 1)
        await pages.show([2])
        #expect(!pages.isStale(2))
        let moved = try NoteFile(bytes: NoteWriter.movePage(written, from: 0, to: 2))
        #expect(pages.update(moved) == nil)
        #expect(pages.pages.isEmpty)
    }

    @Test func theLineSaysEachStateAsASentenceWithTheCopyItShows() {
        var watch = NoteWatch()
        let time = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(SyncStatusLine.words(watch, now: time).0 == Copy.syncing)
        watch.pulled(NoteStamp(bytes: 1, modified: "a"), at: time)
        #expect(SyncStatusLine.words(watch, now: time.addingTimeInterval(3)).0 == Copy.syncedAgo(3))
        watch.failed(.missing)
        let (text, _, problem) = SyncStatusLine.words(watch, now: time)
        #expect(problem)
        #expect(text.hasPrefix("inkctl is not installed. The app tries again in 2 s."))
        #expect(text.hasSuffix(Copy.showingCopy(from: time)))
    }
}
