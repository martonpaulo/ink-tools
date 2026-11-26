// What a click, a rectangle or a lasso selects on a page, and the selection it builds (#324).
// Read-only: a selection names elements; the edits built on it come later.
import CoreGraphics

/// One element a selection can hold, in page pixels.
public struct Selectable: Sendable, Equatable {
    public let id: Int
    /// The element's box: a stroke's ink, a picture's or a text box's frame.
    public let bounds: CGRect
    /// The path a stroke follows; an area's corners.
    public let points: [CGPoint]
    /// A picture or a text box, hit anywhere inside its frame; a stroke is hit along its path.
    public let isArea: Bool
    /// A picture: a copy keeps its own greys, its paper too (#323).
    public let isPicture: Bool

    public init(id: Int, bounds: CGRect, points: [CGPoint], isArea: Bool, isPicture: Bool = false) {
        self.id = id
        self.bounds = bounds
        self.points = points
        self.isArea = isArea
        self.isPicture = isPicture
    }

    /// The points a rectangle or a lasso must hold to select it: an area's four corners, a
    /// stroke's path.
    var outline: [CGPoint] {
        guard isArea else { return points.isEmpty ? [CGPoint(x: bounds.midX, y: bounds.midY)] : points }
        return [
            CGPoint(x: bounds.minX, y: bounds.minY), CGPoint(x: bounds.maxX, y: bounds.minY),
            CGPoint(x: bounds.maxX, y: bounds.maxY), CGPoint(x: bounds.minX, y: bounds.maxY),
        ]
    }
}

/// Which elements a pointer selects. An element is selected by a rectangle or a lasso only when
/// it lies wholly inside, as the tablet's own lasso does; a click takes the topmost element, the
/// last one the page stores.
public enum HitTest {
    /// The topmost element under `point`: an area holding it inside its frame, or a stroke whose
    /// path passes within `tolerance`; `nil` on empty paper.
    public static func click(_ point: CGPoint, in items: [Selectable], tolerance: CGFloat) -> Int? {
        items.last { item in
            guard item.bounds.insetBy(dx: -tolerance, dy: -tolerance).contains(point) else { return false }
            if item.isArea { return item.bounds.contains(point) }
            return distance(from: point, to: item.points) <= tolerance
        }?.id
    }

    /// The elements wholly inside `rect`.
    public static func rectangle(_ rect: CGRect, in items: [Selectable]) -> Set<Int> {
        Set(items.filter { item in item.outline.allSatisfy(rect.contains) }.map(\.id))
    }

    /// The fewest points of a lasso that enclose anything.
    static let fewestCorners = 3

    /// The elements wholly inside the closed path `polygon`; fewer than three points hold nothing.
    public static func lasso(_ polygon: [CGPoint], in items: [Selectable]) -> Set<Int> {
        guard polygon.count >= fewestCorners else { return [] }
        return Set(items.filter { item in item.outline.allSatisfy { contains(polygon, $0) } }.map(\.id))
    }

    /// Whether `point` is inside `polygon`, by the even-odd rule.
    static func contains(_ polygon: [CGPoint], _ point: CGPoint) -> Bool {
        var inside = false
        var previous = polygon[polygon.count - 1]
        for current in polygon {
            if (current.y > point.y) != (previous.y > point.y) {
                let crossing = (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x
                if point.x < crossing { inside.toggle() }
            }
            previous = current
        }
        return inside
    }

    /// The shortest distance from `point` to the path through `points`.
    static func distance(from point: CGPoint, to points: [CGPoint]) -> CGFloat {
        guard let first = points.first else { return .infinity }
        guard points.count > 1 else { return hypot(point.x - first.x, point.y - first.y) }
        return zip(points, points.dropFirst()).map { segment(point, $0, $1) }.min() ?? .infinity
    }

    static func segment(_ point: CGPoint, _ start: CGPoint, _ end: CGPoint) -> CGFloat {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let lengthSquared = dx * dx + dy * dy
        let share =
            lengthSquared == 0
            ? 0 : min(max(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0), 1)
        return hypot(point.x - (start.x + share * dx), point.y - (start.y + share * dy))
    }
}

/// The elements selected on one page. A selection lives on one page: starting one on another page
/// replaces it.
public struct PageSelection: Sendable, Equatable {
    public private(set) var page: Int?
    public private(set) var ids: Set<Int> = []

    public init() {}

    public var isEmpty: Bool { ids.isEmpty }

    /// A click on `id`, or on empty paper when `nil`: it selects that element alone; with Shift
    /// (`adding`) it adds the element or removes it when selected. Empty paper clears, unless with
    /// Shift.
    public mutating func click(_ id: Int?, page: Int, adding: Bool) {
        let keep = adding && self.page == page
        guard let id else {
            if !keep { clear() }
            return
        }
        if keep {
            if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        } else {
            ids = [id]
        }
        self.page = ids.isEmpty ? nil : page
    }

    /// What a rectangle or a lasso held: it replaces the selection, or with Shift adds to it.
    public mutating func take(_ found: Set<Int>, page: Int, adding: Bool) {
        ids = adding && self.page == page ? ids.union(found) : found
        self.page = ids.isEmpty ? nil : page
    }

    /// Select All: every element of `page`.
    public mutating func selectAll(_ all: Set<Int>, page: Int) {
        take(all, page: page, adding: false)
    }

    public mutating func clear() {
        ids = []
        page = nil
    }
}
