import AppKit
import CoreGraphics
import Foundation
import ImageIO
import InkNotebookEditorKit
import Testing
import UniformTypeIdentifiers

@testable import InkNotebookEditor

/// A picture made ready to insert (#264): a colour PNG and a PDF page come out in Manta greys, as
/// a PNG the helper can insert; pasted rich text keeps its plain text and line breaks.
@Suite final class PictureImportTests {
    let folder: URL

    init() throws {
        folder = try WritePathTests.makeFolder("picture-import-tests")
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A 40 by 20 picture: red on the left half, blue on the right.
    static func colourImage() throws -> CGImage {
        let context = try #require(
            CGContext(
                data: nil, width: 40, height: 20, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        context.setFillColor(red: 0, green: 0, blue: 1, alpha: 1)
        context.fill(CGRect(x: 20, y: 0, width: 20, height: 20))
        return try #require(context.makeImage())
    }

    static func greys(_ image: CGImage) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height)
        let context = try #require(
            CGContext(
                data: &bytes, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return bytes
    }

    @Test func aColourPNGIsSentAndShownInTheSixteenGreys() throws {
        let png = folder.appending(path: "colour.png")
        let destination = try #require(
            CGImageDestinationCreateWithURL(png as CFURL, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, try Self.colourImage(), nil)
        #expect(CGImageDestinationFinalize(destination))
        let picture = try PictureImport.make(try PictureImport.image(at: png), folder: folder)
        #expect(Set(try Self.greys(picture.image)) == [51, 17])
        // The file the helper inserts holds the same greys.
        let sent = try PictureImport.image(at: picture.file)
        #expect(Set(try Self.greys(sent)) == [51, 17])
        #expect(picture.file.pathExtension == "png")
    }

    @Test func aPDFsFirstPageIsAPicture() throws {
        let pdf = folder.appending(path: "page.pdf")
        var box = CGRect(x: 0, y: 0, width: 200, height: 100)
        let context = try #require(CGContext(pdf as CFURL, mediaBox: &box, nil))
        context.beginPDFPage(nil)
        context.setFillColor(red: 0, green: 0.5, blue: 0, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
        context.endPDFPage()
        context.closePDF()
        let image = try PictureImport.image(at: pdf)
        #expect(image.width == 200 * Int(PictureImport.pdfScale))
        let picture = try PictureImport.make(image, folder: folder)
        #expect(try Self.greys(picture.image).allSatisfy { MantaGreys.levels.contains($0) })
    }

    @Test func pastedRichTextKeepsOnlyItsPlainTextAndLineBreaks() throws {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("picture-import-tests-\(UUID().uuidString)"))
        defer { pasteboard.releaseGlobally() }
        let rich = NSAttributedString(
            string: "Plan\nBuy paper",
            attributes: [.font: NSFont.boldSystemFont(ofSize: 30), .foregroundColor: NSColor.red])
        let rtf = try rich.data(
            from: NSRange(location: 0, length: rich.length),
            documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf])
        pasteboard.clearContents()
        pasteboard.setData(rtf, forType: .rtf)
        #expect(TextPreview.plain(from: pasteboard) == "Plan\nBuy paper")
        pasteboard.clearContents()
        pasteboard.setString("one line", forType: .string)
        #expect(TextPreview.plain(from: pasteboard) == "one line")
    }
}
