// The size a page's raster is drawn at, for the thumbnails of the page list (#262), on the rule of
// swift-apps.md › Runtime images: never a constant scale, and a fit size rounded down.
import CoreGraphics

public enum PageFit {
    /// The largest size with the page's aspect that fits in `box`, in whole points, rounded down
    /// so it never spills the box. A page or box with no area gives `.zero`.
    public static func fitted(page: CGSize, in box: CGSize) -> CGSize {
        guard page.width > 0, page.height > 0, box.width > 0, box.height > 0 else { return .zero }
        let factor = min(box.width / page.width, box.height / page.height)
        return CGSize(
            width: max((page.width * factor).rounded(.down), 1),
            height: max((page.height * factor).rounded(.down), 1))
    }

    /// The raster in pixels for an image drawn at `points` on a display of `scale`, so the drawn
    /// size is the raster's point size: pixels ÷ scale.
    public static func pixels(for points: CGSize, scale: CGFloat) -> (width: Int, height: Int) {
        let scale = max(scale, 1)
        return (Int((points.width * scale).rounded(.down)), Int((points.height * scale).rounded(.down)))
    }
}
