import CoreGraphics
import Foundation
import ImageIO
import NoteFormat
import UniformTypeIdentifiers

/// A page taken out of the note (#323): as PNG, as PDF and, when it has words, as text, for Edit ›
/// Copy and for a drag of its thumbnail. The page is drawn only when another app asks for it.
nonisolated enum PageExport {
    /// The page's pixels are 300 to the inch, as the tablet draws them: the unit the note's
    /// recognition boxes are measured in too (registry item notefile.format-versions).
    static let dotsPerInch = Double(Registry.NotefileFormatVersions.recognitionBoxDotsPerInch)
    static let pointsPerInch = 72.0

    /// An item provider for page `index` of `note`: PNG, PDF and, when `text` is not empty, plain
    /// text; `name` is the file name a drop into Finder gives it, without its extension.
    static func itemProvider(note: NoteFile, page index: Int, name: String, text: String) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.suggestedName = name
        for type in [UTType.png, .pdf] {
            provider.registerDataRepresentation(for: type, visibility: .all) { done in
                do {
                    let image = try image(of: note, page: index)
                    done(type == .png ? try png(image) : try pdf(image), nil)
                } catch {
                    done(nil, error)
                }
                return nil
            }
        }
        if !text.isEmpty {
            provider.registerDataRepresentation(for: .utf8PlainText, visibility: .all) { done in
                done(Data(text.utf8), nil)
                return nil
            }
        }
        return provider
    }

    /// The file name of page `index` (from 0) of the note named `note`.
    static func name(note: String, page index: Int) -> String {
        "\(note) page \(index + 1)"
    }

    static func image(of note: NoteFile, page index: Int) throws -> CGImage {
        guard let image = try note.render(page: index).cgImage() else { throw ExportError.noImage }
        return image
    }

    static func png(_ image: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)
        else { throw ExportError.noImage }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw ExportError.noImage }
        return data as Data
    }

    /// One PDF page as large as the page on paper, the drawn page filling it.
    static func pdf(_ image: CGImage) throws -> Data {
        let scale = pointsPerInch / dotsPerInch
        var box = CGRect(x: 0, y: 0, width: Double(image.width) * scale, height: Double(image.height) * scale)
        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data),
            let context = CGContext(consumer: consumer, mediaBox: &box, nil)
        else { throw ExportError.noImage }
        context.beginPDFPage(nil)
        context.interpolationQuality = .high
        context.draw(image, in: box)
        context.endPDFPage()
        context.closePDF()
        return data as Data
    }

    enum ExportError: Error {
        /// The page could not be drawn or encoded.
        case noImage
    }
}
