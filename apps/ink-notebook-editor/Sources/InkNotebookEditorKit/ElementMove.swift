// A selection moved on its page (#325): by a drag or a run of arrow keys. Our own model: the
// tablet's `modifyElements` places each element at its moved box, through the write path.
import CoreGraphics
import Foundation

/// One element of a move: its place in the page's element block, its box and its path before the
/// move (a picture's or a text box's corners), so the Mac can draw it lifted off the page.
public struct MovedElement: Sendable, Equatable {
    public let record: Int
    public let box: EditRect
    public let points: [CGPoint]
    public let isArea: Bool
    /// A picture: it moves, turns and flips as a new picture file (#326).
    public let isPicture: Bool

    public init(record: Int, box: EditRect, points: [CGPoint] = [], isArea: Bool = true, isPicture: Bool = false) {
        self.record = record
        self.box = box
        self.points = points
        self.isArea = isArea
        self.isPicture = isPicture
    }

    /// The element as a selection names it, where the move started.
    public init(_ item: Selectable) {
        self.init(
            record: item.record, box: EditRect(item.bounds), points: item.points, isArea: item.isArea,
            isPicture: item.isPicture)
    }

    /// The element as the page shows it before the move, for drawing it lifted.
    public var selectable: Selectable {
        Selectable(
            id: record,
            bounds: CGRect(x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top),
            points: points, isArea: isArea, isPicture: isPicture, record: record)
    }

    public func moved(_ dx: Int, _ dy: Int) -> MovedElement {
        MovedElement(
            record: record, box: ElementMove.offset(box, dx, dy),
            points: points.map { CGPoint(x: $0.x + CGFloat(dx), y: $0.y + CGFloat(dy)) }, isArea: isArea,
            isPicture: isPicture)
    }
}

/// The elements of one page moved together by an offset in page pixels.
public struct ElementMove: Sendable, Equatable {
    public let page: Int
    public let elements: [MovedElement]
    public let dx: Int
    public let dy: Int

    public init(page: Int, elements: [MovedElement], dx: Int, dy: Int) {
        self.page = page
        self.elements = elements
        self.dx = dx
        self.dy = dy
    }

    /// The selection's box before the move.
    public var frame: EditRect {
        EditRect(
            left: elements.map(\.box.left).min() ?? 0, top: elements.map(\.box.top).min() ?? 0,
            right: elements.map(\.box.right).max() ?? 0, bottom: elements.map(\.box.bottom).max() ?? 0)
    }

    /// The same elements moved by `dx`, `dy` more, as one more nudge of a run.
    public func by(dx: Int, dy: Int) -> ElementMove {
        ElementMove(page: page, elements: elements, dx: self.dx + dx, dy: self.dy + dy)
    }

    /// The move kept on a page of `width` by `height` pixels: the selection stops at each edge.
    /// A selection wider than the page stays where it is on that axis.
    public func clamped(width: Int, height: Int) -> ElementMove {
        let box = frame
        let x = min(max(dx, -box.left), max(width - box.right, -box.left))
        let y = min(max(dy, -box.top), max(height - box.bottom, -box.top))
        return ElementMove(page: page, elements: elements, dx: x, dy: y)
    }

    /// Each element's new box, by the tablet's element number, from 1.
    public var placements: [ElementPlacement] {
        elements.map { ElementPlacement(number: $0.record + 1, rect: Self.offset($0.box, dx, dy)) }
    }

    /// The move back: the same elements from their new boxes by the opposite offset.
    public var inverse: ElementMove {
        ElementMove(page: page, elements: elements.map { $0.moved(dx, dy) }, dx: -dx, dy: -dy)
    }

    public var isEmpty: Bool { (dx == 0 && dy == 0) || elements.isEmpty }

    static func offset(_ box: EditRect, _ dx: Int, _ dy: Int) -> EditRect {
        EditRect(left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy)
    }

    /// The points of one nudge, as Preview nudges: 1 point, or 10 with Shift.
    static let shiftNudge = 10

    /// One nudge in page pixels at a magnification (1 being Actual Size) on a display of `scale`.
    public static func nudge(magnification: Double, scale: CGFloat, shift: Bool) -> Int {
        let perPoint = max(Int((Double(scale) / max(magnification, .ulpOfOne)).rounded()), 1)
        return perPoint * (shift ? shiftNudge : 1)
    }
}

extension EditRect {
    /// A box in page pixels, rounded out to whole pixels.
    public init(_ rect: CGRect) {
        self.init(
            left: Int(rect.minX.rounded(.down)), top: Int(rect.minY.rounded(.down)),
            right: Int(rect.maxX.rounded(.up)), bottom: Int(rect.maxY.rounded(.up)))
    }
}
