import CoreGraphics
import Foundation
import PDFKit
import Testing

@testable import NoteEditor
@testable import NoteFormat

/// A note's ink as vectors (#365), over notes the tablet wrote: `elements-tablet.note` (23 strokes,
/// two text boxes and a picture) and `landscape-tablet.note` (11 strokes on a landscape page).
struct VectorExportTests {
    @Test func eachStrokeIsOnePath() throws {
        let note = try Fixtures.note("elements-tablet.note")
        let elements = try VectorExport.shownElements(of: note, page: 0)
        #expect(VectorExport.ink(elements).count == 23)
        let svg = try VectorExport.svg(note: note, page: 0)
        #expect(svg.components(separatedBy: "<path ").count - 1 == 23)
        #expect(svg.components(separatedBy: "<image ").count - 1 == 2, "the template and the picture")
        #expect(svg.components(separatedBy: "<text ").count - 1 == 2)
        let document = try XMLDocument(data: Data(svg.utf8))
        #expect(document.rootElement()?.attribute(forName: "viewBox")?.stringValue == "0 0 1920 2560")
    }

    @Test func aStrokeWithoutItsOutlineIsDrawnAlongItsPoints() throws {
        let stroke = try #require(try Fixtures.note("landscape-tablet.note").elements(page: 0).first)
        let bare = PageElement(
            content: stroke.content, layer: 0, bounds: stroke.bounds, points: stroke.points, outline: nil,
            record: stroke.record)
        let ink = try #require(VectorExport.ink([bare]).first)
        #expect(stroke.bounds.insetBy(dx: -4, dy: -4).contains(ink.path.boundingBoxOfPath))
        #expect(ink.path.boundingBoxOfPath.width >= 1 && ink.grey == 0)
    }

    @Test func thePDFHasEveryPageAsLargeAsOnPaperLandscapeWide() throws {
        let portrait = try Fixtures.note("elements-tablet.note")
        let pdf = try #require(PDFDocument(data: try VectorExport.pdf(note: portrait)))
        #expect(pdf.pageCount == portrait.pages.count)
        let wide = try #require(
            PDFDocument(data: try VectorExport.pdf(note: try Fixtures.note("landscape-tablet.note"))))
        let box = try #require(wide.page(at: 0)).bounds(for: .mediaBox)
        #expect(abs(box.width - 2560 * 72 / 300) < 1 && abs(box.height - 1920 * 72 / 300) < 1)
    }

    /// Drawn back at 300 dpi, the vector page covers the ink the reader draws, inside the strokes'
    /// boxes: the text boxes are drawn in the Mac's font, not the tablet's.
    @Test(arguments: ["landscape-tablet.note", "elements-tablet.note"])
    func theVectorPageCoversTheDrawnInk(name: String) throws {
        let note = try Fixtures.note(name)
        let drawn = try note.render(page: 0)
        let page = try #require(PDFDocument(data: try VectorExport.pdf(note: note))?.page(at: 0))
        let vector = try Self.greys(page, width: drawn.width, height: drawn.height)
        let strokes = try note.elements(page: 0).filter { $0.kind == .stroke }.map(\.bounds)
        var both = 0
        var either = 0
        for y in 0..<drawn.height {
            for x in 0..<drawn.width where strokes.contains(where: { $0.contains(CGPoint(x: x, y: y)) }) {
                let a = drawn.pixels[y * drawn.width + x] < 128
                let b = vector[y * drawn.width + x] < 128
                if a || b { either += 1 }
                if a && b { both += 1 }
            }
        }
        #expect(either > 0)
        // 0.93 and 0.95 measured: a 4-pixel stroke's smoothed edge pixels stay lighter than the
        // reader's hard edge, with no shift (a pixel either way drops it below 0.82).
        #expect(Double(both) / Double(either) >= 0.9)
    }

    /// A PDF page drawn into greys at `width` x `height` pixels, rows from the top.
    static func greys(_ page: PDFPage, width: Int, height: Int) throws -> [UInt8] {
        let context = try #require(
            CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue))
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let box = page.bounds(for: .mediaBox)
        context.scaleBy(x: CGFloat(width) / box.width, y: CGFloat(height) / box.height)
        page.draw(with: .mediaBox, to: context)
        let data = try #require(context.data)
        // A bitmap context's first row is the image's top row.
        return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: width * height))
    }
}
