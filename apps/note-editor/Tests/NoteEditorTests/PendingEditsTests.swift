import Foundation
import NoteEditorKit
import SwiftUI
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// A page's thumbnail shows the element edits on their way, as the page does (#476), and is the
/// tablet's drawing again once an edit is refused.
@MainActor
@Suite final class PendingEditsTests {
    let folder: URL
    let copy: URL
    let original: Data

    init() throws {
        folder = try WritePathTests.makeFolder("pending-edits-tests")
        copy = folder.appending(path: "Edit.note")
        original = try Fixtures.data("content.note")
        try original.write(to: copy)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    func editor(_ tablet: any TabletWriting) throws -> NoteEditor {
        NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original), tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
    }

    /// Page 1's row of the page list, drawn off screen, with `editor` in the environment.
    func row(_ editor: NoteEditor?) async throws -> Data {
        let pages = PageImages(note: try NoteFile(data: original))
        await pages.loadThumbnail(0, scale: 1)
        let page = try #require(pages.pageSizes.first)
        let row = ThumbnailRow(page: page, count: pages.pageSizes.count, pages: pages)
        let view = editor.map { AnyView(row.environment($0)) } ?? AnyView(row)
        return try await OffscreenWindow.png(of: view, size: CGSize(width: 200, height: 260), dark: false)
    }

    static let box = EditRect(left: 200, top: 1600, right: 1400, bottom: 1900)

    @Test func anInsertOnItsWayShowsInTheThumbnail() async throws {
        let plain = try await row(nil)
        let editor = try editor(RenderTests.SlowTablet(pullWaits: true))
        #expect(editor.insertText(page: 0, text: "On its way", rect: Self.box, fontSize: 160))
        #expect(!editor.insertions(on: 0).isEmpty)
        #expect(try await row(editor) != plain)
    }

    @Test func aRefusedInsertLeavesTheThumbnailAsTheTabletDrewIt() async throws {
        let plain = try await row(nil)
        let tablet = WritePathTests.FakeTablet(bytes: original)
        tablet.failEdit = .failed("device-link edit: tablet-refused: operation 1")
        let editor = try editor(tablet)
        #expect(editor.insertText(page: 0, text: "Refused", rect: Self.box, fontSize: 160))
        for _ in 0..<200 where !editor.pending.isEmpty {
            // timing-independent: a poll on the refusal with a deadline; the assertion below fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.pending.isEmpty && editor.refusal != nil)
        #expect(try await row(editor) == plain)
    }
}
