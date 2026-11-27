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
    /// The toolbar's items, in Preview's order.
    static let order = ["toggleSidebar", "layout", "zoom", "selection", "shape", "textBox", "search"]

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
}
