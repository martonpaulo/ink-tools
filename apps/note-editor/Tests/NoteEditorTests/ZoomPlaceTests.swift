import AppKit
import NoteEditorKit
import SwiftUI
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// A zoom change keeps the page that was current in view, and the window's subtitle names it
/// (#534), in an off-screen window: no window is ordered in and no app activates. The note is a
/// 54-page test note made on the tablet, where the scroll lays out only the pages near the view.
@MainActor
@Suite final class ZoomPlaceTests {
    static let size = CGSize(width: 1000, height: 720)

    let window = KeyedOffscreenWindow(size: ZoomPlaceTests.size, dark: false)
    let viewer = PageViewer(zoom: .fitWidth)
    let pages: PageImages

    init() throws {
        pages = PageImages(note: try Fixtures.note("pages54-tablet.note"))
    }

    deinit {
        MainActor.assumeIsolated { window.close() }
    }

    /// The page under the middle of the window, from 0: the eager stack lays every page out where
    /// `PageStack` puts it, so the scroll's offset reads as a place on a page.
    var pageInMiddle: Int? {
        let stack = PageStack(
            heights: pages.pageSizes.map { viewer.zoom.size(of: $0.pixels, in: viewer.viewport, scale: 1).height },
            margin: PageView.margin)
        return stack.place(at: viewer.offset.y + viewer.visible.height / 2)?.page
    }

    /// Opens the note at `page` (from 0), zooms to each of `zooms` in turn, and answers the page
    /// under the window's middle and the subtitle after each.
    func zoom(from page: Int, through zooms: [PageZoom]) async throws -> [String] {
        window.show(NotebookView(pages: pages, page: page, viewer: viewer))
        let subtitle = "Page \(page + 1) of \(pages.pageSizes.count)"
        #expect(try await window.until { self.window.subtitle == subtitle && self.pageInMiddle == page })
        var seen: [String] = []
        for zoom in zooms {
            let before = viewer.content
            viewer.zoom = zoom
            // The zoom lays the pages out again, then the scroll settles where it goes.
            _ = try await window.until { self.viewer.content != before }
            _ = try await window.until(within: .milliseconds(500), minimumTurns: 50) { false }
            seen.append("\(zoom): page \(pageInMiddle.map { $0 + 1 } ?? 0), \(window.subtitle)")
            try await window.save("zoom-page\(page + 1)-\(seen.count)-\(zoom)")
        }
        return seen
    }

    @Test func eachMenuZoomKeepsTheCurrentPageInView() async throws {
        let zooms: [PageZoom] = [.fitPage, .fitWidth, .magnification(1), .fitWidth]
        let seen = try await zoom(from: 32, through: zooms)
        #expect(seen == zooms.map { "\($0): page 33, Page 33 of 54" })
    }

    @Test func theFirstPageStaysInViewAtItsTop() async throws {
        let seen = try await zoom(from: 0, through: [.fitPage, .fitWidth])
        #expect(seen == ["fitPage: page 1, Page 1 of 54", "fitWidth: page 1, Page 1 of 54"])
    }

    @Test func theLastPageStaysInView() async throws {
        let seen = try await zoom(from: 53, through: [.fitPage, .magnification(1)])
        #expect(seen == ["fitPage: page 54, Page 54 of 54", "magnification(1.0): page 54, Page 54 of 54"])
    }
}
