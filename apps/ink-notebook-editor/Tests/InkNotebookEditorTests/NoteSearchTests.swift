import CoreGraphics
import InkNotebookEditorKit
import Testing

/// Find in Note over a fixture index (#322), and the reading order of Copy as Text (#323).
struct NoteSearchTests {
    static func word(_ text: String, page: Int, x: CGFloat, y: CGFloat, width: CGFloat = 100) -> IndexedWord {
        IndexedWord(page: page, text: text, box: CGRect(x: x, y: y, width: width, height: 40), source: .tablet)
    }

    /// Two pages of two lines each, stored out of order; the second line's words sit a little
    /// lower or higher, as handwriting does.
    static let index = [
        word("Café", page: 1, x: 100, y: 300),
        word("depois", page: 1, x: 250, y: 312),
        word("Primeira", page: 0, x: 100, y: 100),
        word("linha", page: 0, x: 250, y: 95),
        word("cafe", page: 0, x: 400, y: 104),
        word("segunda", page: 0, x: 100, y: 200),
        word("CAFÉ", page: 0, x: 260, y: 190),
        word("pequeno", page: 0, x: 400, y: 205),
    ]

    @Test func testTheWordsOfAPageReadInLinesTopToBottomLeftToRight() {
        #expect(
            ReadingOrder.sorted(Self.index).map(\.text) == [
                "Primeira", "linha", "cafe", "segunda", "CAFÉ", "pequeno", "Café", "depois",
            ])
        #expect(ReadingOrder.text(Self.index) == "Primeira linha cafe\nsegunda CAFÉ pequeno\n\nCafé depois")
    }

    @Test func testMatchesComeInPageAndReadingOrderWithCaseAndAccentsFolded() {
        var search = NoteSearch()
        search.find("café", in: Self.index)
        #expect(search.matches.map(\.page) == [0, 0, 1])
        #expect(search.matches.map(\.box.minX) == [400, 260, 100])
        #expect(search.current == 0)
    }

    @Test func testAQueryOfSeveralWordsMatchesTheRunAndBoxesItWhole() {
        var search = NoteSearch()
        search.find("Cafe  peq", in: Self.index)
        #expect(search.matches == [FindMatch(page: 0, box: CGRect(x: 260, y: 190, width: 240, height: 55))])
        search.find("linha segunda", in: Self.index)
        #expect(search.matches.isEmpty)
    }

    @Test func testNextAndPreviousWrap() {
        var search = NoteSearch()
        search.find("cafe", in: Self.index)
        search.previous()
        #expect(search.current == 2)
        search.next()
        #expect(search.current == 0)
        search.next()
        search.next()
        search.next()
        #expect(search.current == 0)
    }

    @Test func testNoMatchAndAnEmptyQueryHaveNoCurrent() {
        var search = NoteSearch()
        search.find("chá", in: Self.index)
        #expect(search.matches.isEmpty && search.current == nil)
        search.next()
        #expect(search.current == nil)
        search.find("   ", in: Self.index)
        #expect(search.matches.isEmpty && search.current == nil)
    }
}
