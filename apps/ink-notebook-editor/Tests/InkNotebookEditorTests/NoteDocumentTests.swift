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

    /// `landscape.note` (#291) and `custom-template.note` (#308) are synthetic, not made on the tablet.
    static let notes = ["blank.note", "content.note", "landscape.note", "templates.note", "custom-template.note"]

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: folder.appending(path: name))
    }

    static func note(_ name: String) throws -> NoteFile {
        guard case .note(let note) = NoteDocument(data: try data(name)).content else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return note
    }

    /// `custom-template.note` with its template picture's signature broken, so the reader cannot
    /// draw the template (#308).
    static func damagedTemplateNote() throws -> NoteFile {
        var bytes = [UInt8](try data("custom-template.note"))
        let signature: [UInt8] = [0x89, 0x50, 0x4e, 0x47]
        guard let start = bytes.indices.first(where: { bytes[$0...].starts(with: signature) }) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        bytes[start] = 0
        guard case .note(let note) = NoteDocument(data: Data(bytes)).content else {
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
            let fitted = PageFit.fitted(page: pages.size(of: index), in: PageImages.ThumbnailSize.sidebar.box)
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

    @Test func thePagesInViewAndTheirNeighboursDrawAndNoOtherStays() async throws {
        let note = try Fixtures.note("content.note")
        #expect(note.pages.count >= 4)
        let pages = PageImages(note: note)
        await pages.show([0])
        #expect(Set(pages.pages.keys) == [0, 1])
        let last = note.pages.count - 1
        await pages.show([last])
        #expect(Set(pages.pages.keys) == [last - 1, last])
        #expect(pages.pages.values.allSatisfy { if case .ready = $0 { true } else { false } })
        // Every page on screen draws and stays, however many show at the smallest zoom (#319).
        await pages.show(Set(note.pages.indices))
        #expect(pages.pages.count == note.pages.count)
    }

    @Test func aThumbnailOfEachSizeFitsItsOwnBox() async throws {
        let note = try Fixtures.note("content.note")
        let pages = PageImages(note: note)
        for size in PageImages.ThumbnailSize.allCases {
            await pages.loadThumbnail(0, size, scale: 1)
            guard case .ready(let image) = pages.thumbnail(0, size) else {
                Issue.record("the \(size) thumbnail did not draw")
                continue
            }
            let fitted = PageFit.fitted(page: pages.size(of: 0), in: size.box)
            #expect(image.width == Int(fitted.width) && image.height == Int(fitted.height))
        }
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

    /// The darkest grey of the drawn dots page in the template's empty lower half, where no ink is.
    private func darkestTemplateGrey(_ image: CGImage) throws -> UInt8 {
        let context = try #require(
            CGContext(
                data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        let data = try #require(context.data).assumingMemoryBound(to: UInt8.self)
        // Rows in memory run top to bottom; the lower half holds only the dot grid.
        let lower = (image.height / 2 * image.width)..<(image.height * image.width)
        return lower.map { data[$0] }.min() ?? 255
    }

    /// A page drawn small keeps its template visible: a 5 mm dot grid stayed near white at a 1x
    /// display's size and in the thumbnail, so the page looked like ink on white (#308).
    /// The page at a 1x display's default window size, then a thumbnail, with the darkest grey each
    /// must reach; without darkening they were 190 and 252.
    @Test(arguments: [(width: 504, height: 672, darkest: 128), (width: 84, height: 112, darkest: 230)])
    func aDotTemplateStaysDarkWhenDrawnSmall(width: Int, height: Int, darkest: Int) async throws {
        let pixels = (width: width, height: height)
        let pages = PageImages(note: try Fixtures.note("templates.note"))
        await pages.loadPage(1)
        guard case .ready(let full) = pages.page(1) else {
            Issue.record("page 2 did not draw")
            return
        }
        #expect(try darkestTemplateGrey(full) == 0)
        let small = try #require(await PageImages.fit(full, to: pixels))
        #expect(try darkestTemplateGrey(small) < darkest, "\(height) pixels high")
    }

    @Test func theDarkeningIsOddAndAtMostHalfTheScale() {
        #expect(PageImages.darkening(from: 2560, to: 1344) == 1)
        #expect(PageImages.darkening(from: 2560, to: 672) == 3)
        #expect(PageImages.darkening(from: 2560, to: 256) == 5)
        #expect(PageImages.darkening(from: 2560, to: 150) == 7)
        #expect(PageImages.darkening(from: 2560, to: 0) == 1)
    }

    /// A custom template whose picture is damaged: the page draws, and names the style for its marker.
    @Test func aTemplateTheReaderCannotDrawIsNamedForThePage() async throws {
        let pages = PageImages(note: try Fixtures.damagedTemplateNote())
        await pages.loadPage(0)
        guard case .ready = pages.page(0) else {
            Issue.record("the page did not draw")
            return
        }
        #expect(pages.missingTemplates[0] == "user_test_template")
        let intact = PageImages(note: try Fixtures.note("custom-template.note"))
        await intact.loadPage(0)
        #expect(intact.missingTemplates[0] == nil)
    }

    @Test func aFailedCopyIsNamedAsACopyButKeepsTheNamedStates() {
        #expect(TabletMessages.message(forCopy: .failed("cable pulled")).title == Copy.copyFailedTitle)
        #expect(TabletMessages.message(forCopy: .notConnected("x")).title == Copy.notConnectedTitle)
        #expect(TabletMessages.message(for: .failed("adb is not installed")).title == Copy.failedTitle)
        #expect(TabletMessages.message(for: .failed("x")).kind == .problem)
        #expect(TabletMessages.noNotes.kind == .empty)
    }
}

/// The window a notebook opens at (#291).
@MainActor
@Suite struct NotebookWindowSizeTests {
    @Test func aPortraitNotebookOpensAtThePortraitWindow() throws {
        #expect(
            NotebookWindow(document: NoteDocument(data: try Fixtures.data("content.note"))).idealSize
                == NotebookWindow.portrait)
    }

    @Test(arguments: ["landscape.note", "landscape-tablet.note"])
    func aLandscapeNotebookOpensWide(name: String) throws {
        let size = NotebookWindow(document: NoteDocument(data: try Fixtures.data(name))).idealSize
        #expect(size.height == NotebookWindow.portrait.height && size.width > NotebookWindow.portrait.width)
    }

    @Test func aFileTheReaderCannotReadOpensAtThePortraitWindow() {
        #expect(
            NotebookWindow(document: NoteDocument(data: Data("not a note".utf8))).idealSize == NotebookWindow.portrait)
    }
}
