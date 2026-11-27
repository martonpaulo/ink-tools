// Where a point of the continuous scroll falls among its pages, so a zoom keeps the place being
// read (#319).
import CoreGraphics

/// The pages of the continuous scroll, one below the other: each page's height in points, with a
/// `margin` between two pages and half a margin before the first and after the last, on top of
/// the half margin each page carries above and below it.
public struct PageStack: Sendable, Equatable {
    public let heights: [CGFloat]
    public let margin: CGFloat

    public init(heights: [CGFloat], margin: CGFloat) {
        self.heights = heights
        self.margin = margin
    }

    /// The content offset of page `index`'s top edge.
    public func top(of index: Int) -> CGFloat {
        let before = heights.prefix(max(min(index, heights.count), 0)).reduce(0) { $0 + $1 + margin }
        return margin + before
    }

    /// A content offset as a page and the fraction of its height, 0 its top and 1 its bottom; an
    /// offset in a margin counts as the nearest edge of the page below it, or of the last page.
    public func place(at y: CGFloat) -> (page: Int, fraction: CGFloat)? {
        guard !heights.isEmpty else { return nil }
        for (index, height) in heights.enumerated() where y < top(of: index) + height + margin / 2 {
            guard height > 0 else { return (index, 0) }
            return (index, min(max((y - top(of: index)) / height, 0), 1))
        }
        return (heights.count - 1, 1)
    }

    /// The content offset of a fraction of page `page`'s height.
    public func offset(of page: Int, fraction: CGFloat) -> CGFloat {
        guard heights.indices.contains(page) else { return 0 }
        return top(of: page) + heights[page] * fraction
    }

    /// The new content offset of the top of a scroll whose top was `y` in `self`, so the place
    /// `anchor` points below the view's top stays there in `zoomed`: the middle of the view for a
    /// menu zoom, the fingers for a pinch, as Preview zooms (#319).
    public func keeping(_ anchor: CGFloat, at y: CGFloat, in zoomed: PageStack) -> CGFloat {
        guard let place = place(at: y + anchor) else { return 0 }
        return max(zoomed.offset(of: place.page, fraction: place.fraction) - anchor, 0)
    }
}
