import AppKit
import CoreGraphics
import InkNotebookEditorKit
import Testing

@testable import InkNotebookEditor

/// Click, rectangle, lasso and Shift on a page's elements (#324).
@Suite struct SelectionTests {
    /// A horizontal stroke from 100 to 300 at y 100, a picture at 400, 400, 200 x 100, and a
    /// stroke drawn over the picture last, from 450 to 550 at y 450.
    static let line = Selectable(
        id: 0, bounds: CGRect(x: 98, y: 98, width: 204, height: 4),
        points: [CGPoint(x: 100, y: 100), CGPoint(x: 300, y: 100)], isArea: false)
    static let picture = Selectable(
        id: 1, bounds: CGRect(x: 400, y: 400, width: 200, height: 100), points: [], isArea: true)
    static let over = Selectable(
        id: 2, bounds: CGRect(x: 448, y: 448, width: 104, height: 4),
        points: [CGPoint(x: 450, y: 450), CGPoint(x: 550, y: 450)], isArea: false)
    static let items = [line, picture, over]

    @Test func aClickTakesTheTopmostElementUnderThePointer() {
        #expect(HitTest.click(CGPoint(x: 200, y: 104), in: Self.items, tolerance: 6) == 0)
        #expect(HitTest.click(CGPoint(x: 500, y: 450), in: Self.items, tolerance: 6) == 2)
        #expect(HitTest.click(CGPoint(x: 500, y: 480), in: Self.items, tolerance: 6) == 1)
    }

    @Test func aClickOnEmptyPaperOrBesideAStrokeTakesNothing() {
        #expect(HitTest.click(CGPoint(x: 200, y: 120), in: Self.items, tolerance: 6) == nil)
        #expect(HitTest.click(CGPoint(x: 900, y: 900), in: Self.items, tolerance: 6) == nil)
        #expect(HitTest.click(.zero, in: [], tolerance: 6) == nil)
    }

    @Test func aRectangleTakesOnlyWhatLiesWhollyInside() {
        #expect(HitTest.rectangle(CGRect(x: 50, y: 50, width: 300, height: 100), in: Self.items) == [0])
        // Crossing the picture's edge takes the stroke inside it, not the picture.
        #expect(HitTest.rectangle(CGRect(x: 420, y: 420, width: 200, height: 60), in: Self.items) == [2])
        #expect(HitTest.rectangle(CGRect(x: 0, y: 0, width: 1000, height: 1000), in: Self.items) == [0, 1, 2])
    }

    @Test func aLassoTakesWhatItsPathEnclosesWhole() {
        // A triangle around the first stroke only.
        let around = [CGPoint(x: 50, y: 50), CGPoint(x: 400, y: 50), CGPoint(x: 200, y: 300)]
        #expect(HitTest.lasso(around, in: Self.items) == [0])
        // A loop crossing the first stroke takes nothing of it.
        let across = [CGPoint(x: 150, y: 50), CGPoint(x: 250, y: 50), CGPoint(x: 200, y: 300)]
        #expect(HitTest.lasso(across, in: Self.items).isEmpty)
        #expect(HitTest.lasso([CGPoint(x: 0, y: 0), CGPoint(x: 900, y: 900)], in: Self.items).isEmpty)
    }

    @Test func shiftAddsAndRemovesAndAClickOnPaperClears() {
        var selection = PageSelection()
        selection.click(0, page: 0, adding: false)
        selection.click(1, page: 0, adding: true)
        #expect(selection.ids == [0, 1] && selection.page == 0)
        selection.click(0, page: 0, adding: true)
        #expect(selection.ids == [1])
        selection.click(nil, page: 0, adding: true)
        #expect(selection.ids == [1])
        selection.click(nil, page: 0, adding: false)
        #expect(selection.isEmpty && selection.page == nil)
    }

    @Test func aRectangleReplacesOrWithShiftAdds() {
        var selection = PageSelection()
        selection.take([0], page: 0, adding: false)
        selection.take([2], page: 0, adding: true)
        #expect(selection.ids == [0, 2])
        selection.take([1], page: 0, adding: false)
        #expect(selection.ids == [1])
    }

    @Test func aSelectionStartedOnAnotherPageReplacesTheOld() {
        var selection = PageSelection()
        selection.take([0, 1], page: 0, adding: false)
        selection.click(5, page: 1, adding: true)
        #expect(selection.ids == [5] && selection.page == 1)
    }

    @Test func selectAllTakesEveryElementOfThePageAndClearEmptiesIt() {
        var selection = PageSelection()
        selection.selectAll([0, 1, 2], page: 3)
        #expect(selection.ids == [0, 1, 2] && selection.page == 3)
        selection.clear()
        #expect(selection.isEmpty && selection.page == nil)
    }
}

/// Select All and Escape by keyboard in a real notebook window, off screen (#324): the keys go to
/// the test's own window, never ordered in.
@MainActor
@Suite(.serialized) struct SelectionKeyTests {
    @Test func selectAllAndEscapeWorkByKeyboard() async throws {
        let document = NoteDocument(data: try Fixtures.data("content.note"))
        let window = KeyedOffscreenWindow(size: NotebookWindow.portrait, dark: false)
        window.show(NotebookWindow(document: document))
        defer { window.close() }
        #expect(try await window.shows(Copy.pageOf(1, 4)))
        #expect(try await window.until { window.firstResponder is NSView })
        // Page 1 holds a text box and a picture.
        window.pressKey("a", keyCode: 0, modifiers: .command)
        #expect(try await window.shows(Copy.pageOfSelected(1, 4, 2)))
        window.pressKey("\u{1B}", keyCode: 53, modifiers: [])
        #expect(try await window.shows(Copy.pageOf(1, 4)))
    }
}

extension KeyedOffscreenWindow {
    /// Sends one key down and up to this window, as AppKit delivers it.
    func pressKey(_ character: String, keyCode: UInt16, modifiers: NSEvent.ModifierFlags) {
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            let event = NSEvent.keyEvent(
                with: type, location: .zero, modifierFlags: modifiers, timestamp: 0, windowNumber: windowNumber,
                context: nil, characters: character, charactersIgnoringModifiers: character, isARepeat: false,
                keyCode: keyCode)
            if let event { sendEvent(event) }
        }
    }
}
