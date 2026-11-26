import AppKit
import CoreGraphics
import Foundation
import ImageIO
import InkNotebookEditorKit
import PDFKit
import UniformTypeIdentifiers

/// A picture made ready to insert (#264): read from a PNG, a JPEG, a PDF's first page or the
/// pasteboard, rounded to the Manta's 16 greys, and written as the PNG the helper inserts. The
/// same picture is what the Mac draws, so the Mac shows it as the tablet will.
nonisolated struct PictureImport: @unchecked Sendable {
    /// The picture in Manta greys.
    let image: CGImage
    /// Its PNG in the app's own folder, which `inkctl note edit` copies to the tablet.
    let file: URL

    /// The kinds a picture may come from.
    static let types: [UTType] = [.png, .jpeg, .pdf]

    /// The resolution a PDF page is drawn at, in pixels per point: a Letter page is 1700 pixels
    /// wide, near the Manta's 1920.
    static let pdfScale: CGFloat = 2

    enum Failure: Error, Equatable {
        case unreadable(String)
    }

    /// The image of a PNG or JPEG file, or of a PDF's first page.
    static func image(at url: URL) throws(Failure) -> CGImage {
        if UTType(filenameExtension: url.pathExtension)?.conforms(to: .pdf) == true {
            guard let page = PDFDocument(url: url)?.page(at: 0) else { throw .unreadable(url.lastPathComponent) }
            let bounds = page.bounds(for: .mediaBox)
            let image = page.thumbnail(
                of: CGSize(width: bounds.width * pdfScale, height: bounds.height * pdfScale), for: .mediaBox)
            guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                throw .unreadable(url.lastPathComponent)
            }
            return cgImage
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { throw .unreadable(url.lastPathComponent) }
        return image
    }

    /// An image on the pasteboard, as Paste gives it.
    static func image(on pasteboard: NSPasteboard) -> CGImage? {
        NSImage(pasteboard: pasteboard)?.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }

    /// `image` in Manta greys, written to `folder` as a new PNG.
    static func make(_ image: CGImage, folder: URL) throws(Failure) -> PictureImport {
        let width = image.width
        let height = image.height
        var rgba = [UInt8](repeating: 0, count: width * height * MantaGreys.Channel.count)
        let drawn = rgba.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * MantaGreys.Channel.count, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { throw .unreadable("the image") }
        // Premultiplied colour over its alpha is the colour itself laid on black; the greys lay it
        // on white instead.
        let alphaAt = MantaGreys.Channel.alpha
        for index in stride(from: 0, to: rgba.count, by: MantaGreys.Channel.count)
        where rgba[index + alphaAt] > 0 && rgba[index + alphaAt] < UInt8.max {
            let alpha = Int(rgba[index + alphaAt])
            for channel in 0..<alphaAt {
                rgba[index + channel] = UInt8(min(Int(rgba[index + channel]) * Int(UInt8.max) / alpha, Int(UInt8.max)))
            }
        }
        let greys = MantaGreys.greys(rgba: rgba)
        guard let provider = CGDataProvider(data: Data(greys) as CFData),
            let grey = CGImage(
                width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: width,
                space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { throw .unreadable("the image") }
        let file = folder.appending(path: "picture-\(UUID().uuidString).png")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            throw .unreadable(folder.lastPathComponent)
        }
        guard
            let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil)
        else { throw .unreadable(file.lastPathComponent) }
        CGImageDestinationAddImage(destination, grey, nil)
        guard CGImageDestinationFinalize(destination) else { throw .unreadable(file.lastPathComponent) }
        return PictureImport(image: grey, file: file)
    }

    /// The app's folder of pictures waiting to be inserted: Application Support/Ink Notebook
    /// Editor/Pictures.
    static func folder() throws -> URL {
        try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        .appending(path: "Ink Notebook Editor/Pictures", directoryHint: .isDirectory)
    }
}

/// A text box drawn on the Mac while it is on its way (#264): black text in the system font,
/// see-through elsewhere, at the box's size in page pixels.
nonisolated enum TextPreview {
    static func image(_ text: String, width: Int, height: Int, fontSize: Int) -> CGImage? {
        guard width > 0, height > 0,
            let context = CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        let graphics = NSGraphicsContext(cgContext: context, flipped: false)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: CGFloat(fontSize)), .foregroundColor: NSColor.black,
        ]
        NSAttributedString(string: text, attributes: attributes)
            .draw(with: CGRect(x: 0, y: 0, width: width, height: height), options: [.usesLineFragmentOrigin])
        NSGraphicsContext.restoreGraphicsState()
        return context.makeImage()
    }
}

extension TextPreview {
    /// Rich text from another app keeps only its plain text and line breaks (owner, 2026-11-26).
    nonisolated static func plain(from pasteboard: NSPasteboard) -> String? {
        if let string = pasteboard.string(forType: .string) { return string }
        return NSAttributedString(pasteboard: pasteboard)?.string
    }
}

extension NSAttributedString {
    /// The rich text on `pasteboard`, RTF first.
    nonisolated convenience init?(pasteboard: NSPasteboard) {
        guard let data = pasteboard.data(forType: .rtf) else { return nil }
        self.init(rtf: data, documentAttributes: nil)
    }
}
