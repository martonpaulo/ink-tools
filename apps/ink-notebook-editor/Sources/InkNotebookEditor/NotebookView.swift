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

/// The page list beside every page of the note in one scroll, or beside a grid of every page,
/// as Preview shows a PDF (#262, #319).
struct NotebookView: View {
    /// The page list's width when the window opens, in points.
    static let sidebarWidth: CGFloat = 170

    @State var pages: PageImages
    @State private var navigator: PageNavigator
    @State private var columns: NavigationSplitViewVisibility
    @State private var viewer: PageViewer
    @FocusState private var pageFocused: Bool
    @Environment(\.displayScale) private var displayScale

    init(
        pages: PageImages, page: Int = 0, columns: NavigationSplitViewVisibility = .automatic,
        viewer: PageViewer = PageViewer()
    ) {
        _pages = State(initialValue: pages)
        _navigator = State(initialValue: PageNavigator(pageCount: pages.note.pages.count, index: page))
        _columns = State(initialValue: columns)
        _viewer = State(initialValue: viewer)
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
            Group {
                switch viewer.layout {
                case .scroll:
                    PageScroll(pages: pages, navigator: $navigator, viewer: viewer)
                case .grid:
                    PageGrid(pages: pages, navigator: $navigator, viewer: viewer)
                }
            }
            // The pages hold the keyboard focus, so the page keys work with the sidebar shown or
            // hidden, and Page Up and Page Down never scroll the list instead.
            .focusable()
            .focusEffectDisabled()
            .focused($pageFocused)
        }
        .toolbar { ViewerToolbar(viewer: viewer) }
        .navigationSubtitle(navigator.index.map { Copy.pageOf($0 + 1, navigator.pageCount) } ?? "")
        .focusedSceneValue(\.pageNavigator, $navigator)
        .focusedSceneValue(\.pageViewer, viewer)
        .onKeyPress(keys: Set(PageKeys.moves.keys).union([.return])) { press in
            if let target = viewer.scroll(for: press.key) {
                viewer.scrollTarget = target
                return .handled
            }
            if viewer.layout == .grid, let index = navigator.index {
                // In the grid, the arrows move by a cell and by a row, and Return opens the page.
                switch press.key {
                case .return:
                    viewer.layout = .scroll
                    return .handled
                case .upArrow, .downArrow:
                    let step = press.key == .upArrow ? -viewer.gridColumns : viewer.gridColumns
                    navigator.show(min(max(index + step, 0), navigator.pageCount - 1))
                    return .handled
                default: break
                }
            }
            guard let move = PageKeys.moves[press.key] else { return .ignored }
            navigator.go(move)
            return .handled
        }
        .onChange(of: navigator.index, initial: true) { _, index in
            if let index { viewer.page = pages.size(of: index) }
        }
        .onChange(of: displayScale, initial: true) { _, scale in viewer.scale = scale }
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

extension FocusedValues {
    /// How the notebook window in front shows its pages, for the View menu.
    @Entry var pageViewer: PageViewer?
}

/// Every page, one below the other, each drawn as it scrolls into view (#319). The scroll follows
/// the current page, and the current page follows the scroll.
private struct PageScroll: View {
    let pages: PageImages
    @Binding var navigator: PageNavigator
    let viewer: PageViewer
    @State private var position: ScrollPosition
    /// The page the scroll last reported, so a page the scroll set is not scrolled to again.
    @State private var inView: Int?
    /// The share of a page that counts it as on screen: any part of it.
    static let visibleShare = 0.001
    /// The pages on screen, as the scroll reports them.
    @State private var visible: Set<Int> = []
    /// The magnification a pinch started at, and where in the window.
    @State private var pinchBase: Double?
    @State private var pinchAnchor: CGPoint?
    @Environment(\.displayScale) private var displayScale

    init(pages: PageImages, navigator: Binding<PageNavigator>, viewer: PageViewer) {
        self.pages = pages
        _navigator = navigator
        self.viewer = viewer
        let page = navigator.wrappedValue.index ?? 0
        _position = State(initialValue: ScrollPosition(id: page, anchor: .top))
        _inView = State(initialValue: page)
    }

    var body: some View {
        GeometryReader { proxy in
            let viewport = CGSize(
                width: max(proxy.size.width - 2 * PageView.margin, 0),
                height: max(proxy.size.height - 2 * PageView.margin, 0))
            ScrollView([.vertical, .horizontal]) {
                // Each page carries half the margin above and below it, so a page scrolled to the top
                // keeps a margin above it, and two pages keep a whole margin between them.
                LazyVStack(spacing: 0) {
                    ForEach(0..<navigator.pageCount, id: \.self) { index in
                        PageView(
                            index: index, count: navigator.pageCount, pages: pages,
                            size: viewer.zoom.size(of: pages.size(of: index), in: viewport, scale: displayScale)
                        )
                        .padding(.vertical, PageView.margin / 2)
                        .id(index)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, PageView.margin)
                .padding(.vertical, PageView.margin / 2)
                .frame(minWidth: proxy.size.width)
            }
            .scrollPosition($position, anchor: .top)
            .onScrollGeometryChange(for: ScrollGeometry.self, of: { $0 }) { _, geometry in
                viewer.offset = geometry.contentOffset
                viewer.visible = geometry.visibleRect.size
                viewer.content = geometry.contentSize
            }
            // A page scrolled under the toolbar stops at a hard edge, as a document does in Preview,
            // so a white page never sits behind the toolbar's controls.
            .scrollEdgeEffectStyle(.hard, for: .top)
            .onScrollTargetVisibilityChange(idType: Int.self, threshold: Self.visibleShare) { visible = Set($0) }
            // The pages in view and their neighbours draw, and no other page stays drawn. Before the
            // scroll reports its pages, the current page draws.
            .task(id: visible) {
                await pages.show(visible.isEmpty ? Set([navigator.index ?? 0]) : visible)
            }
            .onChange(of: position.viewID(type: Int.self)) { _, page in
                guard let page, page != inView else { return }
                inView = page
                navigator.show(page)
            }
            .onChange(of: navigator.index) { _, page in
                guard let page, page != inView else { return }
                inView = page
                position.scrollTo(id: page, anchor: .top)
            }
            // The scroll opens at the current page; the initial position alone is not always applied
            // before the first layout.
            .onAppear {
                if let page = navigator.index { position.scrollTo(id: page, anchor: .top) }
            }
            // A new zoom keeps the place under the fingers of a pinch, else at the middle of the
            // window, where it was, and the same share of the width, as Preview zooms.
            .onChange(of: viewer.zoom) { old, new in
                let anchor = pinchAnchor ?? CGPoint(x: viewer.visible.width / 2, y: viewer.visible.height / 2)
                let y = stack(old, viewport).keeping(anchor.y, at: viewer.offset.y, in: stack(new, viewport))
                let share = viewer.content.width > 0 ? (viewer.offset.x + anchor.x) / viewer.content.width : 0.5
                let width = max(widest(new, viewport) + 2 * PageView.margin, viewer.visible.width)
                position.scrollTo(point: CGPoint(x: max(share * width - anchor.x, 0), y: y))
            }
            .onChange(of: viewport, initial: true) { _, viewport in viewer.viewport = viewport }
            .onChange(of: viewer.scrollTarget) { _, target in
                guard let target else { return }
                position.scrollTo(point: target)
                viewer.scrollTarget = nil
            }
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        let base = pinchBase ?? viewer.magnification
                        pinchBase = base
                        pinchAnchor = value.startLocation
                        viewer.zoom = .pinched(from: base, by: value.magnification)
                    }
                    .onEnded { _ in
                        pinchBase = nil
                        pinchAnchor = nil
                    })
        }
        .background(.background.secondary)
    }

    /// The pages' heights at `zoom`, for the place a zoom keeps.
    private func stack(_ zoom: PageZoom, _ viewport: CGSize) -> PageStack {
        PageStack(
            heights: (0..<navigator.pageCount).map {
                zoom.size(of: pages.size(of: $0), in: viewport, scale: displayScale).height
            },
            margin: PageView.margin)
    }

    /// The widest page at `zoom`, in points.
    private func widest(_ zoom: PageZoom, _ viewport: CGSize) -> CGFloat {
        (0..<navigator.pageCount).map { zoom.size(of: pages.size(of: $0), in: viewport, scale: displayScale).width }
            .max() ?? 0
    }
}

/// Every page as a grid of thumbnails, as Preview's Contact Sheet; a click shows that page in the
/// scroll (#319).
private struct PageGrid: View {
    /// The space between the cells and around the grid, in points.
    static let spacing: CGFloat = 24

    let pages: PageImages
    @Binding var navigator: PageNavigator
    let viewer: PageViewer
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        ScrollViewReader { grid in
            ScrollView {
                LazyVGrid(
                    columns: [
                        GridItem(.adaptive(minimum: PageImages.ThumbnailSize.grid.box.width), spacing: Self.spacing)
                    ],
                    spacing: Self.spacing
                ) {
                    ForEach(0..<navigator.pageCount, id: \.self) { index in
                        // A click selects the page and a double click opens it, as in Preview.
                        GridCell(
                            index: index, count: navigator.pageCount, pages: pages, isCurrent: index == navigator.index,
                            select: { navigator.show(index) },
                            open: {
                                navigator.show(index)
                                viewer.layout = .scroll
                            }
                        )
                        .id(index)
                        .task(id: displayScale) { await pages.loadThumbnail(index, .grid, scale: displayScale) }
                    }
                }
                .padding(Self.spacing)
            }
            .onGeometryChange(for: CGFloat.self) {
                $0.size.width
            } action: { width in
                viewer.gridColumns = PageViewer.gridColumns(
                    width: width, cell: PageImages.ThumbnailSize.gridBox.width, spacing: Self.spacing)
            }
            .onAppear {
                if let index = navigator.index { grid.scrollTo(index) }
            }
            // The selected page stays in view as the keys move it.
            .onChange(of: navigator.index) { _, index in
                if let index { grid.scrollTo(index) }
            }
        }
        .background(.background.secondary)
    }
}

private struct GridCell: View {
    /// The space between the selection and the page, its corner radius and the space above the
    /// page number, in points.
    static let inset: CGFloat = 6

    let index: Int
    let count: Int
    let pages: PageImages
    let isCurrent: Bool
    let select: () -> Void
    let open: () -> Void

    var body: some View {
        let box = PageImages.ThumbnailSize.grid.box
        let fitted = PageFit.fitted(page: pages.size(of: index), in: box)
        Button(action: select) {
            VStack(spacing: Self.inset) {
                Thumbnail(state: pages.thumbnail(index, .grid), size: fitted)
                    .padding(Self.inset)
                    .background {
                        // The current page carries the selection, as in Preview's Contact Sheet.
                        if isCurrent {
                            RoundedRectangle(cornerRadius: Self.inset).fill(.tint)
                        }
                    }
                    .frame(height: box.height + 2 * Self.inset, alignment: .bottom)
                Text("\(index + 1)")
                    .font(.callout)
                    .monospacedDigit()
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(TapGesture(count: 2).onEnded(open))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ThumbnailRow.label(index, count, pages.thumbnail(index, .grid)))
        .accessibilityAddTraits(isCurrent ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction(named: Copy.openPage, open)
    }
}

/// The toolbar of a notebook window: the layout and the zoom, as Preview's toolbar holds them.
private struct ViewerToolbar: ToolbarContent {
    @Bindable var viewer: PageViewer

    var body: some ToolbarContent {
        ToolbarItem {
            Picker(Copy.viewLayout, selection: $viewer.layout) {
                // Preview's symbols for the same two views.
                Label(Copy.continuousScroll, systemImage: "scroll").tag(PageViewer.Layout.scroll)
                    .help(Copy.continuousScroll)
                Label(Copy.contactSheet, systemImage: "square.grid.3x3.square").tag(PageViewer.Layout.grid)
                    .help(Copy.contactSheet)
            }
            .pickerStyle(.segmented)
            .labelStyle(.iconOnly)
        }
        ToolbarItem {
            ControlGroup {
                Button(Copy.zoomOut, systemImage: "minus.magnifyingglass") {
                    if let zoom = viewer.zoomedOut { viewer.zoom = zoom }
                }
                .disabled(viewer.zoomedOut == nil)
                .help(Copy.zoomOut)
                Button(Copy.zoomIn, systemImage: "plus.magnifyingglass") {
                    if let zoom = viewer.zoomedIn { viewer.zoom = zoom }
                }
                .disabled(viewer.zoomedIn == nil)
                .help(Copy.zoomIn)
            } label: {
                Label(Copy.zoom, systemImage: "magnifyingglass")
            }
        }
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
        let box = PageImages.ThumbnailSize.sidebar.box
        let fitted = PageFit.fitted(page: pages.size(of: index), in: box)
        VStack(spacing: 4) {
            Thumbnail(state: pages.thumbnail(index), size: fitted)
                .frame(width: box.width, height: fitted.height)
            Text("\(index + 1)")
                .font(.caption)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.label(index, count, pages.thumbnail(index)))
        .tag(index)
    }

    /// «Page N of M», and that it cannot be drawn when its thumbnail failed.
    static func label(_ index: Int, _ count: Int, _ state: PageImages.State) -> String {
        if case .failed = state {
            return "\(Copy.pageOf(index + 1, count)), \(Copy.cannotBeDrawn)"
        }
        return Copy.pageOf(index + 1, count)
    }
}

/// A page's thumbnail, or its placeholder while it draws or when it cannot be drawn.
private struct Thumbnail: View {
    let state: PageImages.State
    let size: CGSize

    var body: some View {
        switch state {
        case .ready(let image):
            PaperImage(image: image)
                .frame(width: size.width, height: size.height)
        case .loading:
            PaperPlaceholder(size: size)
        case .failed:
            PaperPlaceholder(size: size)
                .overlay { Image(systemName: "exclamationmark.triangle").foregroundStyle(.red) }
        }
    }
}

/// One page of the scroll at its zoomed size, drawn from a raster of exactly that many pixels.
private struct PageView: View {
    /// The space around the pages and between them, in points.
    static let margin: CGFloat = 24

    let index: Int
    let count: Int
    let pages: PageImages
    /// The page's drawn size, in points.
    let size: CGSize
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
        Group {
            switch pages.page(index) {
            case .ready(let full):
                page(full)
            case .loading:
                PaperPlaceholder(size: size)
                    .overlay { StateView(.loading(Copy.loadingPage)) }
            case .failed(let reason):
                StateView(.pageFailed(reason))
                    .frame(width: size.width, height: size.height)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    /// The page drawn from a raster resampled to its drawn pixels; at Actual Size or larger the
    /// page's own raster shows, never one resampled up.
    private func page(_ full: CGImage) -> some View {
        let pixels = PageFit.pixels(for: size, scale: displayScale)
        let resample = pixels.width < full.width
        let key = Key(index: index, width: pixels.width, height: pixels.height)
        let shown = resample ? fitted.flatMap { $0.key == key ? $0.image : nil } : nil
        return PaperImage(image: shown ?? full, label: Copy.pageOf(index + 1, count))
            .frame(width: size.width, height: size.height)
            .overlay(alignment: .top) {
                if let style = pages.missingTemplates[index] {
                    TemplateMarker(style: style)
                }
            }
            .task(id: key) {
                guard resample, let image = await PageImages.fit(full, to: pixels) else { return }
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
