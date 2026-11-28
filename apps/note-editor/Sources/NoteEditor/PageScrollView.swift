import AppKit
import NoteEditorKit
import SwiftUI

/// What the pages' scroll reports: where it is, what it shows and holds, the pages in view and the
/// page in its middle, all in the coordinates SwiftUI's scroll reported before (#457): the offset is 0
/// at the top and left of the content, the insets taken off.
struct PageScrollReport: Equatable {
    var offset: CGPoint
    var visible: CGSize
    var content: CGSize
    var pagesInView: Set<Int>
    var middlePage: Int?
}

/// Moves the pages' AppKit scroll view, from the model. A move waits for the first layout of the
/// pages, and is made again when the pages are laid out, so a scroll to a page never lands on a
/// content that is not there yet.
@MainActor
final class PageScroller {
    enum Target: Equatable {
        case page(Int)
        case point(CGPoint)
    }

    fileprivate weak var scrollView: NSScrollView?
    fileprivate var pending: Target?
    /// The page the last scroll to a page named and the offset it landed at: the end of the content may
    /// stop short of the page's top, and the page stays the one named while the scroll stays there.
    fileprivate var landed: (page: Int, offset: CGFloat)?
    fileprivate var stack = PageStack(heights: [], margin: 0)

    init(opensAt page: Int) {
        pending = .page(page)
    }

    func scroll(to target: Target) {
        pending = target
        applyPending()
        // The layout of a zoom or a note that changed may come after this call.
        Task { @MainActor in self.applyPending() }
    }

    fileprivate func applyPending() {
        guard let target = pending, let scroll = scrollView, let document = scroll.documentView,
            document.frame.height > 0, !stack.heights.isEmpty, scroll.contentView.bounds.height > 0
        else { return }
        let insets = scroll.contentInsets
        var offset = scroll.documentVisibleRect.origin
        offset.x += insets.left
        offset.y += insets.top
        switch target {
        case .page(let page):
            // The page's top, its half margin above it included, at the top of the area the scroll shows.
            offset.y = page == 0 ? 0 : stack.top(of: page) - stack.margin / 2
        case .point(let point):
            offset = point
        }
        move(scroll, to: offset)
        if case .page(let page) = target {
            landed = (page, scroll.documentVisibleRect.minY + insets.top)
        } else {
            landed = nil
        }
        pending = nil
    }

    /// Scrolls to `offset`, in the inset-adjusted coordinates, within the content.
    fileprivate func move(_ scroll: NSScrollView, to offset: CGPoint) {
        guard let document = scroll.documentView else { return }
        let insets = scroll.contentInsets
        let clip = scroll.contentView.bounds.size
        let most = CGPoint(
            x: max(document.frame.width + insets.right - clip.width, -insets.left),
            y: max(document.frame.height + insets.bottom - clip.height, -insets.top))
        let origin = CGPoint(
            x: min(max(offset.x - insets.left, -insets.left), most.x),
            y: min(max(offset.y - insets.top, -insets.top), most.y))
        scroll.contentView.scroll(to: origin)
        scroll.reflectScrolledClipView(scroll.contentView)
    }
}

/// The pages' scroll view. With content insets AppKit lets the clip view fill the whole frame, so the
/// pages scroll under the toolbar and the page list, and draws the always-shown scroll bars over it
/// (#457); the bars here take their own strip on the right and at the bottom, as without insets.
final class PageScrollHost: NSScrollView {
    override func tile() {
        super.tile()
        guard scrollerStyle == .legacy else { return }
        func strip(_ scroller: NSScroller?, _ side: KeyPath<CGRect, CGFloat>) -> CGFloat {
            guard let scroller, hasVerticalScroller || hasHorizontalScroller, !scroller.isHidden else { return 0 }
            return scroller.frame[keyPath: side]
        }
        var frame = contentView.frame
        frame.size.width = max(bounds.width - strip(verticalScroller, \.width), 0)
        frame.size.height = max(bounds.height - strip(horizontalScroller, \.height), 0)
        contentView.frame = frame
    }
}

/// The pages' scroll as an AppKit `NSScrollView` (#457): SwiftUI's own scroll draws its page under
/// the Mac's always-shown scroll bars, and AppKit's tiles the bars beside the page. The insets are the
/// toolbar's and the page list's, so the pages scroll under them as before.
struct PageScrollView<Content: View>: NSViewRepresentable {
    let content: Content
    /// The content's size in points, at least the area the pages are shown in.
    let documentSize: CGSize
    /// Where each page sits, for the pages in view and the place a zoom keeps.
    let stack: PageStack
    let insets: EdgeInsets
    /// The place under the fingers of a pinch, else the middle of what the scroll shows.
    let anchor: CGPoint?
    let scroller: PageScroller
    let report: (PageScrollReport) -> Void

    /// The pages in the document's width, centred, from its top.
    private var document: AnyView {
        AnyView(content.frame(width: documentSize.width, height: documentSize.height, alignment: .top))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = PageScrollHost()
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = true
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        scroll.automaticallyAdjustsContentInsets = false
        scroll.contentView.postsBoundsChangedNotifications = true
        let hosting = NSHostingView(rootView: document)
        hosting.safeAreaRegions = []
        scroll.documentView = hosting
        scroller.scrollView = scroll
        context.coordinator.watch(scroll)
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        let coordinator = context.coordinator
        coordinator.report = report
        coordinator.scroller = scroller
        coordinator.stack = stack
        scroller.scrollView = scroll
        let before = scroller.stack
        scroller.stack = stack
        let edge = NSEdgeInsets(
            top: insets.top, left: insets.leading, bottom: insets.bottom, right: insets.trailing)
        let now = scroll.contentInsets
        if (now.top, now.left, now.bottom, now.right) != (edge.top, edge.left, edge.bottom, edge.right) {
            scroll.contentInsets = edge
        }
        guard let hosting = scroll.documentView as? NSHostingView<AnyView> else { return }
        let area = scroll.contentView.bounds.size
        let old = scroll.documentVisibleRect.origin
        let oldContent = hosting.frame.size
        hosting.rootView = document
        hosting.frame.size = documentSize
        if before != stack, !before.heights.isEmpty, oldContent.width > 0 {
            // The pages changed size: the place being read stays where it was, as Preview zooms.
            let center = anchor ?? CGPoint(x: area.width / 2 - insets.leading, y: area.height / 2 - insets.top)
            let offset = CGPoint(x: old.x + insets.leading, y: old.y + insets.top)
            let y = before.keeping(center.y, at: offset.y, in: stack)
            let share = oldContent.width > 0 ? (offset.x + center.x) / oldContent.width : 0.5
            scroller.move(scroll, to: CGPoint(x: max(share * documentSize.width - center.x, 0), y: y))
        }
        scroller.applyPending()
        coordinator.reportSoon()
    }

    /// Tells the model where the scroll is, after every move of its clip.
    @MainActor
    final class Coordinator {
        var report: (PageScrollReport) -> Void = { _ in }
        var stack = PageStack(heights: [], margin: 0)
        private weak var scroll: NSScrollView?
        nonisolated(unsafe) private var observers: [any NSObjectProtocol] = []
        private var reporting = false

        var scroller: PageScroller?

        func watch(_ scroll: NSScrollView) {
            self.scroll = scroll
            let center = NotificationCenter.default
            for name in [NSView.boundsDidChangeNotification, NSView.frameDidChangeNotification] {
                let object: NSView = name == NSView.boundsDidChangeNotification ? scroll.contentView : scroll
                if name == NSView.frameDidChangeNotification { scroll.postsFrameChangedNotifications = true }
                observers.append(
                    center.addObserver(forName: name, object: object, queue: .main) { [weak self] _ in
                        MainActor.assumeIsolated {
                            self?.scroller?.applyPending()
                            self?.reportSoon()
                        }
                    })
            }
        }

        deinit {
            observers.forEach(NotificationCenter.default.removeObserver)
        }

        /// One report per turn of the main actor, never inside a view update.
        func reportSoon() {
            guard !reporting else { return }
            reporting = true
            Task { @MainActor in
                self.reporting = false
                self.send()
            }
        }

        /// The page in the middle of what the scroll shows, as Preview names it, or the page a scroll to a
        /// page named, while the scroll stays where it landed: a page near the end of the content cannot
        /// reach the middle.
        private func middlePage(of scroll: NSScrollView, offset: CGFloat) -> Int? {
            if let landed = scroller?.landed, abs(landed.offset - offset) < 1 { return landed.page }
            let insets = scroll.contentInsets
            return stack.place(at: offset + (scroll.documentVisibleRect.height - insets.top - insets.bottom) / 2)?.page
        }

        private func send() {
            guard let scroll, let document = scroll.documentView else { return }
            let insets = scroll.contentInsets
            let rect = scroll.documentVisibleRect
            let offset = CGPoint(x: rect.minX + insets.left, y: rect.minY + insets.top)
            let seen = stack.heights.indices.filter { index in
                let top = stack.top(of: index) - stack.margin / 2
                return top < rect.maxY && top + stack.heights[index] + stack.margin > rect.minY
            }
            report(
                PageScrollReport(
                    offset: offset, visible: rect.size, content: document.frame.size, pagesInView: Set(seen),
                    middlePage: middlePage(of: scroll, offset: offset.y)))
        }
    }
}
