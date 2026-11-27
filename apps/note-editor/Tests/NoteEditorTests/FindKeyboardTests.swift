import AppKit
import Foundation
import SwiftUI
import Testing

@testable import NoteEditor

/// The find bar by keyboard alone (#322): Edit › Find puts the focus in the field, typing finds,
/// Return and Shift-Return go to the next and previous match each time, and Escape closes the bar
/// and gives the focus back. The keys go to the test's own window, which is never ordered in, as
/// `PageTurnTests` sends them, so nothing reaches the screen or another app.
@MainActor
@Suite(.serialized) struct FindKeyboardTests {
    @Test(arguments: [false, true])
    func theFindBarWorksByKeyboardAlone(dark: Bool) async throws {
        let (text, folder) = try await NoteTextTests.read()
        defer { try? FileManager.default.removeItem(at: folder) }
        var closed = 0
        let window = KeyedOffscreenWindow(size: CGSize(width: 700, height: 80), dark: dark)
        window.show(FindBar(text: text) { closed += 1 })
        defer { window.close() }

        // Edit › Find: the bar's field takes the focus.
        text.showFind()
        #expect(try await window.until { Self.fieldHasFocus(in: window) })
        for key in "word" { Self.press(String(key), keyCode: 0, in: window) }
        #expect(try await window.until { text.status == Copy.matchOf(1, 4) })
        for match in [2, 3, 4, 1] {
            Self.press("\r", keyCode: Self.returnKey, in: window)
            #expect(try await window.until { text.status == Copy.matchOf(match, 4) }, "Return to match \(match)")
        }
        Self.press("\r", keyCode: Self.returnKey, modifiers: .shift, in: window)
        #expect(try await window.until { text.status == Copy.matchOf(4, 4) }, "Shift-Return")
        Self.press("\u{3}", keyCode: Self.enterKey, modifiers: .numericPad, in: window)
        #expect(try await window.until { text.status == Copy.matchOf(1, 4) }, "Enter")
        #expect(text.query == "word" && Self.fieldHasFocus(in: window))

        // While an input method composes text, Return confirms it into the field.
        let editor = try #require(window.firstResponder as? NSTextView)
        editor.setMarkedText(
            "ｗ", selectedRange: NSRange(location: 1, length: 0), replacementRange: editor.selectedRange())
        #expect(editor.hasMarkedText())
        Self.press("\r", keyCode: Self.returnKey, in: window)
        #expect(try await window.until { !editor.hasMarkedText() })
        #expect(try await window.until { text.query == "wordｗ" })
        editor.selectAll(nil)
        editor.insertText("word", replacementRange: editor.selectedRange())
        #expect(try await window.until { text.query == "word" })

        Self.press("\u{1b}", keyCode: Self.escapeKey, in: window)
        #expect(try await window.until { closed == 1 })
        #expect(!text.findShown && text.query.isEmpty)
    }

    static let returnKey: UInt16 = 36
    static let escapeKey: UInt16 = 53
    static let enterKey: UInt16 = 76

    @Test func aMarkReachesPastItsWordsBox() {
        let box = CGRect(x: 100, y: 200, width: 300, height: 40)
        let mark = FindMarks.mark(box, scale: 0.5)
        #expect(
            mark
                == CGRect(
                    x: 50 - FindMarks.outset, y: 100 - FindMarks.outset, width: 150 + 2 * FindMarks.outset,
                    height: 20 + 2 * FindMarks.outset))
    }

    /// Sends a key down and up to `window`, as AppKit delivers a key press.
    static func press(
        _ characters: String, keyCode: UInt16, modifiers: NSEvent.ModifierFlags = [], in window: NSWindow
    ) {
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            let event = NSEvent.keyEvent(
                with: type, location: .zero, modifierFlags: modifiers, timestamp: 0,
                windowNumber: window.windowNumber, context: nil, characters: characters,
                charactersIgnoringModifiers: characters, isARepeat: false, keyCode: keyCode)
            if let event { window.sendEvent(event) }
        }
    }

    /// Whether a text field's editor holds the window's focus.
    static func fieldHasFocus(in window: NSWindow) -> Bool {
        guard let editor = window.firstResponder as? NSTextView else { return false }
        return editor.isFieldEditor && editor.delegate is NSTextField
    }
}
