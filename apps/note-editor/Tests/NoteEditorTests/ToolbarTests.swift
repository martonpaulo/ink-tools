import AppKit
import Foundation
import SwiftUI
import Testing

@testable import NoteEditor

/// The notebook window's toolbar (#460): customizable, in Preview's order, and the same in two
/// windows open at once. AppKit keeps the toolbars of one identifier in step, and an item each
/// window adds on its own, such as the split view's own sidebar button, made it stop the app. The
/// windows are the test's own and never ordered in.
@MainActor
@Suite(.serialized) struct ToolbarTests {
    /// The toolbar's items by default, in Preview's order; Insert Shape and Insert Text Box are
    /// added with View › Customize Toolbar.
    static let order = ["toggleSidebar", "layout", "zoom", "selection", "search"]

    @Test func twoNotebookWindowsShowTheSameCustomizableToolbar() async throws {
        let document = NoteDocument(data: try Fixtures.data("content.note"))
        let first = KeyedOffscreenWindow(size: NotebookWindow.portrait, dark: false)
        let second = KeyedOffscreenWindow(size: NotebookWindow.portrait, dark: true)
        defer {
            first.close()
            second.close()
        }
        first.show(NotebookWindow(document: document))
        #expect(try await first.until { first.toolbar?.items.isEmpty == false })
        second.show(NotebookWindow(document: document))
        #expect(try await second.until { second.toolbar?.items.isEmpty == false })
        for window in [first, second] {
            window.contentView?.superview?.layoutSubtreeIfNeeded()
            let toolbar = try #require(window.toolbar)
            #expect(toolbar.allowsUserCustomization)
            let names = toolbar.items.map(\.itemIdentifier.rawValue)
            #expect(Set(names).count == names.count, "an item shows twice: \(names)")
            let order = Self.order.compactMap { id in names.firstIndex { $0.hasSuffix(id) } }
            #expect(order == order.sorted() && order.count == Self.order.count, "\(names)")
        }
        // A window opened after another closed, as a note opened after one was closed.
        first.close()
        let third = KeyedOffscreenWindow(size: NotebookWindow.portrait, dark: false)
        defer { third.close() }
        third.show(NotebookWindow(document: document))
        #expect(try await third.until { third.toolbar?.items.isEmpty == false })
        third.contentView?.superview?.layoutSubtreeIfNeeded()
        #expect(third.toolbar?.items.count == second.toolbar?.items.count)
    }

    /// The find field shows in the toolbar at the window's default size and a large one (#460): a
    /// search field with room for a word, inside the window, never left under the overflow button.
    @Test(arguments: [CGSize(width: 1000, height: 720), CGSize(width: 1600, height: 1100)])
    func theFindFieldShowsInTheToolbar(size: CGSize) async throws {
        let window = KeyedOffscreenWindow(size: size, dark: false)
        defer { window.close() }
        window.show(NotebookWindow(document: NoteDocument(data: try Fixtures.data("content.note"))))
        #expect(try await window.until { Self.field(in: window) != nil })
        window.contentView?.superview?.layoutSubtreeIfNeeded()
        let field = try #require(Self.field(in: window))
        let frame = field.convert(field.bounds, to: nil)
        #expect(frame.width >= 120 && window.contentLayoutRect.union(frame).width <= window.frame.width, "\(frame)")
    }

    /// A find under way shows exactly one find field: the toolbar's in a window of the default
    /// width, the bar's in the narrowest one, where the toolbar's is under the overflow button.
    @Test(arguments: [CGSize(width: 640, height: 420), CGSize(width: 1000, height: 720)])
    func aFindShowsOneField(size: CGSize) async throws {
        let note = try Fixtures.note("content.note")
        let text = NoteText(indexer: NoteIndexer())
        text.showFind()
        text.query = "harvest"
        let window = KeyedOffscreenWindow(size: size, dark: false)
        defer { window.close() }
        window.show(NotebookView(pages: PageImages(note: note)).environment(text))
        #expect(try await window.until { Self.fields(in: window).count == 1 })
        // timing-independent: turns of the main actor for the toolbar to settle; the count is checked after.
        try await Task.sleep(for: .milliseconds(300))
        #expect(Self.fields(in: window).count == 1, "\(size)")
    }

    /// Every search field in `window`'s frame view.
    static func fields(in window: NSWindow) -> [NSSearchField] {
        var found: [NSSearchField] = []
        var views = [window.contentView?.superview].compactMap(\.self)
        while let view = views.popLast() {
            if let field = view as? NSSearchField { found.append(field) }
            views += view.subviews
        }
        return found
    }

    /// The search field anywhere in `window`'s frame view, the toolbar included.
    static func field(in window: NSWindow) -> NSSearchField? {
        var views = [window.contentView?.superview].compactMap(\.self)
        while let view = views.popLast() {
            if let field = view as? NSSearchField { return field }
            views += view.subviews
        }
        return nil
    }
}
