import CoreGraphics
import Foundation
import InkNotebookEditorKit
import NoteFormat

/// A selection lifted off its page, for drawing a move at once (#325): the page's own ink under
/// the selection, and the template that shows where it was. Drawing only, never written: the
/// tablet moves the elements, and the pulled copy replaces this drawing.
nonisolated struct LiftedInk: @unchecked Sendable {
    /// The part of the page the selection covers, in page pixels.
    let frame: CGRect
    /// The selection's ink, see-through elsewhere.
    let ink: CGImage
    /// The page's template where the selection was, see-through elsewhere.
    let hole: CGImage

    /// The ink a stroke's path is drawn with when its box gives no width, in page pixels.
    static let thinnestStroke: CGFloat = 4
    /// Room around a stroke's path for anti-aliasing, in page pixels.
    static let edge: CGFloat = 3

    /// Lifts `items` off page `index` of `note`; nil when the page cannot be drawn.
    /// shortcut: a stroke's mask is its path at the width its box leaves around it, so a neighbour's
    /// ink within that width lifts too; it shows only until the tablet's copy comes back.
    @concurrent
    static func make(_ note: NoteFile, page index: Int, items: [Selectable]) async -> LiftedInk? {
        guard let drawn = try? note.render(page: index), let template = try? note.render(page: index, ink: false)
        else { return nil }
        let page = CGRect(x: 0, y: 0, width: drawn.width, height: drawn.height)
        let frame = items.map { $0.bounds.insetBy(dx: -edge, dy: -edge) }.reduce(CGRect.null) { $0.union($1) }
            .intersection(page).integral
        guard !frame.isEmpty, let mask = mask(items, frame: frame) else { return nil }
        guard let ink = cut(drawn, mask: mask, frame: frame), let hole = cut(template, mask: mask, frame: frame)
        else { return nil }
        return LiftedInk(frame: frame, ink: ink, hole: hole)
    }

    /// One byte per pixel of `frame`, 255 where the selection is: each stroke's path stroked at
    /// its ink width, each picture's and text box's frame filled.
    static func mask(_ items: [Selectable], frame: CGRect) -> [UInt8]? {
        let width = Int(frame.width)
        let height = Int(frame.height)
        var bytes = [UInt8](repeating: 0, count: width * height)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return false }
            // Page pixels count down from the top; the context counts up from the bottom.
            context.translateBy(x: -frame.minX, y: CGFloat(height) + frame.minY)
            context.scaleBy(x: 1, y: -1)
            context.setFillColor(gray: 1, alpha: 1)
            context.setStrokeColor(gray: 1, alpha: 1)
            context.setLineCap(.round)
            context.setLineJoin(.round)
            for item in items {
                if item.isArea || item.points.count < 2 {
                    // A frame's own border may stand a pixel or two outside its corners.
                    context.fill(item.bounds.insetBy(dx: -edge, dy: -edge))
                    continue
                }
                let path = CGMutablePath()
                path.addLines(between: item.points)
                let spread = min(
                    item.bounds.width - path.boundingBox.width, item.bounds.height - path.boundingBox.height)
                context.setLineWidth(max(spread, thinnestStroke) + 2 * edge)
                context.addPath(path)
                context.strokePath()
            }
            return true
        }
        return drawn ? bytes : nil
    }

    /// The grey pixels of `bitmap` inside `frame`, see-through where `mask` is 0.
    static func cut(_ bitmap: PageBitmap, mask: [UInt8], frame: CGRect) -> CGImage? {
        let width = Int(frame.width)
        let height = Int(frame.height)
        var pairs = [UInt8](repeating: 0, count: width * height * 2)
        for row in 0..<height {
            let source = (Int(frame.minY) + row) * bitmap.width + Int(frame.minX)
            for column in 0..<width {
                let alpha = mask[row * width + column]
                let grey = bitmap.pixels[source + column]
                // Premultiplied: the grey scaled by its coverage.
                pairs[2 * (row * width + column)] = UInt8(Int(grey) * Int(alpha) / Int(UInt8.max))
                pairs[2 * (row * width + column) + 1] = alpha
            }
        }
        guard let provider = CGDataProvider(data: Data(pairs) as CFData) else { return nil }
        return CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 16, bytesPerRow: width * 2,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider,
            decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
