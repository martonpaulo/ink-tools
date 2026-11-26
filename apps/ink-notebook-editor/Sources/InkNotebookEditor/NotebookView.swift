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
    /// The file's name without its extension, for the files a copy or a drag makes (#323).
    var name = ""
    @Environment(\.openDocument) private var openDocument
    @State private var dropFailure: String?
    /// The note's words, read in the background for Find in Note and Copy as Text (#321).
    @State private var text = NoteText(indexer: NoteIndexer())
    /// The watch of a note opened from the tablet (#315); nil for any other file.
    @State private var live: LiveNote?
    /// The edits of a note opened from the tablet (#313, #314); nil for any other file.
    @State private var editor: NoteEditor?
    @Environment(\.documentConfiguration) private var configuration

    var body: some View {
        Group {
            switch document.content {
            case .unreadable(let reason):
                StateView(.unreadable(reason)) { OpenAnotherButton() }
            case .note(let note) where note.pages.isEmpty:
                StateView(.noPages) { OpenAnotherButton() }
            case .note(let note):
                NotebookView(pages: PageImages(note: note), columns: columns, live: live, editor: editor)
            }
        }
        .environment(text)
        .onAppear {
            live = live ?? LiveNote.of(configuration?.fileURL)
            if editor == nil, case .note(let note) = document.content { editor = NoteEditor.of(live, note: note) }
        }
        .task {
            text.name = name
            if case .note(let note) = document.content { await text.indexer.run(note: note) }
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
    @State private var sidebar: SidebarMode
    @FocusState private var pageFocused: Bool
    @Environment(\.displayScale) private var displayScale
    @Environment(NoteText.self) private var text: NoteText?
    /// The watch of a note opened from the tablet, which keeps its pages fresh (#315).
    let live: LiveNote?
    /// The edits of a note opened from the tablet (#313, #314); nil for a note opened from a file.
    let editor: NoteEditor?

    init(
        pages: PageImages, page: Int = 0, columns: NavigationSplitViewVisibility = .automatic,
        viewer: PageViewer = PageViewer(), sidebar: SidebarMode = .pages, live: LiveNote? = nil,
        editor: NoteEditor? = nil
    ) {
        self.live = live
        self.editor = editor
        _pages = State(initialValue: pages)
        _navigator = State(initialValue: PageNavigator(pageCount: pages.note.pages.count, index: page))
        _columns = State(initialValue: columns)
        _viewer = State(initialValue: viewer)
        _sidebar = State(initialValue: sidebar)
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columns) {
            Group {
                switch sidebar {
                case .pages: pageList
                case .headings: HeadingsList(note: pages.note, navigator: $navigator) { pageFocused = true }
                }
            }
            // Pages or Headings, as Preview's sidebar shows thumbnails or a Table of Contents (#331).
            .safeAreaInset(edge: .top) {
                Picker(Copy.sidebarShows, selection: $sidebar) {
                    ForEach(SidebarMode.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.horizontal, 8)
            }
            .navigationSplitViewColumnWidth(min: 150, ideal: Self.sidebarWidth, max: 260)
        } detail: {
            // The find bar stands above the pages, under the toolbar, as in Safari and TextEdit
            // (#322): a bar of the scroll's top edge, so the pages keep their margin below it.
            pageArea
                .safeAreaBar(edge: .top) {
                    VStack(spacing: 0) {
                        if let text, text.findShown {
                            FindBar(text: text) { pageFocused = true }
                        }
                        // A refused edit is taken back, and the bar says why until dismissed (#314).
                        if let editor, let refusal = editor.refusal {
                            RefusalBar(message: refusal) { editor.refusal = nil }
                        }
                    }
                }
        }
        .toolbar { ViewerToolbar(viewer: viewer) }
        .navigationSubtitle(subtitle)
        // Edit › Select All and Escape, by the menu or by the keys when no menu holds them (#324).
        .onCommand(#selector(NSResponder.selectAll(_:))) { selectAll() }
        .onExitCommand { viewer.selection.clear() }
        .onKeyPress(.escape) {
            guard !viewer.selection.isEmpty else { return .ignored }
            viewer.selection.clear()
            return .handled
        }
        .onKeyPress(characters: ["a"]) { press in
            guard press.modifiers == .command else { return .ignored }
            selectAll()
            return .handled
        }
        .focusedSceneValue(\.pageNavigator, $navigator)
        .focusedSceneValue(\.pageViewer, viewer)
        .focusedSceneValue(\.pageImages, pages)
        .focusedSceneValue(\.noteText, text)
        .focusedSceneValue(\.sidebarMode, $sidebar)
        .focusedSceneValue(\.noteEditor, editor)
        // An edit draws at once: the Mac's copy with every edit on its way (#314).
        .onChange(of: editor?.revision) {
            if let editor { take(editor.shown) }
        }
        // Insert Page, Delete Page and Revert to Backup ask in the window (#313, #329).
        .modifier(EditDialogs(editor: editor) { navigator.show($0) })
        // View › Pages and Headings show the sidebar too, when it is hidden.
        .onChange(of: sidebar) { columns = .all }
        // The current match's page shows, as Find Next and Previous move through the note.
        .onChange(of: text?.search.currentMatch) { _, match in
            if let match { navigator.show(match.page) }
        }
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

    /// «Page 2 of 4», and how many elements are selected when any are.
    private var subtitle: String {
        guard let index = navigator.index else { return "" }
        let selected = viewer.selection.page == index ? viewer.selection.ids.count : 0
        return selected > 0
            ? Copy.pageOfSelected(index + 1, navigator.pageCount, selected)
            : Copy.pageOf(index + 1, navigator.pageCount)
    }

    /// Draws a newer note: the tablet's copy, or the Mac's copy with the edits on their way.
    private func take(_ newer: NoteFile) {
        text?.forgetHeadings()
        let changed = pages.update(newer)
        // Find and Copy as Text read the newer copy too.
        if let text { Task { await text.refresh(note: newer, changed: changed) } }
        // A selection names elements by their place on the page, which a change moves.
        if let page = viewer.selection.page, changed?.contains(page) ?? true { viewer.selection.clear() }
        if newer.pages.count != navigator.pageCount {
            navigator = PageNavigator(pageCount: newer.pages.count, index: navigator.index ?? 0)
        }
    }

    /// The page list's move, only while the note can be edited.
    private var pageDrag: ((IndexSet, Int) -> Void)? {
        guard editor?.canEdit == true else { return nil }
        return { dragPages($0, $1) }
    }

    /// Moves a page by a drag in the page list, and the current page goes with it.
    private func dragPages(_ source: IndexSet, _ destination: Int) {
        guard let editor, let from = source.first, let edit = NoteEdit.pageDrag(from, before: destination),
            case .movePage(_, let to) = edit, editor.movePage(from: from, to: to)
        else { return }
        navigator.show(to)
    }

    /// Selects every element of the current page, once its elements are read.
    private func selectAll() {
        guard viewer.layout == .scroll, let index = navigator.index else { return }
        Task {
            await pages.loadElements(index)
            guard let items = pages.selectable(index) else { return }
            viewer.selection.selectAll(Set(items.map(\.id)), page: index)
        }
    }

    /// The pages, as one scroll or a grid.
    private var pageArea: some View {
        Group {
            switch viewer.layout {
            case .scroll:
                PageScroll(pages: pages, navigator: $navigator, viewer: viewer)
            case .grid:
                PageGrid(pages: pages, navigator: $navigator, viewer: viewer)
            }
        }
        // A note from the tablet stays live while its window is open: the task ends with the
        // window, so no watch runs with no window (#315).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let live { SyncStatusLine(live: live, sending: editor?.pending.count ?? 0) }
        }
        .task(id: live?.tabletPath) {
            guard let live, live.watches else { return }
            await live.run { newer in
                // With edits, the newer copy is their base, and the editor draws them over it.
                if let editor { editor.baseChanged(newer) } else { take(newer) }
            }
        }
        // The pages hold the keyboard focus, so the page keys work with the sidebar shown or
        // hidden, and Page Up and Page Down never scroll the list instead.
        .focusable()
        .focusEffectDisabled()
        .focused($pageFocused)
        // Edit › Copy takes the current page out as PNG, PDF and its text (#323).
        .onCopyCommand {
            if let (page, items) = viewer.selected(in: pages, on: navigator.index), let text {
                return [text.provider(of: pages.note, page: page, selected: items)]
            }
            guard let page = navigator.index, let provider = text?.provider(of: pages.note, page: page) else {
                return []
            }
            return [provider]
        }
    }

    /// Every page's thumbnail; the current one stays in view, as in Preview, however the page changed.
    private var pageList: some View {
        ScrollViewReader { list in
            List(selection: selection) {
                ForEach(0..<navigator.pageCount, id: \.self) { index in
                    ThumbnailRow(index: index, count: navigator.pageCount, pages: pages)
                        .id(index)
                        .task(id: DrawKey(scale: displayScale, generation: pages.generation)) {
                            await pages.loadThumbnail(index, scale: displayScale)
                        }
                        // A thumbnail dragged to Finder or another app gives its page (#323).
                        .itemProvider { text?.provider(of: pages.note, page: index) }
                        .contextMenu { PageMenu(editor: editor, page: index) }
                }
                // A thumbnail dragged within the list moves its page, on a note from the tablet (#330).
                .onMove(perform: pageDrag)
            }
            // Delete in the page list asks to delete the page in front (#329).
            .onDeleteCommand {
                if editor?.canRemovePage == true { editor?.removalAsked = navigator.index }
            }
            .onChange(of: navigator.index) { _, index in
                if let index { list.scrollTo(index) }
            }
        }
        .accessibilityLabel(Copy.pages)
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
    /// The drawn pages and their elements of the notebook window in front, for Edit › Copy as Text
    /// of a selection (#323).
    @Entry var pageImages: PageImages?
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
        _position = State(initialValue: Self.position(of: page))
        _inView = State(initialValue: page)
    }

    /// The scroll's place for `page`: the top of the content for the first page, so its margin
    /// shows below the toolbar, as the safe area keeps it; else the page's top (#319).
    static func position(of page: Int) -> ScrollPosition {
        page == 0 ? ScrollPosition(edge: .top) : ScrollPosition(id: page, anchor: .top)
    }

    private func scroll(to page: Int) {
        if page == 0 { position.scrollTo(edge: .top) } else { position.scrollTo(id: page, anchor: .top) }
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
                            size: viewer.zoom.size(of: pages.size(of: index), in: viewport, scale: displayScale),
                            viewer: viewer
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
            .task(id: VisibleKey(pages: visible, generation: pages.generation)) {
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
                scroll(to: page)
            }
            // The scroll opens at the current page; the initial position alone is not always applied
            // before the first layout.
            .onAppear {
                if let page = navigator.index { scroll(to: page) }
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
                        // A click opens the page (#319); the keys move the selection and Return opens it.
                        GridCell(
                            index: index, count: navigator.pageCount, pages: pages, isCurrent: index == navigator.index
                        ) {
                            navigator.show(index)
                            viewer.layout = .scroll
                        }
                        .id(index)
                        .task(id: DrawKey(scale: displayScale, generation: pages.generation)) {
                            await pages.loadThumbnail(index, .grid, scale: displayScale)
                        }
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
    let open: () -> Void

    var body: some View {
        let box = PageImages.ThumbnailSize.grid.box
        let fitted = PageFit.fitted(page: pages.size(of: index), in: box)
        Button(action: open) {
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ThumbnailRow.label(index, count, pages.thumbnail(index, .grid)))
        .accessibilityAddTraits(isCurrent ? [.isButton, .isSelected] : .isButton)
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
            Picker(Copy.selectionTool, selection: $viewer.tool) {
                Label(Copy.rectangularSelection, systemImage: "rectangle.dashed").tag(
                    PageViewer.SelectionTool.rectangle
                )
                .help(Copy.rectangularSelection)
                Label(Copy.lassoSelection, systemImage: "lasso").tag(PageViewer.SelectionTool.lasso)
                    .help(Copy.lassoSelection)
            }
            .pickerStyle(.segmented)
            .labelStyle(.iconOnly)
            .disabled(viewer.layout != .scroll)
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

/// What a thumbnail is drawn for: the display's scale and the copy of the note (#315).
struct DrawKey: Hashable {
    let scale: CGFloat
    let generation: Int
}

/// The pages in view of one copy of the note, so a newer copy draws them again (#315).
struct VisibleKey: Hashable {
    let pages: Set<Int>
    let generation: Int
}

/// The keys that turn pages in a notebook window: the arrows, Page Up and Page Down, Home and End.
enum PageKeys {
    static let moves: [KeyEquivalent: PageMove] = [
        .leftArrow: .previous, .upArrow: .previous, .pageUp: .previous,
        .rightArrow: .next, .downArrow: .next, .pageDown: .next,
        .home: .first, .end: .last,
    ]
}

/// One page in the page list: its thumbnail and number.
struct ThumbnailRow: View {
    let index: Int
    let count: Int
    let pages: PageImages
    @Environment(\.backgroundProminence) private var prominence

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
                .foregroundStyle(Tokens.sidebarText(on: prominence))
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
    let viewer: PageViewer
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
            .overlay {
                SelectionLayer(index: index, pages: pages, viewer: viewer, size: size)
            }
            .overlay(alignment: .top) {
                if let style = pages.missingTemplates[index] {
                    PageMarker(text: Copy.templateNotShown(style))
                } else if case .failure = pages.elements[index] {
                    PageMarker(text: Copy.elementsNotSelectable)
                }
            }
            .overlay { FindMarks(page: index, pixels: pages.size(of: index), size: size) }
            .task(id: key) {
                guard resample, let image = await PageImages.fit(full, to: pixels) else { return }
                fitted = Fitted(key: key, image: image)
            }
    }
}

/// The sign on a page that shows but lacks a part: a template that could not be drawn, while the
/// ink shows (#308), or elements that cannot be read, so nothing on it selects (#324).
private struct PageMarker: View {
    /// The space inside the capsule, in points.
    static let inset = EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10)
    /// The space between the capsule and the page's top edge, in points.
    static let margin: CGFloat = 8

    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
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
