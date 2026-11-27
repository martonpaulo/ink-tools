// How large a notebook window draws its pages (#319): Zoom to Fit, Zoom to Width, or a
// magnification, as Preview's View menu offers them.
import CoreGraphics

/// The zoom of a notebook window. A magnification of 1 is Actual Size: one page pixel per display
/// pixel, so the raster shows unresampled. The fit zooms fit each page by its own aspect, so a
/// landscape page among portrait ones fits as they do (#291).
public enum PageZoom: Sendable, Hashable {
    case fitPage
    case fitWidth
    case magnification(Double)

    /// The magnifications Zoom In and Zoom Out step through; the first and last are the limits a
    /// pinch stops at too. At the smallest, a few pages show at once, so the pages in view stay drawn.
    public static let steps: [Double] = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]

    /// The page's drawn size in whole points, for a page of `page` pixels in a `viewport` of points
    /// on a display of `scale`. A page or viewport with no area gives `.zero`.
    public func size(of page: CGSize, in viewport: CGSize, scale: CGFloat) -> CGSize {
        guard page.width > 0, page.height > 0 else { return .zero }
        switch self {
        case .fitPage:
            return PageFit.fitted(page: page, in: viewport)
        case .fitWidth:
            guard viewport.width > 0 else { return .zero }
            return PageFit.fitted(page: page, in: CGSize(width: viewport.width, height: .greatestFiniteMagnitude))
        case .magnification(let value):
            let factor = value / max(scale, 1)
            return CGSize(
                width: max((page.width * factor).rounded(.down), 1),
                height: max((page.height * factor).rounded(.down), 1))
        }
    }

    /// The magnification this zoom shows `page` at, 1 being Actual Size.
    public func magnification(of page: CGSize, in viewport: CGSize, scale: CGFloat) -> Double {
        if case .magnification(let value) = self { return value }
        guard page.width > 0 else { return 1 }
        return size(of: page, in: viewport, scale: scale).width * max(scale, 1) / page.width
    }

    /// The next step past the shown magnification, or `nil` at the largest.
    public func zoomedIn(page: CGSize, viewport: CGSize, scale: CGFloat) -> Self? {
        let shown = magnification(of: page, in: viewport, scale: scale)
        return Self.steps.first { $0 > shown + Self.tolerance }.map(Self.magnification)
    }

    /// The step before the shown magnification, or `nil` at the smallest.
    public func zoomedOut(page: CGSize, viewport: CGSize, scale: CGFloat) -> Self? {
        let shown = magnification(of: page, in: viewport, scale: scale)
        return Self.steps.last { $0 < shown - Self.tolerance }.map(Self.magnification)
    }

    /// A pinch of `factor` from the magnification `base` it started at, kept within the steps' ends.
    public static func pinched(from base: Double, by factor: Double) -> Self {
        let lowest = steps[0]
        let highest = steps[steps.count - 1]
        return .magnification(min(max(base * factor, lowest), highest))
    }

    /// A rounded magnification counts as its step: 0.329 shown is the step 0.33, not below it.
    static let tolerance = 0.004
}
