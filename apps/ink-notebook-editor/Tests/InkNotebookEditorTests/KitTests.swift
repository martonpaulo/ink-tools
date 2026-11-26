import CoreGraphics
import Foundation
import InkNotebookEditorKit
import Testing

@Suite struct PageNavigatorTests {
    @Test func movesWithinTheNotebookAndNeverWraps() {
        var navigator = PageNavigator(pageCount: 3)
        navigator.go(.previous)
        #expect(navigator.index == 0)
        navigator.go(.next)
        navigator.go(.next)
        navigator.go(.next)
        #expect(navigator.index == 2)
        navigator.go(.first)
        #expect(navigator.index == 0)
        navigator.go(.last)
        #expect(navigator.index == 2)
        #expect(!navigator.allows(.next) && navigator.allows(.previous))
    }

    @Test func aNotebookWithNoPagesHasNoCurrentPage() {
        var navigator = PageNavigator(pageCount: 0)
        navigator.go(.next)
        #expect(navigator.index == nil)
        #expect(PageMove.allCases.allSatisfy { !navigator.allows($0) })
    }

    @Test func showIgnoresAPageOutsideTheNotebook() {
        var navigator = PageNavigator(pageCount: 2, index: 9)
        #expect(navigator.index == 1)
        navigator.show(-1)
        navigator.show(2)
        #expect(navigator.index == 1)
        navigator.show(0)
        #expect(navigator.index == 0)
    }

    /// The page list's selection of several pages (#329): a page command acts on it while it holds
    /// the current page, and a page turned outside it clears it.
    @Test func severalPickedPagesFollowTheCurrentPage() {
        var navigator = PageNavigator(pageCount: 5, index: 1)
        #expect(navigator.selectedPages == [1])
        navigator.pick([1, 3])
        #expect(navigator.index == 3 && navigator.selectedPages == [1, 3])
        navigator.pick([3])
        #expect(navigator.index == 3 && navigator.selectedPages == [3])
        navigator.pick([0, 3, 9])
        #expect(navigator.selectedPages == [0, 3])
        #expect(navigator.index == 0)
        navigator.go(.next)
        #expect(navigator.selectedPages == [1] && navigator.picked.isEmpty)
        navigator.go(.previous)
        #expect(navigator.selectedPages == [0])
        navigator.pick([0, 2])
        navigator.pick([2])
        #expect(navigator.index == 2)
        navigator.pick([])
        #expect(navigator.index == 2 && navigator.selectedPages == [2])
        // A Shift-click down the list shows the page clicked; one up the list too.
        navigator.pick(Set(2...4))
        #expect(navigator.index == 4)
        navigator.pick([0, 1, 2, 3, 4])
        #expect(navigator.index == 0)
    }
}

/// The template name an added page is sent with (#329).
@Suite struct PageTemplateTests {
    @Test func aPageStyleGivesTheNameTheTabletTakes() {
        #expect(PageTemplate.systemName(ofStyle: "style_white_a5x2") == "style_white")
        #expect(PageTemplate.systemName(ofStyle: "style_5mm_grid_a5x2") == "style_5mm_grid")
        #expect(PageTemplate.systemName(ofStyle: "style_white") == "style_white")
        #expect(PageTemplate.systemName(ofStyle: "user_dots") == nil)
        #expect(PageTemplate.systemName(ofStyle: "user_pdf_plan_1") == nil)
    }
}

@Suite struct PageFitTests {
    static let portrait = CGSize(width: 1404, height: 1872)
    static let box = CGSize(width: 112, height: 150)

    @Test func aPortraitPageFillsTheBoxHeightOrWidthAndNeverSpills() {
        let fitted = PageFit.fitted(page: Self.portrait, in: Self.box)
        #expect(fitted.width <= Self.box.width && fitted.height <= Self.box.height)
        #expect(fitted == CGSize(width: 112, height: 149))
    }

    @Test func aLandscapePageKeepsItsOwnAspect() {
        let landscape = CGSize(width: 1872, height: 1404)
        let fitted = PageFit.fitted(page: landscape, in: Self.box)
        #expect(fitted == CGSize(width: 112, height: 84))
    }

    @Test(arguments: [1.0, 2.0])
    func theRasterIsThePointSizeTimesTheDisplayScale(scale: CGFloat) {
        let points = PageFit.fitted(page: Self.portrait, in: Self.box)
        let pixels = PageFit.pixels(for: points, scale: scale)
        #expect(CGFloat(pixels.width) / scale == points.width)
        #expect(CGFloat(pixels.height) / scale == points.height)
    }

    @Test func aPageWithNoAreaFitsToZero() {
        #expect(PageFit.fitted(page: .zero, in: Self.box) == .zero)
    }

    static let window = CGSize(width: 1000, height: 720)

    @Test func aPortraitNotebookOpensAtThePortraitWindow() {
        #expect(
            PageFit.window(firstPage: Self.portrait, sidebar: 170, margin: 24, portrait: Self.window) == Self.window)
        #expect(PageFit.window(firstPage: .zero, sidebar: 170, margin: 24, portrait: Self.window) == Self.window)
    }

    /// A landscape page fills the page area of the window it opens in, with no blank band (#291).
    @Test func aLandscapeNotebookOpensAsWideAsItsPage() {
        let page = CGSize(width: 2560, height: 1920)
        let window = PageFit.window(firstPage: page, sidebar: 170, margin: 24, portrait: Self.window)
        #expect(window == CGSize(width: 1114, height: 720))
        let area = CGSize(width: window.width - 170 - 2 * 24, height: window.height - 2 * 24)
        let fitted = PageFit.fitted(page: page, in: area)
        #expect(fitted.height == area.height && area.width - fitted.width < 1)
    }

    @Test func aWindowLargerThanTheScreenShrinksWithItsAspect() {
        let screen = CGSize(width: 1280, height: 775)
        #expect(PageFit.onScreen(CGSize(width: 1114, height: 720), screen: screen) == CGSize(width: 1114, height: 720))
        #expect(PageFit.onScreen(CGSize(width: 2000, height: 720), screen: screen) == CGSize(width: 1280, height: 460))
    }
}

@Suite struct TabletListingTests {
    @Test func keepsFoldersAndNotesFoldersFirstByName() throws {
        let json = """
            {"path": "/storage/emulated/0/Note", "entries": [
              {"name": "Zeta.note", "type": "file", "bytes": 10, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "Sub Folder", "type": "dir", "bytes": 3452, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "Ação 2.NOTE", "type": "file", "bytes": 20, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "cover.png", "type": "file", "bytes": 30, "modified": "2026-11-10T00:13:47+01:00"},
              {"name": "A note.note", "type": "file", "bytes": 40, "modified": "2026-11-10T00:13:47+01:00"}
            ]}
            """
        let listing = try TabletListing.parse(Data(json.utf8))
        #expect(listing.entries.map(\.name) == ["Sub Folder", "A note.note", "Ação 2.NOTE", "Zeta.note"])
        #expect(listing.entries[0].isFolder)
    }

    @Test func anAnswerThatIsNotAListingThrows() {
        #expect(throws: (any Error).self) { try TabletListing.parse(Data("pulled: x".utf8)) }
        #expect(throws: (any Error).self) { try TabletListing.parse(Data()) }
    }
}

@Suite struct TabletCopyLocationTests {
    let location = TabletCopyLocation(root: URL(filePath: "/copies", directoryHint: .isDirectory))

    @Test func oneTabletPathIsOneLocalFile() {
        #expect(
            location.localURL(for: "Note/Sub Folder/A note.note")?.path() == "/copies/Note/Sub%20Folder/A%20note.note")
        #expect(location.localURL(for: "/storage/emulated/0/Note/a.note") == location.localURL(for: "Note/a.note"))
    }

    @Test(arguments: ["", "/", "Note/../../etc/passwd", "./Note/a.note", "/etc/passwd", "/storage/emulated/0"])
    func aPathOutsideTheSharedStorageIsRefused(path: String) {
        #expect(location.localURL(for: path) == nil)
    }
}

@Suite struct InkctlFailureTests {
    @Test func inkctlsJSONErrorNamesTheState() {
        let json = Data(
            #"{"error": "unreachable", "message": "SN1: no device. Connect it", "next": "adb devices"}"#.utf8)
        #expect(
            InkctlFailure.from(exitCode: 3, stdout: json, stderr: Data()) == .notConnected("SN1: no device. Connect it")
        )
        let missing = Data(#"{"error": "not_found", "message": "not found: /x"}"#.utf8)
        #expect(InkctlFailure.from(exitCode: 4, stdout: missing, stderr: Data()) == .notFound("not found: /x"))
    }

    @Test func noJSONFallsBackToStandardErrorAndNeverToNothing() {
        let failure = InkctlFailure.from(
            exitCode: 1, stdout: Data("garbage".utf8), stderr: Data("inkctl: adb is not installed\n".utf8))
        #expect(failure == .failed("adb is not installed"))
        let silent = InkctlFailure.from(exitCode: 1, stdout: Data(), stderr: Data())
        guard case .failed(let message) = silent else {
            Issue.record("a silent failure must still fail")
            return
        }
        #expect(message.contains("exit code 1"))
    }

    @Test func anExitCodeAloneStillNamesAnUnreachableTablet() {
        #expect(
            InkctlFailure.from(exitCode: 3, stdout: Data(), stderr: Data("inkctl: no tablet".utf8))
                == .notConnected("no tablet"))
    }
}

@Suite struct PageZoomTests {
    static let portrait = CGSize(width: 1404, height: 1872)
    static let landscape = CGSize(width: 1872, height: 1404)
    static let viewport = CGSize(width: 900, height: 600)

    @Test func zoomToFitShowsTheWholePageByItsOwnAspect() {
        #expect(
            PageZoom.fitPage.size(of: Self.portrait, in: Self.viewport, scale: 2) == CGSize(width: 450, height: 600))
        #expect(
            PageZoom.fitPage.size(of: Self.landscape, in: Self.viewport, scale: 2) == CGSize(width: 800, height: 600))
    }

    @Test func zoomToWidthFillsTheWidthWhateverTheHeight() {
        #expect(
            PageZoom.fitWidth.size(of: Self.portrait, in: Self.viewport, scale: 1) == CGSize(width: 900, height: 1200))
        #expect(
            PageZoom.fitWidth.size(of: Self.landscape, in: Self.viewport, scale: 1) == CGSize(width: 900, height: 675))
    }

    @Test(arguments: [1.0, 2.0])
    func actualSizeDrawsOnePagePixelPerDisplayPixel(scale: CGFloat) {
        let size = PageZoom.magnification(1).size(of: Self.portrait, in: Self.viewport, scale: scale)
        #expect(size.width * scale == Self.portrait.width && size.height * scale == Self.portrait.height)
    }

    @Test func zoomInAndOutStepFromTheShownMagnification() {
        // Zoom to Fit shows a 1872-pixel page in 600 points at 2x: a magnification of 0.64.
        let fit = PageZoom.fitPage
        #expect(fit.zoomedIn(page: Self.portrait, viewport: Self.viewport, scale: 2) == .magnification(0.67))
        #expect(fit.zoomedOut(page: Self.portrait, viewport: Self.viewport, scale: 2) == .magnification(0.5))
        let one = PageZoom.magnification(1)
        #expect(one.zoomedIn(page: Self.portrait, viewport: Self.viewport, scale: 1) == .magnification(1.25))
        #expect(one.zoomedOut(page: Self.portrait, viewport: Self.viewport, scale: 1) == .magnification(0.75))
    }

    @Test func aRoundedMagnificationCountsAsItsStep() {
        let shown = PageZoom.magnification(0.329)
        #expect(shown.zoomedIn(page: Self.portrait, viewport: Self.viewport, scale: 1) == .magnification(0.5))
    }

    @Test func zoomStopsAtBothEndsOfTheSteps() {
        let largest = PageZoom.magnification(PageZoom.steps[PageZoom.steps.count - 1])
        let smallest = PageZoom.magnification(PageZoom.steps[0])
        #expect(largest.zoomedIn(page: Self.portrait, viewport: Self.viewport, scale: 1) == nil)
        #expect(smallest.zoomedOut(page: Self.portrait, viewport: Self.viewport, scale: 1) == nil)
    }

    @Test func aPinchStaysWithinTheSteps() {
        #expect(PageZoom.pinched(from: 1, by: 1.5) == .magnification(1.5))
        #expect(PageZoom.pinched(from: 2, by: 10) == .magnification(PageZoom.steps[PageZoom.steps.count - 1]))
        #expect(PageZoom.pinched(from: 0.5, by: 0.1) == .magnification(PageZoom.steps[0]))
    }

    @Test func aPageOrViewportWithNoAreaHasNoSize() {
        #expect(PageZoom.fitPage.size(of: .zero, in: Self.viewport, scale: 1) == .zero)
        #expect(PageZoom.fitWidth.size(of: Self.portrait, in: .zero, scale: 1) == .zero)
    }
}

@Suite struct PageStackTests {
    /// Three pages of 100, 50 and 100 points, 24 apart: tops at 24, 148 and 222.
    static let stack = PageStack(heights: [100, 50, 100], margin: 24)

    struct Place: Equatable {
        let page: Int
        let fraction: CGFloat
    }

    static func place(_ y: CGFloat) -> Place? {
        stack.place(at: y).map { Place(page: $0.page, fraction: $0.fraction) }
    }

    @Test func eachPageStartsAMarginBelowThePageAbove() {
        #expect(Self.stack.top(of: 0) == 24)
        #expect(Self.stack.top(of: 1) == 148)
        #expect(Self.stack.top(of: 2) == 222)
    }

    @Test func anOffsetIsAPageAndAShareOfItsHeight() {
        #expect(Self.place(74) == Place(page: 0, fraction: 0.5))
        #expect(Self.place(173) == Place(page: 1, fraction: 0.5))
        // In a margin: the nearest edge.
        #expect(Self.place(130) == Place(page: 0, fraction: 1))
        #expect(Self.place(140) == Place(page: 1, fraction: 0))
        #expect(Self.place(9999) == Place(page: 2, fraction: 1))
        #expect(PageStack(heights: [], margin: 24).place(at: 0) == nil)
    }

    @Test func aZoomKeepsThePlaceUnderItsAnchor() {
        // The middle of a 40-point view at 54 is the middle of page 1 (offset 173); at twice the
        // size page 1 is 100 tall from 248, so its middle is at 298 and the view's top at 278.
        let zoomed = PageStack(heights: [200, 100, 200], margin: 24)
        #expect(Self.stack.keeping(20, at: 153, in: zoomed) == 278)
        // A pinch at the view's top keeps that place at the top.
        #expect(Self.stack.keeping(0, at: 173, in: zoomed) == 298)
        #expect(Self.stack.keeping(20, at: 0, in: zoomed) >= 0)
    }
}
