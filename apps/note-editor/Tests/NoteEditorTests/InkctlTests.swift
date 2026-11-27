import Foundation
import NoteEditorKit
import Testing

/// The bound of a test that waits for a fake `inkctl` to start: wide, since it only turns a hang
/// into a failure. At a load average near 90 a fake took over a minute to start (#148); near 190,
/// with several lanes building, a cancelled pull passed 3 minutes (#326).
enum LoadedMac {
    static let minutes = 10
}

/// The inkctl client against a fake `inkctl`: a shell script that records its arguments and answers
/// as the real one does. The real tablet is never reached.
@Suite final class InkctlTests {
    let folder: URL

    init() throws {
        folder = FileManager.default.temporaryDirectory.appending(path: "inkctl-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A fake inkctl whose body is `script`; it writes its arguments, one per line, to `args`.
    func fake(_ script: String) throws -> Inkctl {
        let executable = folder.appending(path: "inkctl")
        let body =
            "#!/bin/sh\nprintf '%s\\n' \"$@\" > '\(folder.appending(path: "args").path(percentEncoded: false))'\n\(script)\n"
        try body.write(to: executable, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path())
        return Inkctl(executable: executable, environment: ["PATH": "/usr/bin:/bin"])
    }

    func arguments() throws -> [String] {
        try String(contentsOf: folder.appending(path: "args"), encoding: .utf8).split(separator: "\n").map(String.init)
    }

    @Test func listsAFolderReadOnly() async throws {
        let inkctl = try fake(
            #"echo '{"path": "/storage/emulated/0/Note", "entries": [{"name": "A.note", "type": "file", "bytes": 5, "modified": "x"}]}'"#
        )
        let listing = try await inkctl.list(folder: "Note")
        #expect(listing.entries.map(\.name) == ["A.note"])
        #expect(try arguments() == ["--json", "--read-only", "files", "ls", "Note"])
    }

    @Test func theWritePathsEditSendsTheOperationsWithoutReadOnly() async throws {
        let inkctl = try fake(#"echo '{"ok": true, "openNote": "/storage/emulated/0/Note/B.note", "results": []}'"#)
        let operations = folder.appending(path: "ops.json")
        let answer = try await inkctl.edit(note: "/storage/emulated/0/Note/A.note", operations: operations)
        #expect(answer == EditAnswer(openNote: "/storage/emulated/0/Note/B.note"))
        #expect(
            try arguments() == [
                "--json", "note", "edit", "--allow-notes", "/storage/emulated/0/Note/A.note",
                operations.path(percentEncoded: false),
            ])
    }

    @Test func theWritePathsPushReplacesTheNoteWithoutReadOnly() async throws {
        let inkctl = try fake("exit 0")
        try await inkctl.push(URL(filePath: "/tmp/a.note"), to: "/storage/emulated/0/Note/A.note")
        #expect(
            try arguments() == [
                "--json", "files", "push", "--overwrite", "/tmp/a.note", "/storage/emulated/0/Note/A.note",
            ])
    }

    @Test func theTabletsTemplatesAreReadReadOnly() async throws {
        let inkctl = try fake(
            #"echo '{"system": [{"name": "style_white"}, {"name": "style_5mm_grid"}], "custom": [{"name": "week", "path": "/storage/emulated/0/MyStyle/week.png"}]}'"#
        )
        let choices = try await inkctl.templates()
        #expect(
            choices == [
                .system("style_white"), .system("style_5mm_grid"),
                .custom(name: "week", path: "/storage/emulated/0/MyStyle/week.png"),
            ])
        #expect(try arguments() == ["--json", "--read-only", "note", "templates"])
    }

    @Test(arguments: [
        #"{"system": [], "custom": []}"#, #"{"system": [{"name": "style_white"}], "custom": [{"name": "week"}]}"#,
        #"{"system": [{"name": ""}], "custom": []}"#, "[]",
    ])
    func anAnswerThatIsNoTemplateListIsAFailure(answer: String) async throws {
        let inkctl = try fake("echo '\(answer)'")
        await #expect(throws: InkctlFailure.self) { try await inkctl.templates() }
    }

    @Test func thePageInFrontsTemplateComesFirst() {
        let week = PageTemplateChoice.custom(name: "week", path: "/storage/emulated/0/MyStyle/week.png")
        let choices: [PageTemplateChoice] = [.system("style_white"), .system("style_5mm_grid"), week]
        #expect(TabletTemplates.ordered(choices, first: "style_5mm_grid_a5x2").first == .system("style_5mm_grid"))
        #expect(TabletTemplates.ordered(choices, first: "user_week.png").first == week)
        #expect(TabletTemplates.ordered(choices, first: "user_other").map(\.value) == choices.map(\.value))
        #expect(TabletTemplates.ordered(choices, first: nil) == choices)
        #expect(PageTemplateChoice.of(value: week.value) == week)
    }

    @Test func aRefusalOfTheHelperIsAFailureWithItsWords() async throws {
        let inkctl = try fake(
            #"echo '{"error": "usage", "message": "device-link edit: no-element: operation 1"}'; exit 2"#)
        await #expect(throws: InkctlFailure.failed("device-link edit: no-element: operation 1")) {
            try await inkctl.edit(
                note: "/storage/emulated/0/Note/A.note", operations: self.folder.appending(path: "o.json"))
        }
    }

    @Test func aTabletThatIsNotConnectedIsNamed() async throws {
        let inkctl = try fake(
            #"echo '{"error": "unreachable", "message": "no tablet on USB"}'; echo 'inkctl: no tablet on USB' >&2; exit 3"#
        )
        await #expect(throws: InkctlFailure.notConnected("no tablet on USB")) { try await inkctl.list(folder: "Note") }
    }

    @Test func aMissingInkctlIsNamed() async {
        let inkctl = Inkctl(executable: nil, environment: [:])
        await #expect(throws: InkctlFailure.missing) { try await inkctl.list(folder: "Note") }
    }

    @Test func locateFindsTheFirstExecutableInkctl() throws {
        _ = try fake("exit 0")
        let empty = FileManager.default.temporaryDirectory.appending(path: "no-inkctl-\(UUID().uuidString)")
        #expect(Inkctl.locate(in: [empty, folder]) == folder.appending(path: "inkctl"))
        #expect(Inkctl.locate(in: [empty]) == nil)
    }

    @Test func searchFoldersPutTheInstallFolderFirstAndKeepThePath() {
        let folders = Inkctl.searchFolders(home: URL(filePath: "/Users/someone"), path: "/usr/bin:/opt/homebrew/bin")
        #expect(folders.map { $0.path(percentEncoded: false) }.first == "/Users/someone/.local/bin/")
        #expect(folders.contains { $0.path(percentEncoded: false).hasPrefix("/usr/bin") })
        #expect(folders.filter { $0.path(percentEncoded: false).hasPrefix("/opt/homebrew/bin") }.count == 1)
    }

    @Test func pullCopiesTheNoteAndAllowsTheNotesFolder() async throws {
        // The fake copies a fixed text to the local path it is given, its last argument.
        let inkctl = try fake(#"for last; do :; done; printf 'note bytes' > "$last"; echo '{}'"#)
        let destination = folder.appending(path: "copies/Note/A note.note")
        try await inkctl.pull("Note/A note.note", to: destination)
        #expect(try String(contentsOf: destination, encoding: .utf8) == "note bytes")
        let args = try arguments()
        #expect(
            Array(args.prefix(6)) == ["--json", "--read-only", "files", "pull", "--allow-notes", "Note/A note.note"])
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: destination.deletingLastPathComponent().path()) == [
                "A note.note"
            ])
    }

    @Test func aPullThatFailsHalfWayKeepsTheLastGoodCopy() async throws {
        let destination = folder.appending(path: "copies/A.note")
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("good".utf8).write(to: destination)
        let inkctl = try fake(
            #"for last; do :; done; printf 'half' > "$last"; echo '{"error": "device_error", "message": "cable pulled"}'; exit 1"#
        )
        await #expect(throws: InkctlFailure.failed("cable pulled")) {
            try await inkctl.pull("Note/A.note", to: destination)
        }
        #expect(try String(contentsOf: destination, encoding: .utf8) == "good")
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: destination.deletingLastPathComponent().path()) == [
                "A.note"
            ])
    }

    @Test func aSecondPullReplacesTheFirstCopy() async throws {
        let destination = folder.appending(path: "copies/A.note")
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("old".utf8).write(to: destination)
        let inkctl = try fake(#"for last; do :; done; printf 'new' > "$last"; echo '{}'"#)
        try await inkctl.pull("Note/A.note", to: destination)
        #expect(try String(contentsOf: destination, encoding: .utf8) == "new")
    }

    @Test func aPathThatLooksLikeAnOptionIsRefused() async throws {
        let inkctl = try fake("exit 0")
        await #expect(throws: InkctlFailure.self) {
            try await inkctl.pull("--overwrite", to: folder.appending(path: "x.note"))
        }
    }

    // timing-independent: the limit only turns a hang into a failure; the fake blocks until it is stopped.
    // A busy Mac (load average near 90) took over a minute to start the fake, so the limit is wide.
    /// Cancel stops inkctl at once: the fake blocks until it is stopped, and nothing is left behind.
    @Test(.timeLimit(.minutes(LoadedMac.minutes)))
    func aCancelledPullStopsInkctlAndLeavesNoFile() async throws {
        let started = folder.appending(path: "started")
        let inkctl = try fake(
            "for last; do :; done; printf 'half' > \"$last\"; : > '\(started.path(percentEncoded: false))'; exec tail -f /dev/null"
        )
        let destination = folder.appending(path: "copies/A.note")
        let pull = Task { try await inkctl.pull("Note/A.note", to: destination) }
        while !FileManager.default.fileExists(atPath: started.path(percentEncoded: false)) {
            // A sleep, not a yield, since a spin takes the CPU the fake needs to start.
            // timing-independent: waits on the started file, bounded by the test's time limit.
            try await Task.sleep(for: .milliseconds(10))
        }
        pull.cancel()
        await #expect(throws: InkctlFailure.cancelled) { try await pull.value }
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: destination.deletingLastPathComponent().path()).isEmpty)
    }

    /// Every call ends once inkctl exits (#317): `waitUntilExit` on a dispatch thread stayed blocked
    /// after the child had exited, within the first 64 of these calls. The calls run in a task the
    /// test does not await, so a stalled one fails the test at the bound instead of hanging it.
    // timing-independent: the bound only turns a stalled call into a failure; it is wide for a loaded Mac.
    @Test func manyShortCallsAllEnd() async throws {
        let inkctl = try fake(#"echo '{"path": "/x", "entries": []}'"#)
        let finished = DispatchSemaphore(value: 0)
        Task.detached {
            for _ in 0..<10 {
                await withTaskGroup(of: Void.self) { group in
                    for _ in 0..<64 {
                        group.addTask { _ = try? await inkctl.list(folder: "/x") }
                    }
                }
            }
            finished.signal()
        }
        let ended = await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                continuation.resume(returning: finished.wait(timeout: .now() + .seconds(LoadedMac.minutes * 60)))
            }
        }
        #expect(ended == .success)
    }
}

@Suite struct IssueReportTests {
    @Test func theLinkFillsTheBugFormWithTheBuildAndNothingElse() throws {
        let url = try #require(
            IssueReport.url(version: "0.1.0", build: "100", releaseDate: "2026-11-25", macOS: "27.2.0"))
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        #expect(url.absoluteString.hasPrefix("https://github.com/martonpaulo/ink-tools/issues/new?"))
        #expect(items.map(\.name) == ["template", "tool", "version"])
        #expect(items.first { $0.name == "version" }?.value == "0.1.0 (100), released 2026-11-25, macOS 27.2.0")
    }

    @Test func theBugFormOffersThisAppAsATool() throws {
        let form = URL(filePath: #filePath).deletingLastPathComponent()
            .appending(path: "../../../../.github/ISSUE_TEMPLATE/bug_report.yml")
        let text = try String(contentsOf: form.standardized, encoding: .utf8)
        #expect(text.contains("- \(IssueReport.toolOption)\n"))
        #expect(text.contains("id: tool") && text.contains("id: version"))
    }
}
