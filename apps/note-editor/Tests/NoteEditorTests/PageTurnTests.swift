import AppKit
import Foundation
import SwiftUI
import Testing

@testable import NoteEditor

/// The page keys in a real notebook window, off screen (#262): a fixture copy opens through the
/// document type, and the arrows, Page Up, Page Down, Home and End turn its pages, with the page
/// list shown and hidden, in light and dark. The keys go to the test's own window, which is never
/// ordered in, so nothing reaches the screen or another app. With $RENDER_EVIDENCE set, each turn
/// is also drawn there as `turn-<appearance>-<sidebar>-<step>-<key>.png`.
@MainActor
@Suite(.serialized) struct PageTurnTests {
    /// Each key, the page it should show next (1-based), from page 1 of a notebook of `count` pages.
    static func steps(count: Int) -> [(key: PageKey, page: Int)] {
        [
            (.end, count), (.home, 1), (.rightArrow, 2), (.downArrow, 3), (.pageDown, 4),
            (.leftArrow, 3), (.upArrow, 2), (.pageUp, 1), (.leftArrow, 1), (.end, count), (.pageDown, count),
        ]
    }

    @Test(arguments: [false, true], [NavigationSplitViewVisibility.all, .detailOnly])
    func thePageKeysTurnPages(dark: Bool, columns: NavigationSplitViewVisibility) async throws {
        let copy = FileManager.default.temporaryDirectory.appending(path: "page-turn-\(UUID().uuidString).note")
        try Fixtures.data(Self.fixture).write(to: copy)
        defer { try? FileManager.default.removeItem(at: copy) }
        let document = NoteDocument(data: try Data(contentsOf: copy))
        guard case .note(let note) = document.content else { throw CocoaError(.fileReadCorruptFile) }
        let count = note.pages.count
        try #require(count >= 4)

        let window = KeyedOffscreenWindow(size: NotebookWindow.portrait, dark: dark)
        // At Zoom to Fit every key turns a page; at Zoom to Width, where a note opens (#458), the
        // vertical keys scroll the page instead, as `PageViewerTests` checks.
        let viewer = PageViewer(zoom: .fitPage)
        window.show(NotebookWindow(document: document, columns: columns, viewer: viewer))
        defer { window.close() }
        #expect(try await window.shows(Copy.pageOf(1, count)))
        // The page takes the focus when the window opens, so the first key already turns it.
        #expect(try await window.until { viewer.pagesFocused })
        let label = "\(dark ? "dark" : "light")-\(columns == .detailOnly ? "hidden" : "shown")"
        try await window.save("turn-\(label)-00-open")
        for (step, (key, page)) in Self.steps(count: count).enumerated() {
            window.press(key)
            #expect(try await window.shows(Copy.pageOf(page, count)), "after \(key) at step \(step + 1)")
            try await window.save(String(format: "turn-%@-%02d-%@", label, step + 1, "\(key)"))
        }
    }

    /// The fixture with the most pages: four.
    static let fixture = "content.note"
}

/// A page key as AppKit delivers it: its function-key character and its virtual key code.
enum PageKey: CustomStringConvertible {
    case leftArrow, rightArrow, upArrow, downArrow, pageUp, pageDown, home, end

    var character: Int {
        switch self {
        case .leftArrow: NSLeftArrowFunctionKey
        case .rightArrow: NSRightArrowFunctionKey
        case .upArrow: NSUpArrowFunctionKey
        case .downArrow: NSDownArrowFunctionKey
        case .pageUp: NSPageUpFunctionKey
        case .pageDown: NSPageDownFunctionKey
        case .home: NSHomeFunctionKey
        case .end: NSEndFunctionKey
        }
    }

    var keyCode: UInt16 {
        switch self {
        case .leftArrow: 123
        case .rightArrow: 124
        case .downArrow: 125
        case .upArrow: 126
        case .pageUp: 116
        case .pageDown: 121
        case .home: 115
        case .end: 119
        }
    }

    var description: String {
        switch self {
        case .leftArrow: "left"
        case .rightArrow: "right"
        case .upArrow: "up"
        case .downArrow: "down"
        case .pageUp: "pageup"
        case .pageDown: "pagedown"
        case .home: "home"
        case .end: "end"
        }
    }
}

/// An off-screen window like the renders' one, whose views may take the focus, so a key goes where
/// it goes in the app: to the page.
@MainActor
final class KeyedOffscreenWindow: NSWindow {
    override var backingScaleFactor: CGFloat { 1 }
    /// The test process is never active; the window acts as the key window without being made one.
    override var isKeyWindow: Bool { true }
    @objc func hasKeyAppearance() -> Bool { true }

    let folder = ProcessInfo.processInfo.environment["RENDER_EVIDENCE"].map {
        URL(filePath: $0, directoryHint: .isDirectory)
    }

    init(size: CGSize, dark: Bool) {
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        isReleasedWhenClosed = false
        appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
    }

    func show(_ view: some View) {
        let hosting = NSHostingView(rootView: view.environment(\.progressDelay, .zero))
        hosting.sceneBridgingOptions = [.toolbars, .title]
        contentView = hosting
        setContentSize(frame.size)
    }

    /// Whether the window's subtitle, the page it shows, becomes `subtitle`. With renders asked
    /// for, the window then gets about four seconds more to draw the page off the main actor in a debug build, so the
    /// render shows the page rather than its loading state; the assertions never wait for it.
    func shows(_ subtitle: String) async throws -> Bool {
        guard try await until({ self.subtitle == subtitle }) else { return false }
        if folder != nil {
            for _ in 0..<400 { try await turn() }
        }
        return true
    }

    /// Whether `condition` holds within `limit` and at least `minimumTurns` turns of the main actor.
    /// Five seconds is a bound a full parallel suite meets for work on the main actor; the turns are a
    /// floor for a loaded Mac, where one turn waited minutes behind the other suites and a bound in
    /// time alone gave the condition no turn to come true in (#495).
    func until(
        within limit: Duration = .seconds(5), minimumTurns: Int = 50, _ condition: () -> Bool
    ) async throws -> Bool {
        let start = ContinuousClock.now
        var turns = 0
        while !condition(), ContinuousClock.now - start < limit || turns < minimumTurns {
            try await turn()
            turns += 1
        }
        lastWait = "\(turns) turns in \(ContinuousClock.now - start)"
        return condition()
    }

    /// How the last `until` went, for a failure's message.
    private(set) var lastWait = ""

    /// One turn of the main actor for SwiftUI to lay out, focus and draw.
    private func turn() async throws {
        (contentView?.superview ?? contentView)?.layoutSubtreeIfNeeded()
        // timing-independent: `shows` waits on the subtitle, bounded, not on a time.
        try await Task.sleep(for: .milliseconds(10))
    }

    /// Sends a key down and up to this window, as AppKit delivers a key press.
    func press(_ key: PageKey) {
        let character = String(UnicodeScalar(UInt16(key.character)).map(Character.init) ?? " ")
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            let event = NSEvent.keyEvent(
                with: type, location: .zero, modifierFlags: [.function, .numericPad], timestamp: 0,
                windowNumber: windowNumber, context: nil, characters: character,
                charactersIgnoringModifiers: character, isARepeat: false, keyCode: key.keyCode)
            if let event { sendEvent(event) }
        }
    }

    func save(_ name: String) async throws {
        guard let folder else { return }
        let frame = contentView?.superview ?? contentView
        guard let frame, let bitmap = frame.bitmapImageRepForCachingDisplay(in: frame.bounds) else {
            throw CocoaError(.fileWriteUnknown)
        }
        frame.cacheDisplay(in: frame.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw CocoaError(.fileWriteUnknown) }
        try png.write(to: folder.appending(path: "\(name).png"))
    }
}
