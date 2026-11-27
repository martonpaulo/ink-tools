// Only Manta tones (owner, 2026-11-26): an inserted picture is rounded to the screen's 16 greys
// before the Mac draws it or sends it (#264), so the Mac shows it as the tablet will
// (docs/supernote.md › Greys and colours).
import CoreGraphics
import Foundation

public enum MantaGreys {
    /// The screen's 16 greys, black to white, evenly spaced.
    public static let levels: [UInt8] = (0..<16).map { UInt8($0 * 17) }

    /// The weight of red, green and blue in a grey: Rec. 709 luma.
    static let lumaWeights = [0.2126, 0.7152, 0.0722]

    /// The bytes of one RGBA pixel, and where its alpha is.
    public enum Channel {
        public static let count = 4
        public static let alpha = 3
    }

    /// The nearest of the 16 greys.
    public static func nearest(_ grey: Int) -> UInt8 {
        let step = Int(levels[1])
        return UInt8(min(max((grey + step / 2) / step, 0), levels.count - 1) * step)
    }

    /// One grey per pixel of RGBA bytes (8 bits each, not premultiplied): the Rec. 709 luma laid on
    /// white by its alpha, rounded to the nearest of the 16 greys.
    public static func greys(rgba: [UInt8]) -> [UInt8] {
        stride(from: 0, to: rgba.count - Channel.alpha, by: Channel.count).map { index in
            let luma = zip(lumaWeights, rgba[index..<(index + Channel.alpha)]).map { $0 * Double($1) }.reduce(0, +)
            let alpha = Double(rgba[index + Channel.alpha]) / Double(UInt8.max)
            let onWhite = luma * alpha + Double(UInt8.max) * (1 - alpha)
            return nearest(Int(onWhite.rounded()))
        }
    }
}

/// Where an inserted picture lands on a page, in page pixels.
public enum PicturePlacement {
    /// The widest a placed picture starts, as a share of the page's width.
    public static let widestShare = 0.5

    /// The box of a picture of `pixels` centred on `point` on a page of `page` pixels: at most half
    /// the page's width, its aspect kept, and inside the page.
    public static func box(pixels: CGSize, centredOn point: CGPoint, page: CGSize, width: CGFloat? = nil) -> EditRect {
        guard pixels.width > 0, pixels.height > 0 else { return EditRect(left: 0, top: 0, right: 0, bottom: 0) }
        let wanted = width ?? min(pixels.width, page.width * widestShare)
        let scale = min(wanted / pixels.width, page.width / pixels.width, page.height / pixels.height)
        let size = CGSize(width: (pixels.width * scale).rounded(), height: (pixels.height * scale).rounded())
        let left = min(max(point.x - size.width / 2, 0), page.width - size.width)
        let top = min(max(point.y - size.height / 2, 0), page.height - size.height)
        return EditRect(CGRect(origin: CGPoint(x: left.rounded(), y: top.rounded()), size: size))
    }
}

/// Where a typed text box lands, in page pixels.
public enum TextBoxPlacement {
    /// A text box's width, as a share of the page's width.
    public static let widthShare = 0.6
    /// A line's height, as a share of the font size.
    public static let lineShare = 1.5

    /// The box of `lines` lines at `fontSize` centred on `point`, inside a page of `page` pixels.
    public static func box(lines: Int, fontSize: Int, centredOn point: CGPoint, page: CGSize) -> EditRect {
        let size = CGSize(
            width: (page.width * widthShare).rounded(),
            height: min((Double(max(lines, 1) * fontSize) * lineShare).rounded(), page.height))
        let left = min(max(point.x - size.width / 2, 0), page.width - size.width)
        let top = min(max(point.y - size.height / 2, 0), page.height - size.height)
        return EditRect(CGRect(origin: CGPoint(x: left.rounded(), y: top.rounded()), size: size))
    }

    /// The box of an edited text box (#264): its place and width kept, its height that of `lines`
    /// lines at `fontSize`, as a new box's, moved up only when it would pass the page's bottom.
    public static func box(editing box: EditRect, lines: Int, fontSize: Int, page: CGSize) -> EditRect {
        let pageHeight = Int(page.height)
        let height = min(Int((Double(max(lines, 1) * fontSize) * lineShare).rounded()), pageHeight)
        let top = min(max(box.top, 0), pageHeight - height)
        return EditRect(left: box.left, top: top, right: box.right, bottom: top + height)
    }
}
