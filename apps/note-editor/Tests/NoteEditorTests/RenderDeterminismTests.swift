import AppKit
import Foundation
import SwiftUI
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// Two renders of one state match ([#472](https://github.com/martonpaulo/ink-tools/issues/472)): the
/// renders are what an interface check is made from, so a toolbar or a spinner that draws differently
/// from window to window must not reach them. The windows are off screen and never ordered in.
@MainActor
@Suite(.serialized) struct RenderDeterminismTests {
    private static let size = CGSize(width: 640, height: 420)
    /// The page column's left edge, and the first row under the toolbar's band, in points. The
    /// toolbar's and the sidebar's Liquid Glass draw differently from window to window and stay out
    /// of the comparison (`OffscreenWindow`'s comment).
    private static let pageColumn = (x: 200, y: 60)

    /// The bytes of the page column under the toolbar, row by row.
    private static func pageColumn(of png: Data) throws -> [UInt8] {
        let bitmap = try #require(NSBitmapImageRep(data: png))
        let data = try #require(bitmap.bitmapData)
        let pixel = bitmap.bitsPerPixel / 8
        var bytes: [UInt8] = []
        for row in pageColumn.y..<bitmap.pixelsHigh {
            let start = row * bitmap.bytesPerRow + pageColumn.x * pixel
            bytes += UnsafeBufferPointer(start: data + start, count: (bitmap.pixelsWide - pageColumn.x) * pixel)
        }
        return bytes
    }

    @Test func aPageAndItsToolbarWindowDrawTheSameTwice() async throws {
        let note = try Fixtures.note("content.note")
        let pages = PageImages(note: note)
        for index in note.pages.indices { await pages.loadThumbnail(index, scale: 1) }
        await pages.loadPage(1)
        let first = try await OffscreenWindow.settled(
            of: { AnyView(NotebookView(pages: pages, page: 1)) }, size: Self.size, dark: false)
        let second = try await OffscreenWindow.settled(
            of: { AnyView(NotebookView(pages: pages, page: 1)) }, size: Self.size, dark: false)
        #expect(try Self.pageColumn(of: first.png) == Self.pageColumn(of: second.png), "the page drew differently")
    }

    /// A wait the renders show is held: a page that draws in time must never replace it.
    @Test func aHeldWaitStaysAWait() async throws {
        let pages = PageImages(note: try Fixtures.note("content.note"))
        pages.holdsDraws = true
        for _ in 0..<2 {
            _ = try await OffscreenWindow.png(of: AnyView(NotebookView(pages: pages)), size: Self.size, dark: false)
            // timing-independent: gives a draw that was not held the time to land.
            try await Task.sleep(for: .milliseconds(150))
        }
        guard case .loading = pages.page(0) else {
            Issue.record("the held page drew")
            return
        }
    }

    /// A page one render window drew stays drawn for the next window of the same note, so a fresh
    /// window waits for no draw; the app still drops a page far from the view (#319).
    @Test func aRenderKeepsTheDrawnPagesTheAppWouldDrop() async throws {
        let note = try Fixtures.note("content.note")
        #expect(note.pages.count >= 4)
        for keeps in [true, false] {
            let pages = PageImages(note: note)
            pages.keepsPages = keeps
            await pages.show([0])
            await pages.show([3])
            guard case .ready = pages.page(0) else {
                #expect(!keeps, "page 0 was dropped though the renders keep pages")
                continue
            }
            #expect(keeps, "page 0 stayed drawn though the app drops it")
        }
    }
}
