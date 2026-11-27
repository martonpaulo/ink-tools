import CoreGraphics
import Foundation
import ImageIO
import NoteEditorKit
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
    /// The byte of a pixel that holds its opacity, after red, green and blue.
    static let opacity = bytesPerPixel - 1
    /// The middle of a pixel, from its corner.
    static let pixelMiddle = 0.5

    /// An item provider for the selected `items` of page `index` (#323): their ink as PNG and
    /// PDF on a transparent background, and their words when they have any.
    static func selectionProvider(
        note: NoteFile, page index: Int, items: [Selectable], name: String, text: String
    ) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.suggestedName = name
        for type in [UTType.png, .pdf] {
            provider.registerDataRepresentation(for: type, visibility: .all) { done in
                do {
                    let image = try selectionImage(of: note, page: index, items: items)
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

    /// How far from a selected stroke's path its ink reaches, in page pixels: a wide pen's half
    /// width. Ink farther from every selected path is another stroke's and stays out.
    static let inkReach: CGFloat = 6

    /// The ink of the selected `items` (#323): the page drawn without its template, cut to their
    /// frame and `margin`, each pixel black with its darkness as opacity, so the background around
    /// the ink is transparent. Only ink near a selected stroke's path or inside a selected text
    /// box or picture comes along, never a neighbouring stroke's; a picture keeps its own greys,
    /// opaque.
    static func selectionImage(of note: NoteFile, page index: Int, items: [Selectable]) throws -> CGImage {
        let bitmap = try note.render(page: index, template: false)
        let bounds = CGRect(x: 0, y: 0, width: bitmap.width, height: bitmap.height)
        let frame = items.map(\.bounds).reduce(CGRect.null) { $0.union($1) }.insetBy(dx: -margin, dy: -margin)
            .intersection(bounds).integral
        guard !frame.isNull, frame.width >= 1, frame.height >= 1 else { throw ExportError.noImage }
        let width = Int(frame.width)
        let height = Int(frame.height)
        let kept = try mask(items, in: frame)
        let pictures = items.filter(\.isPicture).map(\.bounds)
        var rgba = [UInt8](repeating: 0, count: width * height * bytesPerPixel)
        for row in 0..<height {
            for column in 0..<width where kept[row * width + column] > 0 {
                let x = Int(frame.minX) + column
                let y = Int(frame.minY) + row
                let grey = bitmap.pixels[y * bitmap.width + x]
                let at = (row * width + column) * bytesPerPixel
                let middle = CGPoint(x: Double(x) + Self.pixelMiddle, y: Double(y) + Self.pixelMiddle)
                if pictures.contains(where: { $0.contains(middle) }) {
                    rgba.replaceSubrange(at..<(at + opacity), with: repeatElement(grey, count: opacity))
                    rgba[at + opacity] = UInt8.max
                } else {
                    // Black ink at the grey's darkness: on white it shows the same grey.
                    rgba[at + opacity] = UInt8.max - grey
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

    /// One byte per pixel of `frame`, not zero where a selected element's ink may be: each
    /// stroke's path drawn `inkReach` wide on each side, each text box and picture filled.
    static func mask(_ items: [Selectable], in frame: CGRect) throws -> [UInt8] {
        let width = Int(frame.width)
        let height = Int(frame.height)
        var bytes = [UInt8](repeating: 0, count: width * height)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return false }
            // Page pixels count down from the top; the context's rows count up from the bottom.
            context.translateBy(x: -frame.minX, y: frame.maxY)
            context.scaleBy(x: 1, y: -1)
            context.setFillColor(gray: 1, alpha: 1)
            context.setStrokeColor(gray: 1, alpha: 1)
            context.setLineWidth(2 * inkReach)
            context.setLineCap(.round)
            context.setLineJoin(.round)
            for item in items {
                if item.isArea {
                    context.fill(item.bounds)
                } else if let first = item.points.first {
                    context.move(to: first)
                    for point in item.points.dropFirst() { context.addLine(to: point) }
                    if item.points.count == 1 { context.addLine(to: first) }
                    context.strokePath()
                }
            }
            return true
        }
        guard drawn else { throw ExportError.noImage }
        return bytes
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
