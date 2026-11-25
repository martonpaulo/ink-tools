// The layer composition is ported from supernote-tool (supernotelib/converter.py
// `ImageConverter`, commit c1019f1), Copyright (c) 2020 jya, Apache License 2.0; see
// ../../../NOTICE.md (#261).
import CoreGraphics
import Foundation
import ImageIO

/// A page template whose stored background the reader could not draw: its `PAGESTYLE` and why.
/// The page is drawn without it, and the caller shows a marker and logs the style (#308).
public struct TemplateFailure: Sendable, Equatable {
    public let style: String
    public let reason: NoteFormatError
}

/// A page drawn as one grey byte per pixel, 0 black to 255 white.
public struct PageBitmap: Sendable, Equatable {
    public let width: Int
    public let height: Int
    public let pixels: [UInt8]
    /// Set when the page's template could not be drawn under the other layers.
    public let templateFailure: TemplateFailure?

    public init(width: Int, height: Int, pixels: [UInt8], templateFailure: TemplateFailure? = nil) {
        self.width = width
        self.height = height
        self.pixels = pixels
        self.templateFailure = templateFailure
    }

    /// Reads a PNG or JPEG into grey pixels, on white where it is transparent.
    public init(imageData: Data) throws {
        guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { throw NoteFormatError.badPicture("the given image") }
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 255, count: width * height)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return false }
            context.setFillColor(gray: 1, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { throw NoteFormatError.badPicture("the given image") }
        self.init(width: width, height: height, pixels: pixels)
    }

    /// The page as a grey CGImage.
    public func cgImage() -> CGImage? {
        guard let provider = CGDataProvider(data: Data(pixels) as CFData) else { return nil }
        return CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8,
            bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue), provider: provider,
            decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }

    /// The page as PNG bytes.
    public func pngData() -> Data? {
        guard let image = cgImage() else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output as CFMutableData, "public.png" as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        return CGImageDestinationFinalize(destination) ? output as Data : nil
    }

    /// The share of pixels, 0 to 1, whose grey differs from `other` by more than `threshold`.
    /// Nil when the sizes differ.
    public func differingShare(from other: PageBitmap, threshold: Int) -> Double? {
        guard width == other.width, height == other.height, !pixels.isEmpty else { return nil }
        let differing = zip(pixels, other.pixels).reduce(0) {
            abs(Int($1.0) - Int($1.1)) > threshold ? $0 + 1 : $0
        }
        return Double(differing) / Double(pixels.count)
    }
}

extension NoteFile {
    static let rleEncoding = "RATTA_RLE"
    static let backgroundLayer = "BGLAYER"
    static let mainLayer = "MAINLAYER"
    static let whiteStyle = "style_white"
    static let customStylePrefix = "user_"
    /// The size of the stored background of a blank `style_white` page (supernotelib
    /// `SPECIAL_WHITE_STYLE_BLOCK_SIZE`), whose long runs are short.
    static let blankWhiteBlockSize = 0x140e

    /// Draws page `index`, counted from 0: the shown layers in `LAYERSEQ` order over the
    /// background, on white. A background that cannot be decoded leaves the ink drawn and sets
    /// `templateFailure`; any other layer that cannot be decoded fails the page.
    public func render(page index: Int) throws -> PageBitmap {
        guard pages.indices.contains(index) else { throw NoteFormatError.badPage(index) }
        let page = pages[index]
        guard !page.layers.isEmpty else {
            throw NoteFormatError.unknownProtocol("a page without layers (\(page.metadata["PROTOCOL"] ?? "none"))")
        }
        let (portraitWidth, portraitHeight) = pageSize
        let (width, height) = page.isHorizontal
            ? (portraitHeight, portraitWidth) : (portraitWidth, portraitHeight)
        var canvas = [UInt8](repeating: RattaRLE.Grey.transparent, count: width * height)
        let visibility = page.visibility
        var templateFailure: TemplateFailure?

        for name in page.layerOrder.reversed() {
            // supernotelib `_get_layer_visibility`: with LAYERINFO, a layer it does not name is
            // hidden, except MAINLAYER. Without LAYERINFO every layer is shown.
            let shown = visibility.isEmpty || (visibility[name] ?? (name == Self.mainLayer))
            guard shown, let layer = page.layers.first(where: { $0.name == name }),
                  layer.bitmapAddress != 0
            else { continue }
            let pixels: [UInt8]
            do {
                pixels = try layerPixels(layer, of: page, width: width, height: height)
            } catch let error as NoteFormatError where name == Self.backgroundLayer {
                templateFailure = TemplateFailure(style: page.style ?? "none", reason: error)
                continue
            }
            // What no layer covers stays `Grey.transparent`, 255, the white of the page.
            for offset in 0..<canvas.count where pixels[offset] != RattaRLE.Grey.transparent {
                canvas[offset] = pixels[offset]
            }
        }
        return PageBitmap(width: width, height: height, pixels: canvas, templateFailure: templateFailure)
    }

    func layerPixels(_ layer: Layer, of page: Page, width: Int, height: Int) throws -> [UInt8] {
        let data = try block(at: layer.bitmapAddress)
        let isBackground = layer.name == Self.backgroundLayer
        if isBackground, page.style?.hasPrefix(Self.customStylePrefix) == true {
            let picture = try PageBitmap(imageData: Data(data))
            guard picture.width == width, picture.height == height else {
                throw NoteFormatError.badPicture(layer.name)
            }
            return picture.pixels
        }
        guard layer.encoding == Self.rleEncoding else {
            throw NoteFormatError.unknownProtocol(layer.encoding ?? "none")
        }
        let blankPage = isBackground && page.style == Self.whiteStyle
            && data.count == Self.blankWhiteBlockSize
        return try RattaRLE.decode(
            data, width: width, height: height, blankPage: blankPage, greyscale: storesGreyscale)
    }
}
