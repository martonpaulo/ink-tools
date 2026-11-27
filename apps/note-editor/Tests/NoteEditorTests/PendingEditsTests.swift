import Foundation
import NoteEditorKit
import SwiftUI
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// A page's thumbnail shows the element edits on their way, as the page does (#476), and is the
/// tablet's drawing again once an edit is refused.
@MainActor
@Suite final class PendingEditsTests {
    let folder: URL
    let copy: URL
    let original: Data

    init() throws {
        folder = try WritePathTests.makeFolder("pending-edits-tests")
        copy = folder.appending(path: "Edit.note")
        original = try Fixtures.data("content.note")
        try original.write(to: copy)
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    func editor(_ tablet: any TabletWriting) throws -> NoteEditor {
        NoteEditor(
            tabletPath: WritePathTests.note, copy: copy, base: try NoteFile(data: original), tablet: tablet,
            backups: NoteBackups(folder: folder.appending(path: "Backups")))
    }

    /// Page 1's row of the page list, drawn off screen, with `editor` in the environment.
    func row(_ editor: NoteEditor?) async throws -> Data {
        let pages = PageImages(note: try NoteFile(data: original))
        await pages.loadThumbnail(0, scale: 1)
        let page = try #require(pages.pageSizes.first)
        let row = ThumbnailRow(page: page, count: pages.pageSizes.count, pages: pages)
        let view = editor.map { AnyView(row.environment($0)) } ?? AnyView(row)
        return try await OffscreenWindow.png(of: view, size: CGSize(width: 200, height: 260), dark: false)
    }

    static let box = EditRect(left: 200, top: 1600, right: 1400, bottom: 1900)

    @Test func anInsertOnItsWayShowsInTheThumbnail() async throws {
        let plain = try await row(nil)
        let editor = try editor(RenderTests.SlowTablet(pullWaits: true))
        #expect(editor.insertText(page: 0, text: "On its way", rect: Self.box, fontSize: 160))
        #expect(!editor.insertions(on: 0).isEmpty)
        #expect(try await row(editor) != plain)
    }

    @Test func aRefusedInsertLeavesTheThumbnailAsTheTabletDrewIt() async throws {
        let plain = try await row(nil)
        let tablet = WritePathTests.FakeTablet(bytes: original)
        tablet.failEdit = .failed("device-link edit: tablet-refused: operation 1")
        let editor = try editor(tablet)
        #expect(editor.insertText(page: 0, text: "Refused", rect: Self.box, fontSize: 160))
        for _ in 0..<200 where !editor.pending.isEmpty {
            // timing-independent: a poll on the refusal with a deadline; the assertion below fails a hang.
            try? await Task.sleep(for: .milliseconds(10))
        }
        #expect(editor.pending.isEmpty && editor.refusal != nil)
        #expect(try await row(editor) == plain)
    }

    /// A delete of every element of page 1 on its way, drawn as the page and the thumbnails draw it
    /// at `width` points on a display of `scale`, leaves no edge of them (#478): inside each element's
    /// frame widened by 2 points, no pixel is darker than the template alone drawn the same way.
    @Test(arguments: [
        (name: "39 % at 1x", width: 1404 * 0.39, scale: 1), (name: "39 % at 2x", width: 1404 * 0.39 / 2, scale: 2),
        (name: "thumbnail", width: 100, scale: 2),
    ])
    func aDeleteOnItsWayLeavesNoEdge(size: (name: String, width: CGFloat, scale: CGFloat)) async throws {
        let note = try NoteFile(data: original)
        let pages = PageImages(note: note)
        await pages.loadElements(0)
        let items = try #require(pages.selectable(0))
        let lifted = try #require(await LiftedInk.make(note, page: 0, items: items))
        let page = try #require(try note.render(page: 0).cgImage())
        let template = try #require(try note.render(page: 0, ink: false).cgImage())
        let pixels = CGFloat(page.width) / size.width
        let points = CGSize(width: size.width, height: CGFloat(page.height) / pixels)
        let deleting = try Self.grey(page, deletions: [lifted], pixels: pixels, size: points, scale: size.scale)
        let bare = try Self.grey(template, deletions: [], pixels: pixels, size: points, scale: size.scale)
        let device = size.scale / pixels
        for item in items {
            let frame = item.bounds.insetBy(dx: -2 * pixels, dy: -2 * pixels)
            let left = max(Int(frame.minX * device), 0)
            let right = min(Int(frame.maxX * device), deleting.width - 1)
            let top = max(Int(frame.minY * device), 0)
            let bottom = min(Int(frame.maxY * device), deleting.height - 1)
            var darkest = 0
            for row in top...bottom {
                for column in left...right {
                    let at = row * deleting.width + column
                    darkest = max(darkest, Int(bare.pixels[at]) - Int(deleting.pixels[at]))
                }
            }
            #expect(darkest <= 8, "\(size.name): element \(item.id) leaves an edge \(darkest) greys dark")
        }
    }

    /// A selection moved onto the place of a deleted one, both on their way, shows its ink there:
    /// every hole is cut before any moved ink is drawn (#478).
    @Test func aMoveOntoADeletedPlaceShowsItsInk() async throws {
        let note = try NoteFile(data: original)
        let pages = PageImages(note: note)
        await pages.loadElements(0)
        let items = try #require(pages.selectable(0))
        let (moved, deleted) = (try #require(items.first), try #require(items.last))
        #expect(moved.id != deleted.id)
        let lifted = try #require(await LiftedInk.make(note, page: 0, items: [moved]))
        let gone = try #require(await LiftedInk.make(note, page: 0, items: [deleted]))
        let shift = CGAffineTransform(
            translationX: deleted.bounds.midX - moved.bounds.midX, y: deleted.bounds.midY - moved.bounds.midY)
        let change = LiftedChange(records: [moved.record], lifted: lifted, matrix: PageMatrix(shift))
        let page = try #require(try note.render(page: 0).cgImage())
        let template = try #require(try note.render(page: 0, ink: false).cgImage())
        let pixels: CGFloat = 2
        let points = CGSize(width: CGFloat(page.width) / pixels, height: CGFloat(page.height) / pixels)
        let drawn = try Self.grey(
            page, changes: [change], deletions: [gone], pixels: pixels, size: points, scale: 1)
        let bare = try Self.grey(template, deletions: [], pixels: pixels, size: points, scale: 1)
        // Where the moved ink lies on the deleted selection's old place.
        let landed = moved.bounds.applying(shift).intersection(deleted.bounds)
        #expect(!landed.isEmpty)
        var darkest = 0
        for row in Int(landed.minY / pixels)..<Int(landed.maxY / pixels) {
            for column in Int(landed.minX / pixels)..<Int(landed.maxX / pixels) {
                let at = row * drawn.width + column
                darkest = max(darkest, Int(bare.pixels[at]) - Int(drawn.pixels[at]))
            }
        }
        #expect(darkest > 64, "the moved ink is \(darkest) greys dark at its new place")
    }

    /// `image` drawn at `size` points on a display of `scale` with `changes` and `deletions` over
    /// it, as grey bytes.
    static func grey(
        _ image: CGImage, changes: [LiftedChange] = [], deletions: [LiftedInk], pixels: CGFloat, size: CGSize,
        scale: CGFloat
    ) throws -> PageBitmap {
        let view = ZStack {
            Image(decorative: image, scale: 1).resizable().interpolation(.high)
            Canvas { context, _ in
                PendingEdits.draw(
                    changes: changes, deletions: deletions, insertions: [], pixels: pixels, in: &context)
            }
        }
        .frame(width: size.width, height: size.height)
        let renderer = ImageRenderer(content: view)
        renderer.scale = scale
        let drawn = try #require(renderer.cgImage)
        var bytes = [UInt8](repeating: 0, count: drawn.width * drawn.height)
        bytes.withUnsafeMutableBytes { buffer in
            let context = CGContext(
                data: buffer.baseAddress, width: drawn.width, height: drawn.height, bitsPerComponent: 8,
                bytesPerRow: drawn.width, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue)
            context?.draw(drawn, in: CGRect(x: 0, y: 0, width: drawn.width, height: drawn.height))
        }
        return PageBitmap(width: drawn.width, height: drawn.height, pixels: bytes)
    }
}
