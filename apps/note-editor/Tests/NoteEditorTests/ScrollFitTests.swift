import AppKit
import Foundation
import NoteEditorKit
import SwiftUI
import Testing

@testable import NoteEditor

/// The continuous scroll's fit, measured on the scroll view a window lays out off screen (#457,
/// #458): never ordered in, so nothing reaches the screen. The scroll bars are the Mac's own
/// setting: with «Show scroll bars: Always» the vertical bar takes its width beside the pages, and
/// with bars that show only while scrolling nothing does, so the test holds for both.
@MainActor
@Suite struct ScrollFitTests {
    /// The window's size, as the issue's report: a wide window, with the page list open or closed.
    static let size = CGSize(width: 1720, height: 1400)

    /// What the scroll shows, without its scroll bars and the bars over it, and what it holds.
    struct Measured {
        let shown: CGSize
        let document: CGSize
        let page: CGSize
        /// The clip view's frame and the two scroll bars', in the scroll view's own coordinates.
        let clip: CGRect
        let verticalBar: CGRect
        let horizontalBar: CGRect
    }

    static func measure(
        _ zoom: PageZoom, columns: NavigationSplitViewVisibility, note: String = "content.note",
        legacyBars: Bool = false
    ) async throws -> Measured {
        let pages = PageImages(note: try Fixtures.note(note))
        let viewer = PageViewer(zoom: zoom)
        let window = OffscreenWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        let hosting = NSHostingView(
            rootView: NotebookView(pages: pages, columns: columns, viewer: viewer)
                .frame(width: size.width, height: size.height))
        window.contentView = hosting
        window.setContentSize(size)
        for _ in 0..<8 {
            hosting.layoutSubtreeIfNeeded()
            // timing-independent: turns of the main actor for SwiftUI to lay out and report its scroll.
            try await Task.sleep(for: .milliseconds(20))
        }
        // The pages' scroll is the one that holds the most: the page list holds four thumbnails.
        let scroll = try #require(
            Self.scrollViews(in: hosting).max {
                ($0.documentView?.frame.height ?? 0) < ($1.documentView?.frame.height ?? 0)
            })
        if legacyBars {
            scroll.scrollerStyle = .legacy
            for _ in 0..<4 {
                hosting.layoutSubtreeIfNeeded()
                // timing-independent: turns of the main actor for the scroll view to tile its bars.
                try await Task.sleep(for: .milliseconds(20))
            }
        }
        let clip = scroll.contentView.bounds.size
        let insets = scroll.contentInsets
        return Measured(
            shown: CGSize(
                width: clip.width - insets.left - insets.right, height: clip.height - insets.top - insets.bottom),
            document: scroll.documentView?.frame.size ?? .zero,
            page: viewer.zoom.size(of: viewer.page, in: viewer.viewport, scale: 1),
            clip: scroll.contentView.frame, verticalBar: scroll.verticalScroller?.frame ?? .zero,
            horizontalBar: scroll.horizontalScroller?.frame ?? .zero)
    }

    static func scrollViews(in view: NSView) -> [NSScrollView] {
        ((view as? NSScrollView).map { [$0] } ?? []) + view.subviews.flatMap(scrollViews)
    }

    /// No sideways scroll while every page fits the window: the pages are never wider than what
    /// the scroll shows beside its vertical scroll bar, with the page list open or closed (#457).
    /// The window draws at 1 pixel per point, so magnification 0.5 draws a page as wide as Actual
    /// Size does on a Retina display, 960 points.
    @Test(
        arguments: [PageZoom.fitPage, .fitWidth, .magnification(0.5)], [NavigationSplitViewVisibility.all, .detailOnly])
    func aPageThatFitsNeverScrollsSideways(zoom: PageZoom, columns: NavigationSplitViewVisibility) async throws {
        let measured = try await Self.measure(zoom, columns: columns)
        #expect(measured.shown.width > 0)
        #expect(measured.document.width <= measured.shown.width, "\(zoom) \(columns)")
    }

    /// Zoom to Width fills what the scroll shows, less the margins (#458).
    @Test(arguments: [NavigationSplitViewVisibility.all, .detailOnly])
    func zoomToWidthFillsTheShownWidth(columns: NavigationSplitViewVisibility) async throws {
        let measured = try await Self.measure(.fitWidth, columns: columns)
        #expect(abs(measured.page.width - (measured.shown.width - 2 * PageView.margin)) <= 1)
    }

    /// Zoom to Fit shows the whole page with no scroll needed (#458).
    @Test(arguments: [NavigationSplitViewVisibility.all, .detailOnly])
    func zoomToFitShowsTheWholePage(columns: NavigationSplitViewVisibility) async throws {
        let measured = try await Self.measure(.fitPage, columns: columns)
        #expect(measured.page.width + 2 * PageView.margin <= measured.shown.width)
        #expect(measured.page.height + 2 * PageView.margin <= measured.shown.height)
    }

    /// A one-page note that fits the window shows no vertical bar, so its page keeps the whole
    /// width and sits in the middle (#457).
    @Test func aNoteThatFitsKeepsTheWholeWidth() async throws {
        let measured = try await Self.measure(.fitPage, columns: .detailOnly, note: "blank.note")
        #expect(abs(measured.document.width - measured.shown.width) <= 1)
    }

    /// The Mac's always-shown scroll bars sit beside the pages, never over them: at a zoom wider and
    /// taller than the window both bars show, and the clip view the pages draw in ends where they
    /// begin (#457). SwiftUI's own scroll drew its pages under them.
    @Test(arguments: [NavigationSplitViewVisibility.all, .detailOnly])
    func thePagesNeverDrawUnderAlwaysShownScrollBars(columns: NavigationSplitViewVisibility) async throws {
        let measured = try await Self.measure(.magnification(2), columns: columns, legacyBars: true)
        #expect(measured.verticalBar.width > 0, "no vertical bar")
        #expect(measured.horizontalBar.height > 0, "no horizontal bar")
        #expect(measured.clip.maxX <= measured.verticalBar.minX + 0.5, "the pages draw under the vertical bar")
        #expect(measured.clip.maxY <= measured.horizontalBar.minY + 0.5, "the pages draw under the horizontal bar")
    }

    /// A scroll bar shown always takes its width beside the pages; one shown only while scrolling
    /// floats over them and takes none (#457).
    @Test func onlyAScrollBarShownAlwaysTakesWidth() {
        #expect(PageScroll.verticalScrollerWidth(.legacy) > 0)
        #expect(PageScroll.verticalScrollerWidth(.overlay) == 0)
    }
}
