import Foundation
import InkNotebookEditorKit
import NoteFormat
import SwiftUI
import Testing

@testable import InkNotebookEditor

/// The reader's test notebooks, made on the tablet (NoteFormat/Tests/NoteFormatTests/Fixtures).
enum Fixtures {
    static let folder = URL(filePath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "NoteFormat/Tests/NoteFormatTests/Fixtures", directoryHint: .isDirectory)

    /// `landscape.note` is synthetic, two landscape pages (#291), not made on the tablet.
    static let notes = ["blank.note", "content.note", "landscape.note"]

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: folder.appending(path: name))
    }

    static func note(_ name: String) throws -> NoteFile {
        guard case .note(let note) = NoteDocument(data: try data(name)).content else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return note
    }
}

@MainActor
@Suite struct NoteDocumentTests {
    @Test(arguments: Fixtures.notes)
    func eachFixtureOpensThroughTheDocumentTypeAndDrawsEveryPage(name: String) async throws {
        let note = try Fixtures.note(name)
        #expect(!note.pages.isEmpty)
        let pages = PageImages(note: note)
        for index in note.pages.indices {
            await pages.loadPage(index)
            await pages.loadThumbnail(index, scale: 2)
            guard case .ready(let image) = pages.page(index), case .ready(let thumbnail) = pages.thumbnail(index) else {
                Issue.record("\(name) page \(index + 1) did not draw")
                continue
            }
            #expect(CGSize(width: image.width, height: image.height) == pages.size(of: index))
            let fitted = PageFit.fitted(page: pages.size(of: index), in: PageImages.thumbnailBox)
            #expect(thumbnail.width == Int(fitted.width) * 2)
        }
    }

    @Test func bytesThatAreNotANotebookOpenAsUnreadableWithTheReason() {
        guard case .unreadable(let reason) = NoteDocument(data: Data("not a note".utf8)).content else {
            Issue.record("garbage must not open as a notebook")
            return
        }
        #expect(!reason.isEmpty)
    }

    @Test func theDocumentTypeReadsNoteFilesAndWritesNothing() {
        #expect(NoteDocument.readableContentTypes == [.inkNote])
        #expect(NoteDocument.writableContentTypes.isEmpty)
    }

    @Test func onlyTheLastFewFullPagesStayDrawn() async throws {
        let note = try Fixtures.note("content.note")
        let pages = PageImages(note: note)
        for index in note.pages.indices {
            await pages.loadPage(index)
        }
        #expect(pages.pages.count == min(PageImages.keptPages, note.pages.count))
        #expect(pages.pages[note.pages.count - 1] != nil)
    }

    @Test func thePageKeysTurnPagesBothWays() {
        #expect(PageKeys.moves[.pageDown] == .next)
        #expect(PageKeys.moves[.pageUp] == .previous)
        #expect(PageKeys.moves[.rightArrow] == .next && PageKeys.moves[.downArrow] == .next)
        #expect(PageKeys.moves[.leftArrow] == .previous && PageKeys.moves[.upArrow] == .previous)
        #expect(PageKeys.moves[.home] == .first && PageKeys.moves[.end] == .last)
    }

    /// Open from Tablet end to end, but for the window: a fake inkctl lists a folder and serves a
    /// copy of a fixture; the browser pulls it into its copy folder, and the copy opens as a
    /// notebook. The tablet path never changes: the fake records that every call was --read-only.
    @Test func openFromTabletCopiesTheChosenNoteAndTheCopyOpens() async throws {
        let scratch = FileManager.default.temporaryDirectory.appending(path: "open-from-tablet-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: scratch) }
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let fixture = Fixtures.folder.appending(path: "content.note").path(percentEncoded: false)
        let calls = scratch.appending(path: "calls").path(percentEncoded: false)
        let script = """
            #!/bin/sh
            echo "$*" >> '\(calls)'
            case "$3 $4" in
              "files ls") echo '{"path": "/storage/emulated/0/Note", "entries": [{"name": "Tests", "type": "dir", "bytes": 1, "modified": "x"}, {"name": "Sample.note", "type": "file", "bytes": 1, "modified": "x"}]}' ;;
              "files pull") for last; do :; done; cp '\(fixture)' "$last"; echo '{}' ;;
              *) exit 2 ;;
            esac
            """
        let executable = scratch.appending(path: "inkctl")
        try script.write(to: executable, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path())
        let copies = TabletCopyLocation(root: scratch.appending(path: "From Tablet", directoryHint: .isDirectory))
        let browser = TabletBrowser(
            inkctl: Inkctl(executable: executable, environment: ["PATH": "/usr/bin:/bin"]), copies: copies)

        await browser.load()
        guard case .listed(let listing) = browser.phase, let note = listing.entries.first(where: { !$0.isFolder })
        else {
            Issue.record("the fake listing did not show")
            return
        }
        let local = try #require(await browser.choose(note))
        #expect(local == copies.localURL(for: "Note/Sample.note"))
        guard case .note(let opened) = NoteDocument(data: try Data(contentsOf: local)).content else {
            Issue.record("the pulled copy did not open as a notebook")
            return
        }
        #expect(opened.pages.count == 4)
        let lines = try String(contentsOfFile: calls, encoding: .utf8).split(separator: "\n")
        #expect(lines.allSatisfy { $0.hasPrefix("--json --read-only files ") })
    }

    @Test func aPageIsResampledToTheExactPixelsItIsDrawnAt() async throws {
        let pages = PageImages(note: try Fixtures.note("content.note"))
        await pages.loadPage(1)
        guard case .ready(let full) = pages.page(1) else {
            Issue.record("page 2 did not draw")
            return
        }
        let fitted = try #require(await PageImages.fit(full, to: (width: 300, height: 400)))
        #expect(fitted.width == 300 && fitted.height == 400)
    }

    @Test func aFailedCopyIsNamedAsACopyButKeepsTheNamedStates() {
        #expect(TabletMessages.message(forCopy: .failed("cable pulled")).title == Copy.copyFailedTitle)
        #expect(TabletMessages.message(forCopy: .notConnected("x")).title == Copy.notConnectedTitle)
        #expect(TabletMessages.message(for: .failed("adb is not installed")).title == Copy.failedTitle)
        #expect(TabletMessages.message(for: .failed("x")).kind == .problem)
        #expect(TabletMessages.noNotes.kind == .empty)
    }
}
