import AppKit
import SwiftUI
import Testing

@testable import InkNotebookEditor

/// The off-screen renders draw a dark window as the app draws it in dark mode (#420): the
/// sidebar's text light on the dark sidebar, not dark on dark. Runs in every `make test`, with no
/// file written.
@MainActor
@Suite struct AppearanceTests {
    /// The page list's real rows, their thumbnails not drawn yet, so the only light pixels in a
    /// dark sidebar are the page numbers, and the only dark ones in a light sidebar too.
    struct Sidebar: View {
        let pages: PageImages

        var body: some View {
            NavigationSplitView(columnVisibility: .constant(.all)) {
                List {
                    ForEach(0..<pages.note.pages.count, id: \.self) { index in
                        ThumbnailRow(index: index, count: pages.note.pages.count, pages: pages)
                    }
                }
            } detail: {
                Color.clear
            }
        }
    }

    @Test(arguments: [false, true])
    func theSidebarTextContrastsWithItsBackgroundInEitherAppearance(dark: Bool) async throws {
        let pages = PageImages(note: try Fixtures.note("content.note"))
        let png = try await OffscreenWindow.png(
            of: AnyView(Sidebar(pages: pages)), size: CGSize(width: 640, height: 420), dark: dark)
        let bitmap = try #require(NSBitmapImageRep(data: png))
        // The sidebar's lines that hold page numbers: left of the split, below the title bar, and
        // with no paper on them, so a thumbnail's placeholder never counts as text.
        let sidebar = 16..<140
        let lines = (60..<410).map { y in
            sidebar.compactMap { bitmap.colorAt(x: $0, y: y)?.usingColorSpace(.deviceGray)?.whiteComponent }
        }
        let paper: CGFloat = 0.97
        let text = lines.filter { line in !line.contains { dark ? $0 > paper : $0 < 1 - paper } }
        let greys = text.flatMap(\.self)
        let lightest = greys.max() ?? 0
        let darkest = greys.min() ?? 1
        if dark {
            // Light text on a dark sidebar: the background is dark and some text is light.
            #expect(darkest < 0.3, "the dark sidebar is not dark: \(darkest)")
            #expect(lightest > 0.7, "the sidebar's text is not light in dark mode: \(lightest)")
        } else {
            // Dark text on a light sidebar.
            #expect(lightest > 0.85, "the light sidebar is not light: \(lightest)")
            #expect(darkest < 0.5, "the sidebar's text is not dark in light mode: \(darkest)")
        }
    }
}
