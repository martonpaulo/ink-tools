import NoteEditorKit
import Testing

/// The hidden-content warning of a page change (#337): which elements and pages a new page size
/// would hide, on the Manta's 1920 x 2560 page and its landscape turn.
@Suite struct HiddenContentTests {
    /// A stroke near the top, a text box near the bottom, and a Heading band across the page.
    static let boxes = [
        EditRect(left: 100, top: 100, right: 400, bottom: 180),
        EditRect(left: 200, top: 2300, right: 900, bottom: 2400),
        EditRect(left: 0, top: 600, right: 1920, bottom: 700),
    ]

    @Test func theSameSizeHidesNothing() {
        #expect(HiddenContent.elements(Self.boxes, width: 1920, height: 2560, newWidth: 1920, newHeight: 2560) == [])
    }

    @Test func aLandscapePageHidesWhatLeavesItByTheElementsNumbers() {
        // On 2560 x 1920 the text box, below 1920, leaves the page; the band, 1920 wide, stays.
        #expect(HiddenContent.elements(Self.boxes, width: 1920, height: 2560, newWidth: 2560, newHeight: 1920) == [2])
    }

    @Test func aPortraitTurnOfALandscapePageHidesTheWideContent() {
        let wide = [
            EditRect(left: 1800, top: 100, right: 2500, bottom: 300),
            EditRect(left: 10, top: 10, right: 20, bottom: 20),
        ]
        #expect(HiddenContent.elements(wide, width: 2560, height: 1920, newWidth: 1920, newHeight: 2560) == [1])
    }

    @Test func aBoxOnTheEdgeIsOnThePage() {
        let edge = [EditRect(left: 0, top: 1820, right: 1920, bottom: 1920)]
        #expect(HiddenContent.elements(edge, width: 1920, height: 2560, newWidth: 2560, newHeight: 1920) == [])
    }

    @Test func aBoxAlreadyOffThePageNeverRaisesTheWarning() {
        let off = [EditRect(left: -40, top: 2500, right: 300, bottom: 2600)]
        #expect(HiddenContent.elements(off, width: 1920, height: 2560, newWidth: 2560, newHeight: 1920) == [])
    }

    @Test func onlyThePagesThatHideContentAreNamedInOrder() {
        let changes = [
            PageChange(page: 4, boxes: Self.boxes, width: 1920, height: 2560, newWidth: 2560, newHeight: 1920),
            PageChange(page: 0, boxes: Self.boxes, width: 1920, height: 2560, newWidth: 1920, newHeight: 2560),
            PageChange(page: 2, boxes: Self.boxes, width: 1920, height: 2560, newWidth: 2560, newHeight: 1920),
            PageChange(page: 3, boxes: [], width: 1920, height: 2560, newWidth: 2560, newHeight: 1920),
        ]
        #expect(HiddenContent.pages(changes) == [2, 4])
    }
}
