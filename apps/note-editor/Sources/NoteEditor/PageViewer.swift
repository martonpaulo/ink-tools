import NoteEditorKit
import SwiftUI

/// How one notebook window shows its pages (#319): one scroll of every page, or a grid of every
/// page, and the zoom of the scroll. The View menu and the toolbar change it; the window sets the
/// space the pages fit in and the current page's size, which the zoom steps start from.
@Observable
final class PageViewer {
    enum Layout: Hashable {
        /// Every page, one below the other, as Preview's Continuous Scroll.
        case scroll
        /// Every page as a grid of thumbnails, as Preview's Contact Sheet.
        case grid
    }

    /// How a drag selects on a page, as Preview's Rectangular and Lasso Selection (#324).
    enum SelectionTool: Hashable {
        case rectangle, lasso
    }

    var layout: Layout {
        didSet { if layout != .scroll { shapeTool = nil } }
    }
    var zoom: PageZoom
    /// Picking a selection tool puts away a shape that waits for its drag (#350).
    var tool: SelectionTool = .rectangle {
        didSet { shapeTool = nil }
    }
    /// The selection tool the toolbar and the Tools menu show as on: none while a shape waits.
    var shownTool: SelectionTool? {
        get { shapeTool == nil ? tool : nil }
        set { if let newValue { tool = newValue } }
    }
    /// The shape Insert › Shape waits to draw by a drag on the page, until it is drawn or Escape
    /// (#350); only in Continuous Scroll, where a page takes a drag.
    var shapeTool: ShapeKind? {
        didSet { if shapeTool != nil { selection.clear() } }
    }
    /// The elements selected on one page: read-only, the base the edits build on (#324).
    var selection = PageSelection()
    /// The space a page is fitted in, in points, without the margin around it.
    var viewport: CGSize = .zero
    /// The current page's size in pixels.
    var page: CGSize = .zero
    var scale: CGFloat = 1
    /// A content offset the page keys ask the scroll to move to, when a page is larger than the
    /// window; the scroll takes it and sets it back to `nil`.
    var scrollTarget: CGPoint?
    /// The scroll's content offset, visible size and content size, as the scroll reports them.
    var offset: CGPoint = .zero
    var visible: CGSize = .zero
    var content: CGSize = .zero
    /// The pages on screen, as the scroll reports them, from 0.
    var pagesInView: Set<Int> = []
    /// How many pages one row of the grid holds, for the Up and Down arrows there.
    var gridColumns = 1
    /// Whether the pages hold the keyboard focus, which the page keys, Select All and Escape need;
    /// the window gives it to them when it opens. The window sets it from its own focus state, which
    /// no other view can read, so a test waits on it before a key (#495).
    var pagesFocused = false

    /// How far an arrow key scrolls, in points, as a line of text in a Mac document.
    static let line: CGFloat = 40

    /// A note opens at Zoom to Width, its page as wide as the window (#458).
    init(layout: Layout = .scroll, zoom: PageZoom = .fitWidth) {
        self.layout = layout
        self.zoom = zoom
    }

    /// The magnification the current page shows at, 1 being Actual Size.
    var magnification: Double { zoom.magnification(of: page, in: viewport, scale: scale) }

    /// The zoom Zoom In gives, or `nil` when the grid shows or the zoom is at its largest.
    var zoomedIn: PageZoom? {
        layout == .scroll ? zoom.zoomedIn(page: page, viewport: viewport, scale: scale) : nil
    }

    /// The zoom Zoom Out gives, or `nil` when the grid shows or the zoom is at its smallest.
    var zoomedOut: PageZoom? {
        layout == .scroll ? zoom.zoomedOut(page: page, viewport: viewport, scale: scale) : nil
    }

    /// The content offset a page key scrolls to instead of turning the page, when the current
    /// page is taller or wider than the window, as Preview scrolls a zoomed page; `nil` when the
    /// key turns the page. Home and End always turn it.
    func scroll(for key: KeyEquivalent) -> CGPoint? {
        guard layout == .scroll else { return nil }
        let size = zoom.size(of: page, in: viewport, scale: scale)
        let tall = size.height > viewport.height
        let wide = size.width > viewport.width
        let screen = max(visible.height - Self.line, Self.line)
        var target = offset
        switch key {
        case .upArrow where tall: target.y -= Self.line
        case .downArrow where tall: target.y += Self.line
        case .pageUp where tall: target.y -= screen
        case .pageDown where tall: target.y += screen
        case .leftArrow where wide: target.x -= Self.line
        case .rightArrow where wide: target.x += Self.line
        default: return nil
        }
        target.x = min(max(target.x, 0), max(content.width - visible.width, 0))
        target.y = min(max(target.y, 0), max(content.height - visible.height, 0))
        return target
    }

    /// The columns an adaptive grid lays out in `width`: as many cells `cell` wide as fit with
    /// `spacing` between them and around them, at least one.
    static func gridColumns(width: CGFloat, cell: CGFloat, spacing: CGFloat) -> Int {
        max(Int((width - spacing) / (cell + spacing)), 1)
    }

    /// The selected elements of page `current` when any are selected there and its elements are
    /// read (#323); a selection on another page is not the one in view, so it is not copied.
    func selected(in pages: PageImages, on current: Int?) -> (page: Int, items: [Selectable])? {
        guard let page = selection.page, page == current, !selection.isEmpty, let all = pages.selectable(page)
        else { return nil }
        return (page, all.filter { selection.ids.contains($0.id) })
    }

    /// Sets `zoom` from the View menu, which shows the pages if the grid is in front.
    func show(_ zoom: PageZoom) {
        layout = .scroll
        self.zoom = zoom
    }
}
