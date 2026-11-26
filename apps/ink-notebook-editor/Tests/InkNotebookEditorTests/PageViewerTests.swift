import CoreGraphics
import InkNotebookEditorKit
import SwiftUI
import Testing

@testable import InkNotebookEditor

/// The page keys and the grid's rows in a notebook window (#319).
@MainActor
@Suite struct PageViewerTests {
    /// A Manta page in a 900 x 600 window at 1x, scrolled to 1000 points of 6000.
    static func viewer(_ zoom: PageZoom) -> PageViewer {
        let viewer = PageViewer(zoom: zoom)
        viewer.page = CGSize(width: 1920, height: 2560)
        viewer.viewport = CGSize(width: 900, height: 600)
        viewer.visible = CGSize(width: 948, height: 648)
        viewer.content = CGSize(width: 2000, height: 6000)
        viewer.offset = CGPoint(x: 100, y: 1000)
        return viewer
    }

    @Test func aPageThatFitsTurnsWithTheKeys() {
        let viewer = Self.viewer(.fitPage)
        for key in [KeyEquivalent.upArrow, .downArrow, .pageUp, .pageDown, .leftArrow, .rightArrow, .home, .end] {
            #expect(viewer.scroll(for: key) == nil, "\(key)")
        }
    }

    @Test func aZoomedPageScrollsWithTheKeysInsteadOfTurning() {
        let viewer = Self.viewer(.magnification(2))
        #expect(viewer.scroll(for: .downArrow) == CGPoint(x: 100, y: 1000 + PageViewer.line))
        #expect(viewer.scroll(for: .pageUp) == CGPoint(x: 100, y: 1000 - (648 - PageViewer.line)))
        #expect(viewer.scroll(for: .rightArrow) == CGPoint(x: 100 + PageViewer.line, y: 1000))
        #expect(viewer.scroll(for: .home) == nil && viewer.scroll(for: .end) == nil)
    }

    @Test func aScrollStopsAtTheContentsEdges() {
        let viewer = Self.viewer(.magnification(2))
        viewer.offset = CGPoint(x: 0, y: 6000 - 648)
        #expect(viewer.scroll(for: .pageDown) == CGPoint(x: 0, y: 6000 - 648))
        #expect(viewer.scroll(for: .leftArrow) == CGPoint(x: 0, y: 6000 - 648))
    }

    @Test func zoomToWidthScrollsVerticallyOnly() {
        let viewer = Self.viewer(.fitWidth)
        #expect(viewer.scroll(for: .downArrow) != nil)
        #expect(viewer.scroll(for: .rightArrow) == nil)
    }

    @Test func theGridKeysNeverScroll() {
        let viewer = Self.viewer(.magnification(2))
        viewer.layout = .grid
        #expect(viewer.scroll(for: .downArrow) == nil)
        #expect(viewer.zoomedIn == nil && viewer.zoomedOut == nil)
    }

    @Test(arguments: [(CGFloat(640), 3), (CGFloat(228), 1), (CGFloat(100), 1), (CGFloat(24 + 4 * 204), 4)])
    func theGridHoldsAsManyColumnsAsFit(width: CGFloat, columns: Int) {
        #expect(PageViewer.gridColumns(width: width, cell: 180, spacing: 24) == columns)
    }
}
