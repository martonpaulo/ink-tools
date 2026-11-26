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

    /// The space kept around a selection's ink, in page pixels, and the bytes of one pixel of its
    /// picture: red, green, blue and opacity.
    static let margin: CGFloat = 8
    static let bytesPerPixel = 4

    /// An item provider for a selection on page `index` (#323): its ink as PNG and PDF on a
    /// transparent background, and its words when it has any; `boxes` are the selected elements'
    /// boxes and `areas` the frames of the selected pictures and text boxes, in page pixels.
    static func selectionProvider(
        note: NoteFile, page index: Int, boxes: [CGRect], areas: [CGRect], name: String, text: String
    ) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.suggestedName = name
        for type in [UTType.png, .pdf] {
            provider.registerDataRepresentation(for: type, visibility: .all) { done in
                do {
                    let image = try selectionImage(of: note, page: index, boxes: boxes, areas: areas)
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

    /// The ink of a selection (#323): the page drawn without its template, cut to `frame` (page
    /// pixels), each pixel black with its darkness as opacity, so the background around the ink is
    /// transparent; only what lies inside one of `boxes` keeps its ink, so a stroke beside the
    /// selection never comes along. A picture in `areas` keeps its own greys, opaque.
    static func selectionImage(of note: NoteFile, page index: Int, boxes: [CGRect], areas: [CGRect]) throws
        -> CGImage
    {
        let bitmap = try note.render(page: index, template: false)
        let bounds = CGRect(x: 0, y: 0, width: bitmap.width, height: bitmap.height)
        let frame = boxes.reduce(CGRect.null) { $0.union($1) }.insetBy(dx: -margin, dy: -margin)
            .intersection(bounds).integral
        guard !frame.isNull, frame.width >= 1, frame.height >= 1 else { throw ExportError.noImage }
        let width = Int(frame.width)
        let height = Int(frame.height)
        var rgba = [UInt8](repeating: 0, count: width * height * bytesPerPixel)
        for row in 0..<height {
            for column in 0..<width {
                let x = Int(frame.minX) + column
                let y = Int(frame.minY) + row
                let point = CGPoint(x: Double(x) + 0.5, y: Double(y) + 0.5)
                guard boxes.contains(where: { $0.insetBy(dx: -margin, dy: -margin).contains(point) }) else { continue }
                let grey = bitmap.pixels[y * bitmap.width + x]
                let at = (row * width + column) * bytesPerPixel
                if areas.contains(where: { $0.contains(point) }) {
                    rgba[at] = grey
                    rgba[at + 1] = grey
                    rgba[at + 2] = grey
                    rgba[at + 3] = UInt8.max
                } else {
                    // Black ink at the grey's darkness: on white it shows the same grey.
                    rgba[at + 3] = UInt8.max - grey
                }
            }
        }
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
            let image = CGImage(
                width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8 * bytesPerPixel,
                bytesPerRow: width * bytesPerPixel, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue), provider: provider,
                decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { throw ExportError.noImage }
        return image
    }

    /// The file name of a selection on page `index` (from 0) of the note named `note`.
    static func selectionName(note: String, page index: Int) -> String {
        "\(note) page \(index + 1) selection"
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
