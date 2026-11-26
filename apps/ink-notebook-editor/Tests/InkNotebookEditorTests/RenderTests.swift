import AppKit
import Foundation
import InkNotebookEditorKit
import SwiftUI
import Testing

@testable import InkNotebookEditor

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

/// A titled window that is never ordered in and draws at one pixel per point.
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
