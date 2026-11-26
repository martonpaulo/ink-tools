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
