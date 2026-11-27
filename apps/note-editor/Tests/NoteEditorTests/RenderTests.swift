import AppKit
import Foundation
import NoteEditorKit
import SwiftUI
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// Renders every window state, light and dark, at the smallest, default and a large window size,
/// into $RENDER_EVIDENCE (`make renders`). Off screen: the window is never ordered in, keys nothing
/// and draws at backing scale 1 (swift-apps.md › Snapshot goldens). Skipped without the variable.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["RENDER_EVIDENCE"] != nil))
final class RenderTests {
    static let sizes: [(name: String, size: CGSize)] = [
        ("small", CGSize(width: 640, height: 420)),
        ("default", CGSize(width: 1000, height: 720)),
        ("large", CGSize(width: 1600, height: 1100)),
    ]
    static let tabletSizes: [(name: String, size: CGSize)] = [
        ("small", CGSize(width: 480, height: 360)),
        ("default", CGSize(width: 560, height: 440)),
        ("large", CGSize(width: 900, height: 700)),
    ]

    /// The fake inkctl scripts and the copies a render makes, removed when the suite ends.
    let scratch = FileManager.default.temporaryDirectory.appending(path: "render-tests-\(UUID().uuidString)")

    deinit {
        try? FileManager.default.removeItem(at: scratch)
    }

    let folder = URL(
        filePath: ProcessInfo.processInfo.environment["RENDER_EVIDENCE"] ?? "/dev/null", directoryHint: .isDirectory)

    @Test func notebookStates() async throws {
        let note = try Fixtures.note("content.note")
        let drawn = PageImages(note: note)
        for index in note.pages.indices {
            await drawn.loadThumbnail(index, scale: 1)
        }
        await drawn.loadPage(1)
        try await render("notebook", Self.sizes) { NotebookView(pages: drawn, page: 1) }
        // Zoomed in, every page in one scroll at Zoom to Width and at the smallest step, and the
        // grid of every page with the current one selected (#319).
        for index in note.pages.indices {
            await drawn.loadPage(index)
            await drawn.loadThumbnail(index, .grid, scale: 1)
        }
        try await render("notebook-zoomed", Self.sizes) {
            NotebookView(pages: drawn, page: 1, viewer: PageViewer(zoom: .magnification(2)))
        }
        try await render("notebook-width", Self.sizes) {
            NotebookView(pages: drawn, page: 1, viewer: PageViewer(zoom: .fitWidth))
        }
        try await render("notebook-scroll", Self.sizes) {
            NotebookView(pages: drawn, viewer: PageViewer(zoom: .magnification(PageZoom.steps[0])))
        }
        try await render("notebook-grid", Self.sizes) {
            NotebookView(pages: drawn, page: 1, viewer: PageViewer(layout: .grid))
        }
        // A selection: every element of page 1, a text box and a picture, framed with handles; and
        // strokes of a landscape page selected under the pointer (#324).
        await drawn.loadElements(0)
        let all = PageViewer()
        all.selection.selectAll(Set((drawn.selectable(0) ?? []).map(\.id)), page: 0)
        try await render("selection", Self.sizes) { NotebookView(pages: drawn, viewer: all) }
        let strokes = PageImages(note: try Fixtures.note("landscape-tablet.note"))
        await strokes.loadPage(0)
        await strokes.loadThumbnail(0, scale: 1)
        await strokes.loadElements(0)
        let some = PageViewer()
        let found = HitTest.rectangle(
            CGRect(x: 290, y: 290, width: 300, height: 130), in: strokes.selectable(0) ?? [])
        some.selection.take(found, page: 0, adding: false)
        try await render("selection-landscape", Self.sizes) { NotebookView(pages: strokes, viewer: some) }
        // A note opened from the tablet carries its sync line in each state (#315); the renders
        // never start the watch, so nothing reaches the tablet.
        let stamp = NoteStamp(bytes: 377_142, modified: "2026-11-26T09:10:01+01:00")
        var offline = NoteWatch()
        offline.failed(.notConnected("no tablet answers on USB or Wi-Fi"))
        var gone = NoteWatch()
        gone.failed(.notFound("Note/Garden.note is not on the tablet."))
        for (state, watch) in [
            ("syncing", NoteWatch()), ("synced", NoteWatch()), ("offline", offline), ("failed", gone),
        ] {
            try await render("sync-\(state)", Self.sizes) {
                // Synced 3 s before each render, however long the renders before it took.
                var shown = watch
                if state == "synced" { shown.pulled(stamp, at: Date().addingTimeInterval(-3)) }
                let live = LiveNote(
                    tabletPath: "Note/Garden.note", local: scratch.appending(path: "Garden.note"),
                    inkctl: Inkctl(executable: nil, environment: [:]), watch: shown)
                live.watches = false
                return NotebookView(pages: drawn, live: live)
            }
        }
        // A landscape page draws wide and upright, its thumbnail too (#291).
        let landscape = try Fixtures.note("landscape.note")
        let wide = PageImages(note: landscape)
        for index in landscape.pages.indices {
            await wide.loadThumbnail(index, scale: 1)
        }
        await wide.loadPage(0)
        try await render("notebook-landscape", Self.sizes) { NotebookView(pages: wide) }
        // A landscape note's window opens wide, and its page fills it with no blank band (#291).
        let landscapeWindow = NotebookWindow(document: NoteDocument(data: try Fixtures.data("landscape.note")))
        try await render("notebook-landscape-window", [("opening", landscapeWindow.idealSize)]) {
            NotebookView(pages: wide)
        }
        // A page's template draws dark enough to see at every size, and one the reader cannot
        // draw carries its marker (#308).
        let templates = PageImages(note: try Fixtures.note("templates.note"))
        for index in templates.note.pages.indices {
            await templates.loadThumbnail(index, scale: 1)
        }
        await templates.loadPage(1)
        try await render("notebook-template", Self.sizes) { NotebookView(pages: templates, page: 1) }
        let damaged = PageImages(note: try Fixtures.damagedTemplateNote())
        await damaged.loadThumbnail(0, scale: 1)
        await damaged.loadPage(0)
        try await render("notebook-template-missing", Self.sizes) { NotebookView(pages: damaged) }
        // A page whose elements cannot be read names why, with its Copy Report button (#459).
        let unselectable = PageImages(note: try Fixtures.damagedElementsNote())
        await unselectable.loadThumbnail(0, scale: 1)
        await unselectable.loadPage(0)
        await unselectable.loadElements(0)
        try await render("notebook-elements-unreadable", Self.sizes) { NotebookView(pages: unselectable) }
        let loading = PageImages(note: note)
        try await render("notebook-loading", Self.sizes) { NotebookView(pages: loading) }
        try await render("unreadable", Self.sizes) {
            NotebookWindow(document: NoteDocument(data: Data("not a note".utf8)))
        }
        try await render("turned-off", Self.sizes) {
            NotebookWindow(
                document: NoteDocument(data: Data()) { _ in
                    throw InternalFailure(
                        item: Registry.items[0], method: "readNote", copyKey: "turnedOff",
                        cause: ModuleOff(reason: "until 2026-12-31"))
                })
        }
        try await render("page-failed", Self.sizes) { StateView(.pageFailed("page 2: the layer bitmap ends early")) }
    }

    /// A tablet that never answers in a render's time, so an edit stays on its way.
    final class SlowTablet: TabletWriting {
        /// A pull that waits too, so an edit stays on its way while a render waits for its drawing.
        let pullWaits: Bool

        init(pullWaits: Bool = false) { self.pullWaits = pullWaits }

        func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
            // timing-independent: a stand-in for a tablet that has not answered yet; no result waits on it.
            try? await Task.sleep(for: .seconds(3600))
            throw .cancelled
        }
        func push(_ local: URL, to note: String) async throws(InkctlFailure) { throw .cancelled }
        func pull(_ note: String, to destination: URL) async throws(InkctlFailure) {
            // timing-independent: a stand-in for a tablet that has not answered yet; no result waits on it.
            if pullWaits { try? await Task.sleep(for: .seconds(3600)) }
            throw .cancelled
        }
        func templates() async throws(InkctlFailure) -> [PageTemplateChoice] { [] }
    }

    /// The edits of a note from the tablet (#313, #314, #330): a page move drawn at once while it
    /// is on its way, the status line counting it, and a refused edit's bar. Nothing reaches a
    /// tablet: the watch never starts, and the tablet is a stand-in that never answers.
    @Test func editStates() async throws {
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let copy = scratch.appending(path: "Garden.note")
        try Fixtures.data("content.note").write(to: copy)
        let live = LiveNote(
            tabletPath: "Note/Garden.note", local: copy, inkctl: Inkctl(executable: nil, environment: [:]))
        live.watches = false
        let editor = NoteEditor(
            tabletPath: live.tabletPath, copy: copy, base: try Fixtures.note("content.note"), tablet: SlowTablet(),
            backups: NoteBackups(folder: scratch.appending(path: "Backups")))
        editor.movePage(from: 0, to: 2)
        let moved = PageImages(note: editor.shown)
        for index in moved.note.pages.indices {
            await moved.loadThumbnail(index, scale: 1)
        }
        await moved.loadPage(2)
        try await render("edit-sending", Self.sizes) {
            NotebookView(pages: moved, page: 2, live: live, editor: editor)
        }
        editor.refusal = WriteFailure.openOnTablet.message
        try await render("edit-refused", Self.sizes) {
            NotebookView(pages: moved, page: 2, live: live, editor: editor)
        }
        // An edit the tablet's newer note could not take goes to a conflict note beside it (#317).
        editor.refusal = WriteFailure.conflict("Note/Garden conflict 2026-11-27 08.30.00.note").message
        try await render("edit-conflict", Self.sizes) {
            NotebookView(pages: moved, page: 2, live: live, editor: editor)
        }
        editor.refusal = WriteFailure.restoreConflict("Note/Garden conflict 2026-11-27 08.30.00.note").message
        try await render("edit-conflict-restore", Self.sizes) {
            NotebookView(pages: moved, page: 2, live: live, editor: editor)
        }
        editor.refusal = nil
        // Insert Page… and Delete Page… (#329): the sheet under the toolbar and the confirmation in
        // the middle of the window, each over the window they open from. A sheet and an alert are
        // windows of their own, so each is drawn on its own and set over the window's render.
        // The sheet while the tablet's list loads, with the tablet's list (system and custom), and
        // with the note's own templates when the tablet did not answer (#451).
        let front = editor.shown.pages[2].style
        let lists: [(String, NoteEditor.TemplateList)] = [
            ("insert-page-loading", .loading),
            (
                "insert-page",
                .tablet(
                    TabletTemplates.ordered(
                        [
                            .system("style_white"), .system("style_5mm_grid"), .system("style_8mm_ruled_line"),
                            .system("style_5mm_dots"),
                            .custom(name: "Week plan", path: "/storage/emulated/0/MyStyle/Week plan.png"),
                        ], first: front))
            ),
            (
                "insert-page-note-only",
                .noteOnly(
                    TabletTemplates.ordered(editor.noteTemplates, first: front),
                    reason: InkctlFailure.notConnected("No tablet answered over USB or Wi-Fi.").words)
            ),
            (
                "insert-page-no-template",
                .noteOnly([], reason: InkctlFailure.notConnected("No tablet answered over USB or Wi-Fi.").words)
            ),
        ]
        for (name, list) in lists {
            editor.templateList = list
            try await render(name, Self.sizes) {
                ZStack(alignment: .top) {
                    NotebookView(pages: moved, page: 2, live: live, editor: editor)
                    InsertPageSheet(editor: editor, page: 2, loads: false) { _ in }
                        .background(.background, in: .rect(cornerRadius: 12))
                        .shadow(radius: 12)
                        .padding(.top, 52)
                }
            }
        }
        // One page, and two pages selected in the page list with Command-click.
        for (name, pages) in [("delete-page", [2]), ("delete-pages", [1, 2])] {
            for dark in [false, true] {
                let alert = try Self.alertImage(
                    title: Copy.deletePagesTitle(pages), message: Copy.deletePagesMessage(pages),
                    buttons: [Copy.delete, Copy.cancel], dark: dark)
                for (sizeName, size) in Self.sizes {
                    let png = try await OffscreenWindow.png(
                        of: AnyView(
                            ZStack {
                                NotebookView(pages: moved, page: 2, live: live, editor: editor, picked: Set(pages))
                                // The alert's panel draws its material behind it on screen only.
                                Image(nsImage: alert)
                                    .background(.regularMaterial, in: .rect(cornerRadius: 16))
                                    .shadow(radius: 12)
                            }), size: size, dark: dark)
                    try png.write(to: folder.appending(path: "\(name)-\(dark ? "dark" : "light")-\(sizeName).png"))
                }
            }
        }
    }

    /// A copy of `content.note` opened as if from the tablet, named `name`: its edits never reach a
    /// tablet, as the watch never starts and the tablet never answers; every thumbnail drawn.
    private func tabletNote(_ name: String, pullWaits: Bool = false) async throws -> (LiveNote, NoteEditor, PageImages)
    {
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let copy = scratch.appending(path: "\(name).note")
        try Fixtures.data("content.note").write(to: copy)
        let note = try Fixtures.note("content.note")
        let live = LiveNote(
            tabletPath: "Note/\(name).note", local: copy, inkctl: Inkctl(executable: nil, environment: [:]))
        live.watches = false
        let editor = NoteEditor(
            tabletPath: live.tabletPath, copy: copy, base: note, tablet: SlowTablet(pullWaits: pullWaits),
            backups: NoteBackups(folder: scratch.appending(path: "\(name)Backups")))
        let drawn = PageImages(note: note)
        for index in note.pages.indices {
            await drawn.loadThumbnail(index, scale: 1)
        }
        return (live, editor, drawn)
    }

    /// Edit Text Box… (#264): the sheet over a text box made on the tablet, with its text and font
    /// size, and the edit on its way, drawn at once as the template and the new text.
    @Test func editTextStates() async throws {
        let (live, editor, drawn) = try await tabletNote("EditedText", pullWaits: true)
        await drawn.loadPage(0)
        await drawn.loadElements(0)
        let item = try #require(drawn.selectable(0)?.first { $0.isArea && !$0.isPicture })
        let request = try #require(editor.textBoxRequest([item], page: 0))
        try await render("edit-text", Self.sizes) {
            ZStack(alignment: .top) {
                NotebookView(pages: drawn, page: 0, live: live, editor: editor)
                InsertSheet(editor: editor, request: request)
                    .background(.background, in: .rect(cornerRadius: 12))
                    .shadow(radius: 12)
                    .padding(.top, 52)
            }
        }
        guard case .editText(let element, _, _) = request.content else { return }
        editor.editText(page: 0, element: element, text: "Edited on the Mac\nSecond line", fontSize: 48)
        for _ in 0..<500 where editor.deletions(on: 0).isEmpty {
            // timing-independent: a poll on the lift with a deadline; the expectation fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.deletions(on: 0).count == 1)
        try await render("edit-text-sending", Self.sizes) {
            NotebookView(pages: drawn, page: 0, live: live, editor: editor)
        }
    }

    /// Insert › Shape (#350): the bar while a shape waits for its drag, and every shape on its way to
    /// the tablet, drawn at once in black over the page.
    @Test func shapeStates() async throws {
        let (live, editor, drawn) = try await tabletNote("Shapes")
        await drawn.loadPage(0)
        let viewer = PageViewer()
        viewer.shapeTool = .rectangle
        try await render("insert-shape-armed", Self.sizes) {
            NotebookView(pages: drawn, page: 0, viewer: viewer, live: live, editor: editor)
        }
        viewer.shapeTool = nil
        let size = editor.pageSize(0)
        let page = CGSize(width: size.width, height: size.height)
        // Four to a row above the fixture's ink, so each shape shows whole.
        for (step, kind) in ShapeKind.allCases.enumerated() {
            let left = CGFloat(80 + step % 4 * 320)
            let top = CGFloat(280 + step / 4 * 280)
            editor.insertShape(
                page: 0,
                shape: ShapeDrawing.shape(
                    kind, from: CGPoint(x: left, y: top), to: CGPoint(x: left + 260, y: top + 220), constrained: false,
                    page: page))
        }
        try await render("insert-shape-sending", Self.sizes) {
            NotebookView(pages: drawn, page: 0, viewer: viewer, live: live, editor: editor)
        }
    }

    /// A selection moved on a note from the tablet (#325): drawn at once at its new place from its
    /// lifted ink, its frame with it, and the template where it was, while the move is on its way.
    @Test func moveStates() async throws {
        let (live, editor, drawn) = try await tabletNote("Moved")
        let note = drawn.note
        let copy = editor.copy
        await drawn.loadPage(0)
        await drawn.loadElements(0)
        let items = drawn.selectable(0) ?? []
        let viewer = PageViewer()
        viewer.selection.selectAll(Set(items.map(\.id)), page: 0)
        let move = ElementMove(page: 0, elements: items.map(MovedElement.init), dx: -300, dy: 500)
        let lifted = await LiftedInk.make(note, page: 0, items: items)
        // The selection holds a picture: it moves as a new file, made before the move is drawn (#326).
        editor.pictureFolder = { self.scratch }
        editor.moveElements(move, lifted: lifted)
        for _ in 0..<6000 where editor.liftedChanges(on: 0).isEmpty {
            // timing-independent: a poll on the picture's file with a deadline; the render is checked by eye.
            try? await Task.sleep(for: .milliseconds(10))
        }
        try await render("move-sending", Self.sizes) {
            NotebookView(pages: drawn, viewer: viewer, live: live, editor: editor)
        }
        // A deleted selection on its way (#327): the template where it was, nothing selected.
        let deleting = NoteEditor(
            tabletPath: live.tabletPath, copy: copy, base: note, tablet: SlowTablet(),
            backups: NoteBackups(folder: scratch.appending(path: "DeleteBackups")))
        deleting.deleteElements(page: 0, elements: items.map(MovedElement.init))
        for _ in 0..<500 where deleting.deletions(on: 0).isEmpty {
            // timing-independent: a poll on the lift with a deadline; the render is checked by eye.
            try? await Task.sleep(for: .milliseconds(10))
        }
        try await render("delete-sending", Self.sizes) {
            NotebookView(pages: drawn, live: live, editor: deleting)
        }
        // A picture turned right on its way (#326): drawn turned at once, framed with its resize
        // handles and the rotation knob.
        let turning = NoteEditor(
            tabletPath: live.tabletPath, copy: copy, base: note, tablet: SlowTablet(),
            backups: NoteBackups(folder: scratch.appending(path: "TurnBackups")))
        turning.pictureFolder = { self.scratch }
        let pictures = items.filter(\.isPicture)
        let picked = PageViewer()
        picked.selection.selectAll(Set(pictures.map(\.id)), page: 0)
        await turning.transform(pictures, page: 0) { .quarterTurn(page: 0, elements: $0, clockwise: true) }
        for _ in 0..<500 where turning.liftedChanges(on: 0).isEmpty {
            // timing-independent: a poll on the lift with a deadline; the render is checked by eye.
            try? await Task.sleep(for: .milliseconds(10))
        }
        try await render("rotate-sending", Self.sizes) {
            NotebookView(pages: drawn, viewer: picked, live: live, editor: turning)
        }
    }

    /// Inserting a picture and a text box (#264): each sheet over the window it opens from, as a
    /// sheet is a window of its own, and both inserts drawn at once while on their way.
    @Test func insertStates() async throws {
        let (live, editor, drawn) = try await tabletNote("Inserted")
        await drawn.loadPage(1)
        // A colour gradient, shown in the tablet's greys.
        let context = try #require(
            CGContext(
                data: nil, width: 480, height: 320, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        for band in 0..<6 {
            context.setFillColor(red: CGFloat(band) / 5, green: 0.3, blue: 1 - CGFloat(band) / 5, alpha: 1)
            context.fill(CGRect(x: band * 80, y: 0, width: 80, height: 320))
        }
        let picture = try PictureImport.make(try #require(context.makeImage()), folder: scratch)
        let sheet = { (request: InsertRequest) in
            ZStack(alignment: .top) {
                NotebookView(pages: drawn, page: 1, live: live, editor: editor)
                InsertSheet(editor: editor, request: request)
                    .background(.background, in: .rect(cornerRadius: 12))
                    .shadow(radius: 12)
                    .padding(.top, 52)
            }
        }
        try await render("insert-picture", Self.sizes) {
            sheet(InsertRequest(page: 1, content: .picture(picture)))
        }
        try await render("insert-text", Self.sizes) {
            sheet(InsertRequest(page: 1, content: .text("Shopping\nPaper, ink, tea")))
        }
        let size = editor.pageSize(1)
        let page = CGSize(width: size.width, height: size.height)
        editor.insertPicture(
            page: 1, file: picture.file,
            rect: PicturePlacement.box(
                pixels: CGSize(width: 480, height: 320), centredOn: CGPoint(x: 960, y: 700), page: page),
            image: picture.image)
        editor.insertText(
            page: 1, text: "Shopping\nPaper, ink, tea",
            rect: TextBoxPlacement.box(lines: 2, fontSize: 60, centredOn: CGPoint(x: 960, y: 1500), page: page),
            fontSize: 60)
        try await render("insert-sending", Self.sizes) {
            NotebookView(pages: drawn, page: 1, live: live, editor: editor)
        }
    }

    /// The system's alert with the confirmation's words, as SwiftUI's `alert` shows them, drawn off
    /// screen: the panel is laid out and cached, never ordered in. The test process has no app
    /// icon, so the alert shows the system's generic one.
    static func alertImage(title: String, message: String, buttons: [String], dark: Bool) throws -> NSImage {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        for button in buttons { alert.addButton(withTitle: button) }
        alert.buttons.first?.hasDestructiveAction = true
        alert.window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        alert.layout()
        guard let view = alert.window.contentView?.superview ?? alert.window.contentView,
            let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds)
        else { throw CocoaError(.fileWriteUnknown) }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        let image = NSImage(size: view.bounds.size)
        image.addRepresentation(bitmap)
        return image
    }

    /// Find in Note with matches, with none and while the handwriting is read (#322), and the
    /// Headings sidebar with its outline and empty (#331). The note is `content.note` with typed
    /// words drawn in and two Headings added; Vision reads the words, as in the app.
    @Test func textStates() async throws {
        let note = try Self.noteWithText()
        let drawn = PageImages(note: note)
        for index in note.pages.indices {
            await drawn.loadThumbnail(index, scale: 1)
            await drawn.loadPage(index)
        }
        let store = scratch.appending(path: "Index")
        let read = NoteText(
            indexer: NoteIndexer(store: NoteIndexStore(root: store), recognizer: VisionRecognizer(preferred: ["en-US"]))
        )
        await read.indexer.run(note: note)
        read.showFind()
        read.query = "harvest"
        try await render("find-matches", Self.sizes) { NotebookView(pages: drawn).environment(read) }
        let none = NoteText(
            indexer: NoteIndexer(store: NoteIndexStore(root: store), recognizer: VisionRecognizer(preferred: ["en-US"]))
        )
        await none.indexer.run(note: note)
        none.showFind()
        none.query = "orchard"
        try await render("find-none", Self.sizes) { NotebookView(pages: drawn).environment(none) }
        let reading = NoteText(indexer: NoteIndexer(store: NoteIndexStore(root: store)))
        reading.showFind()
        reading.query = "harvest"
        try await render("find-reading", Self.sizes) { NotebookView(pages: drawn).environment(reading) }
        let outline = NoteText(
            indexer: NoteIndexer(store: NoteIndexStore(root: store), recognizer: VisionRecognizer(preferred: ["en-US"]))
        )
        await outline.indexer.run(note: note)
        try await render("headings", Self.sizes) {
            NotebookView(pages: drawn, sidebar: .headings).environment(outline)
        }
        let plain = PageImages(note: try Fixtures.note("content.note"))
        await plain.loadPage(0)
        try await render("headings-empty", Self.sizes) {
            NotebookView(pages: plain, sidebar: .headings).environment(none)
        }
    }

    /// `content.note` with typed words on pages 1 and 3, and two Headings: one over the words on
    /// page 1, at level 1, and one on page 4 with only its handwriting, at level 2.
    static func noteWithText() throws -> NoteFile {
        var note = try Fixtures.note("content.note")
        let title = PageRect(x: 200, y: 300, width: 1300, height: 160)
        note = try NoteFile(
            bytes: try NoteWriter.drawText(note, page: 0, text: "Harvest plan", in: title, fontSize: 110))
        note = try NoteFile(
            bytes: try NoteWriter.drawText(
                note, page: 0, text: "Spring harvest notes", in: PageRect(x: 200, y: 700, width: 1500, height: 140),
                fontSize: 90))
        note = try NoteFile(
            bytes: try NoteWriter.drawText(
                note, page: 2, text: "Harvest day", in: PageRect(x: 200, y: 500, width: 1300, height: 140), fontSize: 90
            ))
        var bytes = Array(note.bytes[..<NoteWriter.footerAddress(note)])
        var pairs = note.footer.pairs
        let seeds = PageRect(x: 200, y: 200, width: 700, height: 120)
        for (page, level, rect, words) in [(0, 1, title, "Harvest plan"), (3, 2, seeds, "Seed list")] {
            let coverage = NoteWriter.textCoverage(words, width: rect.width, height: rect.height, fontSize: 90)
            let pixels = coverage.map {
                $0 >= NoteWriter.halfCoverage ? RattaRLE.Grey.black : RattaRLE.Grey.transparent
            }
            let bitmap = bytes.count
            bytes += NoteWriter.lengthPrefixed(RattaRLE.encode(pixels, greyscale: note.storesGreyscale))
            let box = "\(rect.x),\(rect.y),\(rect.width),\(rect.height)"
            let block = bytes.count
            bytes += NoteWriter.lengthPrefixed(
                NoteWriter.text([
                    .init(key: "TITLELEVEL", value: String(level)), .init(key: "TITLERECTORI", value: box),
                    .init(key: "TITLEBITMAP", value: String(bitmap)), .init(key: "TITLEPROTOCOL", value: "RATTA_RLE"),
                ]))
            pairs.append(
                .init(key: String(format: "TITLE_%04d%04d%04d", page + 1, rect.y, rect.x), value: String(block)))
        }
        return try NoteFile(bytes: try NoteWriter.withFooter(note, prefix: bytes, pairs: pairs))
    }

    @Test func tabletStates() async throws {
        let listing = """
            {"path": "/storage/emulated/0/Note", "entries": [
              {"name": "Meetings", "type": "dir", "bytes": 3452, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "Sample notebook.note", "type": "file", "bytes": 482113, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "Shopping list.note", "type": "file", "bytes": 91022, "modified": "2026-11-10T00:13:47+01:00"}
            ]}
            """
        let cases: [(String, String)] = [
            ("tablet-list", "echo '\(listing)'"),
            ("tablet-empty", #"echo '{"path": "/storage/emulated/0/Note", "entries": []}'"#),
            (
                "tablet-not-connected",
                #"echo '{"error": "unreachable", "message": "no tablet answers on USB or Wi-Fi"}'; exit 3"#
            ),
            ("tablet-failed", #"echo '{"error": "device_error", "message": "adb is not installed"}'; exit 1"#),
        ]
        for (name, script) in cases {
            let browser = TabletBrowser(inkctl: try fakeInkctl(script), copies: TabletCopyLocation(root: scratch))
            await browser.load()
            try await render(name, Self.tabletSizes) { OpenFromTabletView(browser: quiet(browser)) }
        }
        let missing = TabletBrowser(
            inkctl: Inkctl(executable: nil, environment: [:]), copies: TabletCopyLocation(root: scratch))
        await missing.load()
        try await render("tablet-missing", Self.tabletSizes) { OpenFromTabletView(browser: quiet(missing)) }
        // A folder gone from the tablet offers its enclosing folder; a failed copy names the copy.
        let tablet = try fakeInkctl(
            """
            case "$5" in
              Note) echo '\(listing)' ;;
              Note/Meetings) echo '{"error": "not_found", "message": "not found: Note/Meetings"}'; exit 4 ;;
              *) echo '{"error": "device_error", "message": "the cable was pulled during the copy"}'; exit 1 ;;
            esac
            """)
        let gone = TabletBrowser(inkctl: tablet, copies: TabletCopyLocation(root: scratch))
        await gone.load()
        if case .listed(let entries) = gone.phase, let meetings = entries.entries.first(where: \.isFolder) {
            _ = await gone.choose(meetings)
        }
        try await render("tablet-not-found", Self.tabletSizes) { OpenFromTabletView(browser: quiet(gone)) }
        let failedCopy = TabletBrowser(inkctl: tablet, copies: TabletCopyLocation(root: scratch))
        await failedCopy.load()
        if case .listed(let entries) = failedCopy.phase, let note = entries.entries.first(where: { !$0.isFolder }) {
            _ = await failedCopy.choose(note)
        }
        try await render("tablet-copy-failed", Self.tabletSizes) { OpenFromTabletView(browser: quiet(failedCopy)) }
        let copying = TabletBrowser(inkctl: tablet, copies: TabletCopyLocation(root: scratch))
        copying.phase = .copying("Sample notebook.note")
        try await render("tablet-copying", Self.tabletSizes) { OpenFromTabletView(browser: quiet(copying)) }
        let loading = TabletBrowser(
            inkctl: Inkctl(executable: nil, environment: [:]), copies: TabletCopyLocation(root: scratch))
        try await render("tablet-loading", Self.tabletSizes) { OpenFromTabletView(browser: quiet(loading)) }
    }

    /// The browser as it stands, without the window's own reload when it appears.
    private func quiet(_ browser: TabletBrowser) -> TabletBrowser {
        browser.loadsOnAppear = false
        return browser
    }

    private func fakeInkctl(_ script: String) throws -> Inkctl {
        let scripts = scratch.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: scripts, withIntermediateDirectories: true)
        let executable = scripts.appending(path: "inkctl")
        try "#!/bin/sh\n\(script)\n".write(to: executable, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path())
        return Inkctl(executable: executable, environment: ["PATH": "/usr/bin:/bin"])
    }

    /// Draws `content` in both appearances at each size, as `<name>-<light|dark>-<size>.png`.
    private func render(_ name: String, _ sizes: [(name: String, size: CGSize)], content: () -> some View) async throws
    {
        for (sizeName, size) in sizes {
            for dark in [false, true] {
                let png = try await OffscreenWindow.png(of: AnyView(content()), size: size, dark: dark)
                try png.write(to: folder.appending(path: "\(name)-\(dark ? "dark" : "light")-\(sizeName).png"))
            }
        }
    }
}

/// A titled window that is never ordered in and draws at one pixel per point. Its capture leaves
/// out what the window server composites: a layer's compositing filter (SwiftUI's vibrant text on
/// the sidebar's glass, drawn dark on dark until `Tokens.sidebarText`, #420) and the scroll edge
/// effect under the toolbar. A selected sidebar row draws black in light mode for the same
/// reason; its number follows `Tokens.sidebarText(on:)` on screen. `AppearanceTests` checks the
/// page list's numbers in both appearances.
@MainActor
final class OffscreenWindow: NSWindow {
    override var backingScaleFactor: CGFloat { 1 }
    /// Controls draw their accent only with key appearance, and the test process is never active.
    /// shortcut: AppKit's unpublished `hasKeyAppearance` (Panoram's OffscreenWindow, macOS 27); if it
    /// is renamed the renders show grey controls, so look for its successor then.
    @objc func hasKeyAppearance() -> Bool { true }

    /// No view takes focus, so a focus ring never differs between renders.
    override func makeFirstResponder(_ responder: NSResponder?) -> Bool {
        responder == nil || responder === self ? super.makeFirstResponder(responder) : false
    }

    static func png(of view: AnyView, size: CGSize, dark: Bool) async throws -> Data {
        let window = OffscreenWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        let hosting = NSHostingView(
            rootView: view.frame(width: size.width, height: size.height).environment(\.progressDelay, .zero))
        hosting.sceneBridgingOptions = [.toolbars, .title]
        window.contentView = hosting
        window.setContentSize(size)
        let frame = window.contentView?.superview ?? hosting
        for _ in 0..<5 {
            frame.layoutSubtreeIfNeeded()
            // timing-independent: turns of the main actor for SwiftUI to lay out; the renders are checked by eye.
            try await Task.sleep(for: .milliseconds(20))
        }
        guard let bitmap = frame.bitmapImageRepForCachingDisplay(in: frame.bounds) else {
            throw CocoaError(.fileWriteUnknown)
        }
        frame.cacheDisplay(in: frame.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw CocoaError(.fileWriteUnknown) }
        window.close()
        return png
    }
}
