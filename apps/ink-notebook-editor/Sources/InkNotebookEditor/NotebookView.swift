import AppKit
import InkNotebookEditorKit
import NoteFormat
import SwiftUI

extension FocusedValues {
    /// The page of the notebook window in front, for the Go menu.
    @Entry var pageNavigator: Binding<PageNavigator>?
}

/// The window of one open `.note`: its state, else the notebook (#262).
struct NotebookWindow: View {
    let document: NoteDocument
    /// Whether the page list shows when the window opens.
    var columns: NavigationSplitViewVisibility = .automatic
    @Environment(\.openDocument) private var openDocument
    @State private var dropFailure: String?
    /// The note's words, read in the background for Find in Note and Copy as Text (#321).
    @State private var indexer = NoteIndexer()

    var body: some View {
        Group {
            switch document.content {
            case .unreadable(let reason):
                StateView(.unreadable(reason)) { OpenAnotherButton() }
            case .note(let note) where note.pages.isEmpty:
                StateView(.noPages) { OpenAnotherButton() }
            case .note(let note):
                NotebookView(pages: PageImages(note: note), columns: columns)
            }
        }
        .task {
            if case .note(let note) = document.content { await indexer.run(note: note) }
        }
        .frame(
            minWidth: Self.minimum.width, idealWidth: idealSize.width, minHeight: Self.minimum.height,
            idealHeight: idealSize.height
        )
        // A `.note` dropped on the window opens in its own window, as on the Dock icon.
        .dropDestination(for: URL.self) { urls, _ in
            let notes = urls.filter { TabletListing.isNote($0.lastPathComponent) }
            for url in notes {
                Task {
                    do {
                        try await openDocument(at: url)
                    } catch {
                        dropFailure = Copy.cannotOpen(url.lastPathComponent, error.localizedDescription)
                    }
                }
            }
            return !notes.isEmpty
        }
        .alert(Copy.openFailedTitle, isPresented: .constant(dropFailure != nil), presenting: dropFailure) { _ in
            Button(Copy.ok) { dropFailure = nil }
        } message: { failure in
            Text(failure)
        }
    }
}

extension NotebookWindow {
    /// The smallest window, in points.
    static let minimum = CGSize(width: 640, height: 420)
    /// The window a portrait notebook, or a window with no page, opens at, in points.
    static let portrait = CGSize(width: 1000, height: 720)

    /// The size the window opens at: wide for a landscape first page, so the page fits with no
    /// blank band, as Preview opens a landscape PDF (#291). The app's window placement keeps it on
    /// the screen.
    var idealSize: CGSize {
        guard case .note(let note) = document.content, !note.pages.isEmpty else { return Self.portrait }
        return PageFit.window(
            firstPage: PageImages(note: note).size(of: 0), sidebar: NotebookView.sidebarWidth,
            margin: PageView.margin, portrait: Self.portrait)
    }
}

/// The page list beside the current page, scaled to the window, as Preview shows a PDF.
struct NotebookView: View {
    /// The page list's width when the window opens, in points.
    static let sidebarWidth: CGFloat = 170

    @State var pages: PageImages
    @State private var navigator: PageNavigator
    @State private var columns: NavigationSplitViewVisibility
    @FocusState private var pageFocused: Bool
    @Environment(\.displayScale) private var displayScale

    init(pages: PageImages, page: Int = 0, columns: NavigationSplitViewVisibility = .automatic) {
        _pages = State(initialValue: pages)
        _navigator = State(initialValue: PageNavigator(pageCount: pages.note.pages.count, index: page))
        _columns = State(initialValue: columns)
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columns) {
            ScrollViewReader { list in
                List(selection: selection) {
                    ForEach(0..<navigator.pageCount, id: \.self) { index in
                        ThumbnailRow(index: index, count: navigator.pageCount, pages: pages)
                            .id(index)
                            .task(id: displayScale) { await pages.loadThumbnail(index, scale: displayScale) }
                    }
                }
                // The current page's thumbnail stays in view, as in Preview, however the page changed.
                .onChange(of: navigator.index) { _, index in
                    if let index { list.scrollTo(index) }
                }
            }
            .accessibilityLabel(Copy.pages)
            .navigationSplitViewColumnWidth(min: 150, ideal: Self.sidebarWidth, max: 260)
        } detail: {
            if let index = navigator.index {
                PageView(index: index, count: navigator.pageCount, pages: pages)
                    .task(id: index) { await pages.loadPage(index) }
                    // The page holds the keyboard focus, so the page keys work with the sidebar
                    // shown or hidden, and Page Up and Page Down never scroll the list instead.
                    .focusable()
                    .focusEffectDisabled()
                    .focused($pageFocused)
            }
        }
        .navigationSubtitle(navigator.index.map { Copy.pageOf($0 + 1, navigator.pageCount) } ?? "")
        .focusedSceneValue(\.pageNavigator, $navigator)
        .onKeyPress(keys: Set(PageKeys.moves.keys)) { press in
            guard let move = PageKeys.moves[press.key] else { return .ignored }
            navigator.go(move)
            return .handled
        }
        .onAppear { pageFocused = true }
    }

    /// A click in the page list shows that page and gives the focus back to the page.
    private var selection: Binding<Int?> {
        Binding(
            get: { navigator.index },
            set: {
                if let page = $0 { navigator.show(page) }
                pageFocused = true
            })
    }
}

/// The keys that turn pages in a notebook window: the arrows, Page Up and Page Down, Home and End.
enum PageKeys {
    static let moves: [KeyEquivalent: PageMove] = [
        .leftArrow: .previous, .upArrow: .previous, .pageUp: .previous,
        .rightArrow: .next, .downArrow: .next, .pageDown: .next,
        .home: .first, .end: .last,
    ]
}

private struct ThumbnailRow: View {
    let index: Int
    let count: Int
    let pages: PageImages

    var body: some View {
        // The row is as tall as its page's thumbnail, so a landscape page leaves no blank band (#291).
        let fitted = PageFit.fitted(page: pages.size(of: index), in: PageImages.thumbnailBox)
        VStack(spacing: 4) {
            Group {
                switch pages.thumbnail(index) {
                case .ready(let image):
                    PaperImage(image: image)
                case .loading:
                    PaperPlaceholder(size: fitted)
                case .failed:
                    PaperPlaceholder(size: fitted)
                        .overlay { Image(systemName: "exclamationmark.triangle").foregroundStyle(.red) }
                }
            }
            .frame(width: PageImages.thumbnailBox.width, height: fitted.height)
            Text("\(index + 1)")
                .font(.caption)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .tag(index)
    }

    private var label: String {
        if case .failed = pages.thumbnail(index) {
            return "\(Copy.pageOf(index + 1, count)), \(Copy.cannotBeDrawn)"
        }
        return Copy.pageOf(index + 1, count)
    }
}

private struct PageView: View {
    /// The space around the page, in points.
    static let margin: CGFloat = 24

    let index: Int
    let count: Int
    let pages: PageImages
    @Environment(\.displayScale) private var displayScale
    @State private var fitted: Fitted?

    /// The page resampled for one size on screen.
    struct Fitted {
        let key: Key
        let image: CGImage
    }

    struct Key: Equatable {
        let index: Int
        let width: Int
        let height: Int
    }

    var body: some View {
        GeometryReader { proxy in
            let box = CGSize(
                width: max(proxy.size.width - 2 * Self.margin, 0), height: max(proxy.size.height - 2 * Self.margin, 0))
            Group {
                switch pages.page(index) {
                case .ready(let full):
                    page(full, in: box)
                case .loading:
                    StateView(.loading(Copy.loadingPage))
                case .failed(let reason):
                    StateView(.pageFailed(reason))
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .background(.background.secondary)
    }

    /// The page at the size it fits in `box`, drawn from a raster of exactly that many pixels.
    private func page(_ full: CGImage, in box: CGSize) -> some View {
        let points = PageFit.fitted(page: CGSize(width: full.width, height: full.height), in: box)
        let pixels = PageFit.pixels(for: points, scale: displayScale)
        let key = Key(index: index, width: pixels.width, height: pixels.height)
        let shown = fitted.flatMap { $0.key == key ? $0.image : nil }
        return PaperImage(image: shown ?? full, label: Copy.pageOf(index + 1, count))
            .frame(width: points.width, height: points.height)
            .overlay(alignment: .top) {
                if let style = pages.missingTemplates[index] {
                    TemplateMarker(style: style)
                }
            }
            .task(id: key) {
                guard let image = await PageImages.fit(full, to: pixels) else { return }
                fitted = Fitted(key: key, image: image)
            }
    }
}

/// The sign on a page whose template could not be drawn: the ink shows, the template does not (#308).
private struct TemplateMarker: View {
    /// The space inside the capsule, in points.
    static let inset = EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10)
    /// The space between the capsule and the page's top edge, in points.
    static let margin: CGFloat = 8

    let style: String

    var body: some View {
        Label(Copy.templateNotShown(style), systemImage: "exclamationmark.triangle.fill")
            .symbolRenderingMode(.multicolor)
            .font(.callout)
            .padding(Self.inset)
            .background(.regularMaterial, in: .capsule)
            .padding(Self.margin)
    }
}

/// A page as paper: white in light and dark mode, like a page in Preview, with a hairline edge.
private struct PaperImage: View {
    let image: CGImage
    var label: String?

    var body: some View {
        let image =
            if let label {
                Image(image, scale: 1, label: Text(label))
            } else {
                Image(decorative: image, scale: 1)
            }
        image
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .overlay { Rectangle().strokeBorder(.separator, lineWidth: 1) }
            .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
    }
}

private struct PaperPlaceholder: View {
    let size: CGSize

    var body: some View {
        Rectangle()
            .fill(.quaternary)
            .frame(width: size.width, height: size.height)
    }
}

struct OpenAnotherButton: View {
    var body: some View {
        Button(Copy.openAnother) {
            NSDocumentController.shared.openDocument(nil)
        }
    }
}
