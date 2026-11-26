import AppKit
import Foundation
import InkNotebookEditorKit
import SwiftUI
import Testing

@testable import InkNotebookEditor
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
        let loading = PageImages(note: note)
        try await render("notebook-loading", Self.sizes) { NotebookView(pages: loading) }
        try await render("unreadable", Self.sizes) {
            NotebookWindow(document: NoteDocument(data: Data("not a note".utf8)))
        }
        try await render("page-failed", Self.sizes) { StateView(.pageFailed("page 2: the layer bitmap ends early")) }
    }

    /// A tablet that never answers in a render's time, so an edit stays on its way.
    final class SlowTablet: TabletWriting {
        func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
            // timing-independent: a stand-in for a tablet that has not answered yet; no result waits on it.
            try? await Task.sleep(for: .seconds(3600))
            throw .cancelled
        }
        func push(_ local: URL, to note: String) async throws(InkctlFailure) { throw .cancelled }
        func pull(_ note: String, to destination: URL) async throws(InkctlFailure) { throw .cancelled }
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
        editor.refusal = nil
        // Insert Page… and Delete Page… (#329): the sheet under the toolbar and the confirmation in
        // the middle of the window, each over the window they open from. A sheet and an alert are
        // windows of their own, so each is drawn on its own and set over the window's render.
        try await render("insert-page", Self.sizes) {
            ZStack(alignment: .top) {
                NotebookView(pages: moved, page: 2, live: live, editor: editor)
                InsertPageSheet(editor: editor, page: 2) { _ in }
                    .background(.background, in: .rect(cornerRadius: 12))
                    .shadow(radius: 12)
                    .padding(.top, 52)
            }
        }
        for dark in [false, true] {
            let alert = try Self.alertImage(
                title: Copy.deletePageTitle(3), message: Copy.deletePagesMessage(1),
                buttons: [Copy.delete, Copy.cancel], dark: dark)
            for (sizeName, size) in Self.sizes {
                let png = try await OffscreenWindow.png(
                    of: AnyView(
                        ZStack {
                            NotebookView(pages: moved, page: 2, live: live, editor: editor)
                            // The alert's panel draws its material behind it on screen only.
                            Image(nsImage: alert)
                                .background(.regularMaterial, in: .rect(cornerRadius: 16))
                                .shadow(radius: 12)
                        }), size: size, dark: dark)
                try png.write(to: folder.appending(path: "delete-page-\(dark ? "dark" : "light")-\(sizeName).png"))
            }
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
