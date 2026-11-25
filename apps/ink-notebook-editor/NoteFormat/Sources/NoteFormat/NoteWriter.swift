// The Mac route of writing a note back (#263): edits that keep every byte they do not change.
// A measurement tool, not the editor's writer: the route the editor uses is decided by #263.
import CoreGraphics
import CoreText
import Foundation

/// A rectangle on the page, in page pixels from the top left.
public struct PageRect: Sendable, Equatable {
    public let x: Int, y: Int, width: Int, height: Int

    public init(x: Int, y: Int, width: Int, height: Int) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// Writes edited copies of a note. Each call returns the whole new file; the input stays as is.
public enum NoteWriter {
    static let tailMarker = Array(Registry.NotefileWriterByteEdit.tailMarker.utf8)
    /// Footer keys that start with a page number of four digits, counted from 1: a title, a
    /// keyword or a link on that page (supernotelib's footer keys).
    /// shortcut: read from supernotelib's key names, not measured on a note with a title; the
    /// device round of #263 checks it, a note with each kind would make it a fixture
    /// (registry item notefile.writer-byte-edit).
    static let pageKeyPrefixes = Registry.NotefileWriterByteEdit.pageKeyPrefixes
    static let pageNumberDigits = 4

    /// Moves page `from` to the place `to`, both counted from 0. Every page block keeps its bytes;
    /// only the footer changes: the page addresses in the new order, and the page number of each
    /// title, keyword and link key.
    public static func movePage(_ file: NoteFile, from: Int, to: Int) throws -> [UInt8] {
        let count = file.pages.count
        guard (0..<count).contains(from) else { throw NoteFormatError.badPage(from) }
        guard (0..<count).contains(to) else { throw NoteFormatError.badPage(to) }
        var order = Array(0..<count)
        order.insert(order.remove(at: from), at: to)
        // The new place of each old page, counted from 1 as the footer counts.
        var newNumber: [Int: Int] = [:]
        for (place, old) in order.enumerated() { newNumber[old + 1] = place + 1 }
        let addresses = try pageAddresses(file)
        var pairs: [Metadata.Pair] = []
        var pageWritten = false
        for pair in file.footer.pairs {
            if pageNumber(of: pair.key) != nil {
                // Every page pair is written once, in the new order, where the first one stood.
                guard !pageWritten else { continue }
                pageWritten = true
                pairs += order.enumerated().map {
                    Metadata.Pair(key: "PAGE\($0.offset + 1)", value: String(addresses[$0.element]))
                }
            } else if let (prefix, number) = pageKeyNumber(pair.key), let moved = newNumber[number] {
                let rest = pair.key.dropFirst(prefix.count + pageNumberDigits)
                let key = prefix + String(format: "%04d", moved) + rest
                pairs.append(Metadata.Pair(key: key, value: pair.value))
            } else {
                pairs.append(pair)
            }
        }
        return try withFooter(file, prefix: Array(file.bytes[..<footerAddress(file)]), pairs: pairs)
    }

    /// Draws a PNG or JPEG into the main layer of page `index` (from 0) at `rect`, over what is
    /// there. The picture is only pixels: no picture element is written, as that record is not
    /// decoded. The old blocks stay in the file; the page points at new ones.
    public static func drawPicture(
        _ file: NoteFile, page index: Int, imageData: Data, in rect: PageRect
    ) throws -> [UInt8] {
        let picture = try PageBitmap(imageData: imageData).scaled(to: rect)
        return try replaceMainLayer(file, page: index) { pixels, width in
            for row in 0..<rect.height {
                for column in 0..<rect.width {
                    let (x, y) = (rect.x + column, rect.y + row)
                    guard x >= 0, y >= 0, x < width, y < pixels.count / width else { continue }
                    pixels[y * width + x] = picture.pixels[row * rect.width + column]
                }
            }
        }
    }

    /// Draws one line of black text into the main layer of page `index` (from 0) at `rect`, with
    /// the system font at `fontSize` pixels. No text box element is written.
    /// shortcut: one line, no wrap; wrap when the editor needs a text box wider than a line.
    public static func drawText(
        _ file: NoteFile, page index: Int, text: String, in rect: PageRect, fontSize: Double
    ) throws -> [UInt8] {
        let coverage = textCoverage(text, width: rect.width, height: rect.height, fontSize: fontSize)
        return try replaceMainLayer(file, page: index) { pixels, width in
            for row in 0..<rect.height {
                for column in 0..<rect.width where coverage[row * rect.width + column] >= halfCoverage {
                    let (x, y) = (rect.x + column, rect.y + row)
                    guard x >= 0, y >= 0, x < width, y < pixels.count / width else { continue }
                    pixels[y * width + x] = RattaRLE.Grey.black
                }
            }
        }
    }

    static let halfCoverage: UInt8 = 128

    // MARK: - Blocks

    static func footerAddress(_ file: NoteFile) -> Int {
        NoteFile.word(file.bytes, at: file.bytes.count - NoteFile.wordSize)
    }

    /// The page block addresses, page 1 first, as the reader ordered them.
    static func pageAddresses(_ file: NoteFile) throws -> [Int] {
        let numbered = file.footer.pairs.compactMap { pair -> (Int, Int)? in
            guard let number = pageNumber(of: pair.key), let address = Int(pair.value) else { return nil }
            return (number, address)
        }
        return numbered.sorted { $0.0 < $1.0 }.map(\.1)
    }

    static func pageNumber(of key: String) -> Int? {
        key.hasPrefix("PAGE") ? Int(key.dropFirst(4)) : nil
    }

    static func pageKeyNumber(_ key: String) -> (String, Int)? {
        for prefix in pageKeyPrefixes where key.hasPrefix(prefix) {
            let digits = key.dropFirst(prefix.count).prefix(pageNumberDigits)
            if digits.count == pageNumberDigits, let number = Int(digits) { return (prefix, number) }
        }
        return nil
    }

    static func lengthPrefixed(_ content: [UInt8]) -> [UInt8] {
        (0..<NoteFile.wordSize).map { UInt8((content.count >> (8 * $0)) & 0xff) } + content
    }

    static func word(_ value: Int) -> [UInt8] {
        (0..<NoteFile.wordSize).map { UInt8((value >> (8 * $0)) & 0xff) }
    }

    static func text(_ pairs: [Metadata.Pair]) -> [UInt8] {
        Array(pairs.map { "<\($0.key):\($0.value)>" }.joined().utf8)
    }

    /// `prefix`, then the footer block, `tail` and the footer's address.
    static func withFooter(_ file: NoteFile, prefix: [UInt8], pairs: [Metadata.Pair]) throws -> [UInt8] {
        let address = prefix.count
        let out = prefix + lengthPrefixed(text(pairs)) + tailMarker + word(address)
        _ = try NoteFile(bytes: out)
        return out
    }

    /// The raw text of a metadata block with one `<KEY:old>` token's value replaced.
    static func replacing(_ key: String, with value: Int, inBlockAt address: Int, of file: NoteFile) throws -> [UInt8] {
        let raw = String(decoding: try file.block(at: address), as: UTF8.self)
        let pattern = "<\(key):"
        guard let start = raw.range(of: pattern),
              let end = raw[start.upperBound...].firstIndex(of: ">")
        else { throw NoteFormatError.badFooter("block \(address) has no \(key)") }
        return Array((raw[..<start.upperBound] + String(value) + raw[end...]).utf8)
    }

    /// Decodes page `index`'s main layer, lets `edit` change its pixels, and appends the new
    /// bitmap, the layer and page blocks that point at it, and a footer pointing at the new page.
    static func replaceMainLayer(
        _ file: NoteFile, page index: Int, edit: (inout [UInt8], Int) -> Void
    ) throws -> [UInt8] {
        guard file.pages.indices.contains(index) else { throw NoteFormatError.badPage(index) }
        let page = file.pages[index]
        guard let layer = page.layers.first(where: { $0.name == NoteFile.mainLayer }),
              let layerAddress = page.metadata.address(layer.key)
        else { throw NoteFormatError.unknownProtocol("a page without a main layer") }
        let (portraitWidth, portraitHeight) = file.pageSize
        let (width, height) = page.isHorizontal
            ? (portraitHeight, portraitWidth) : (portraitWidth, portraitHeight)
        var pixels = layer.bitmapAddress == 0
            ? [UInt8](repeating: RattaRLE.Grey.transparent, count: width * height)
            : try file.layerPixels(layer, of: page, width: width, height: height)
        edit(&pixels, width)

        var out = Array(file.bytes[..<footerAddress(file)])
        let bitmapAddress = out.count
        out += lengthPrefixed(RattaRLE.encode(pixels, greyscale: file.storesGreyscale))
        let newLayerAddress = out.count
        out += lengthPrefixed(try replacing("LAYERBITMAP", with: bitmapAddress, inBlockAt: layerAddress, of: file))
        let pageAddress = try pageAddresses(file)[index]
        let newPageAddress = out.count
        out += lengthPrefixed(try replacing(layer.key, with: newLayerAddress, inBlockAt: pageAddress, of: file))
        let pairs = file.footer.pairs.map { pair in
            pageNumber(of: pair.key) == index + 1
                ? Metadata.Pair(key: pair.key, value: String(newPageAddress)) : pair
        }
        return try withFooter(file, prefix: out, pairs: pairs)
    }

    /// How much of each pixel `text` covers, 0 to 255, one line from the top left of a
    /// `width * height` box.
    static func textCoverage(_ text: String, width: Int, height: Int, fontSize: Double) -> [UInt8] {
        var coverage = [UInt8](repeating: 0, count: width * height)
        coverage.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return }
            context.setFillColor(gray: 1, alpha: 1)
            let font = CTFontCreateUIFontForLanguage(.system, fontSize, nil)
                ?? CTFontCreateWithName("Helvetica" as CFString, fontSize, nil)
            let attributes = [kCTFontAttributeName: font as Any, kCTForegroundColorFromContextAttributeName: true]
            let line = CTLineCreateWithAttributedString(
                NSAttributedString(string: text, attributes: attributes as [NSAttributedString.Key: Any]))
            // CoreGraphics counts y from the bottom: the baseline sits one ascent below the top.
            context.textPosition = CGPoint(x: 0, y: Double(height) - CTFontGetAscent(font))
            CTLineDraw(line, context)
        }
        return coverage
    }
}

extension PageBitmap {
    /// This picture drawn into `rect`'s size, on white, as grey bytes.
    func scaled(to rect: PageRect) throws -> PageBitmap {
        guard let image = cgImage() else { throw NoteFormatError.badPicture("the inserted picture") }
        var pixels = [UInt8](repeating: RattaRLE.Grey.white, count: rect.width * rect.height)
        pixels.withUnsafeMutableBytes { buffer in
            let context = CGContext(
                data: buffer.baseAddress, width: rect.width, height: rect.height, bitsPerComponent: 8,
                bytesPerRow: rect.width, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue)
            context?.interpolationQuality = .high
            context?.draw(image, in: CGRect(x: 0, y: 0, width: rect.width, height: rect.height))
        }
        return PageBitmap(width: rect.width, height: rect.height, pixels: pixels)
    }
}
