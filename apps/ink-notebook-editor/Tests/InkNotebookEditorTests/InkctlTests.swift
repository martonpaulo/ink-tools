import Foundation
import InkNotebookEditorKit
import Testing

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
    /// Cancel stops inkctl at once: the fake blocks until it is stopped, and nothing is left behind.
    @Test(.timeLimit(.minutes(1)))
    func aCancelledPullStopsInkctlAndLeavesNoFile() async throws {
        let started = folder.appending(path: "started")
        let inkctl = try fake(
            "for last; do :; done; printf 'half' > \"$last\"; : > '\(started.path(percentEncoded: false))'; exec tail -f /dev/null"
        )
        let destination = folder.appending(path: "copies/A.note")
        let pull = Task { try await inkctl.pull("Note/A.note", to: destination) }
        while !FileManager.default.fileExists(atPath: started.path(percentEncoded: false)) {
            await Task.yield()
        }
        pull.cancel()
        await #expect(throws: InkctlFailure.cancelled) { try await pull.value }
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: destination.deletingLastPathComponent().path()).isEmpty)
    }

    // timing-independent: the limit and the fake's sleep only turn a hang into a failure.
    /// More pulls than the Mac has cores all start and all stop on cancel: a wait for inkctl that
    /// held a cooperative thread would leave the last pull unstarted and the cancel unrun (#325).
    @Test(.timeLimit(.minutes(1)))
    func moreCancelledPullsThanCoresAllStartAndStop() async throws {
        let count = ProcessInfo.processInfo.activeProcessorCount + 1
        let marker = folder.appending(path: "started-").path(percentEncoded: false)
        let inkctl = try fake(
            // timing-independent: the sleep stands for a copy that only ends when it is stopped.
            "for last; do :; done; printf 'half' > \"$last\"; : > '\(marker)'$$; exec sleep 120"
        )
        let copies = folder.appending(path: "copies")
        let pulls = (0..<count).map { index in
            Task { try await inkctl.pull("Note/A.note", to: copies.appending(path: "\(index).note")) }
        }
        let files = FileManager.default
        while try files.contentsOfDirectory(atPath: folder.path()).count(where: { $0.hasPrefix("started-") }) < count {
            await Task.yield()
        }
        pulls.forEach { $0.cancel() }
        for pull in pulls {
            await #expect(throws: InkctlFailure.cancelled) { try await pull.value }
        }
        #expect(try files.contentsOfDirectory(atPath: copies.path()).isEmpty)
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
