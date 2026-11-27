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

    /// The size a notebook window opens at, as Preview opens a PDF (#291): `portrait` for a
    /// portrait first page; for a landscape one, `portrait`'s height and as wide as the page needs
    /// beside the page list (`sidebar`) with `margin` around it, so the page fills the window with
    /// no blank band. Rounded up to whole points, so the page is never a point narrower.
    public static func window(firstPage page: CGSize, sidebar: CGFloat, margin: CGFloat, portrait: CGSize) -> CGSize {
        guard page.width > page.height, page.height > 0 else { return portrait }
        let pageHeight = max(portrait.height - 2 * margin, 1)
        let width = sidebar + 2 * margin + pageHeight * page.width / page.height
        return CGSize(width: width.rounded(.up), height: portrait.height)
    }

    /// `size`, shrunk with its aspect kept when it is larger than `screen`, the display's visible
    /// area, so a window never opens past the screen's edge.
    public static func onScreen(_ size: CGSize, screen: CGSize) -> CGSize {
        guard size.width > screen.width || size.height > screen.height else { return size }
        return fitted(page: size, in: screen)
    }
}
