// What a page change would hide (#337): an element is hidden when its box was on the page and
// leaves the page the change gives, as Goodnotes warns before a page size change. A box already
// off the page is not the change's doing, so it never raises the warning. Shared with the
// orientation turn (#341).

/// One page a change reaches: its element boxes, the size it has and the size the change gives,
/// in page pixels.
public struct PageChange: Sendable, Equatable {
    /// The page, from 0.
    public let page: Int
    /// Each element's box, in the page's element order.
    public let boxes: [EditRect]
    public let width: Int
    public let height: Int
    public let newWidth: Int
    public let newHeight: Int

    public init(page: Int, boxes: [EditRect], width: Int, height: Int, newWidth: Int, newHeight: Int) {
        self.page = page
        self.boxes = boxes
        self.width = width
        self.height = height
        self.newWidth = newWidth
        self.newHeight = newHeight
    }
}

public enum HiddenContent {
    /// The elements, by their numbers on the page from 1, that are on a page of `width` by
    /// `height` and not on one of `newWidth` by `newHeight`. A box on the edge is on the page.
    public static func elements(
        _ boxes: [EditRect], width: Int, height: Int, newWidth: Int, newHeight: Int
    ) -> [Int] {
        boxes.enumerated().compactMap { index, box in
            fits(box, width, height) && !fits(box, newWidth, newHeight) ? index + 1 : nil
        }
    }

    /// The pages, from 0 and in order, where the change hides at least one element.
    public static func pages(_ changes: [PageChange]) -> [Int] {
        changes.filter { change in
            !elements(
                change.boxes, width: change.width, height: change.height, newWidth: change.newWidth,
                newHeight: change.newHeight
            ).isEmpty
        }.map(\.page).sorted()
    }

    static func fits(_ box: EditRect, _ width: Int, _ height: Int) -> Bool {
        box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height
    }
}
