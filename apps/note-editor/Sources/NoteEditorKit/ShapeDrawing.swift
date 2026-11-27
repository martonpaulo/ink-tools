// The shapes Insert › Shape draws by drag (#350), as the tablet's own geometry elements (#463).
// Pure geometry in page pixels: the gesture and the drawing on screen live in the app.
import CoreGraphics
import Foundation

/// A shape of Insert › Shape, in the order Pages and Keynote list theirs.
public enum ShapeKind: String, CaseIterable, Sendable {
    case line, arrow, rectangle, roundedRectangle, ellipse, triangle, diamond

    /// Whether the shape runs from the drag's start to its end, rather than filling its box.
    public var isStroke: Bool { self == .line || self == .arrow }
}

/// The geometry of each shape from a drag on the page (#350).
public enum ShapeDrawing {
    /// One width for every shape, in page pixels.
    public static let lineWidth: CGFloat = 3
    /// The same width in the helper's pen units, 100 a pixel.
    public static let penWidth = Int(lineWidth * 100)
    /// The fewest page pixels a side of a shape's box has, so a flat drag still gives a shape.
    public static let minimumSide: CGFloat = 16
    /// A click's or Return's shape is this part of the page's width, as a square box.
    static let defaultParts: CGFloat = 5
    /// Points of each rounded corner's arc, so 4 corners stay under the helper's polygon limit.
    static let cornerArcPoints = 8
    /// A rounded corner's radius is this part of the box's shorter side.
    static let cornerParts: CGFloat = 8
    /// The arrow's barbs, from its shaft, in degrees, as Smart Pen's `arrowPoints` draws them.
    static let barbDegrees: CGFloat = 30
    /// The arrow's head, in page pixels: Smart Pen's `arrowHeadLength` for `penWidth`, at its 70 %.
    static let headLength: CGFloat = 24

    /// The shape a drag from `start` to `end` draws on a page of `page` pixels, both ends kept on
    /// the page. `constrained`, Shift, keeps a square box (a circle) or a line at a multiple of 45°.
    public static func shape(
        _ kind: ShapeKind, from start: CGPoint, to end: CGPoint, constrained: Bool, page: CGSize
    ) -> GeometryShape {
        let start = clamp(start, page: page)
        var end = clamp(end, page: page)
        if kind.isStroke {
            if constrained { end = clamp(snapped(end, from: start), page: page) }
            if hypot(end.x - start.x, end.y - start.y) < minimumSide {
                end = clamp(CGPoint(x: start.x + minimumSide, y: start.y), page: page)
                if end == start { end = CGPoint(x: start.x - minimumSide, y: start.y) }
            }
            return kind == .line ? .line(from: start, to: end) : .polygon(arrow(from: start, to: end, page: page))
        }
        return shape(kind, in: box(from: start, to: end, square: constrained, page: page))
    }

    /// The shape a click at `centre`, or Return at the page's middle, inserts: a square box a fifth
    /// of the page wide, moved onto the page; a line or an arrow left to right across it.
    public static func shape(_ kind: ShapeKind, centredOn centre: CGPoint, page: CGSize) -> GeometryShape {
        let side = (page.width / defaultParts).rounded()
        let x = min(max(centre.x - side / 2, 0), page.width - side)
        let y = min(max(centre.y - side / 2, 0), page.height - side)
        let box = CGRect(x: x, y: y, width: side, height: side)
        if kind.isStroke {
            let from = CGPoint(x: box.minX, y: box.midY)
            let to = CGPoint(x: box.maxX, y: box.midY)
            return kind == .line ? .line(from: from, to: to) : .polygon(arrow(from: from, to: to, page: page))
        }
        return shape(kind, in: box)
    }

    /// A box shape filling `box`, in page pixels.
    static func shape(_ kind: ShapeKind, in box: CGRect) -> GeometryShape {
        let top = CGPoint(x: box.midX, y: box.minY)
        let right = CGPoint(x: box.maxX, y: box.midY)
        let bottom = CGPoint(x: box.midX, y: box.maxY)
        let left = CGPoint(x: box.minX, y: box.midY)
        switch kind {
        case .ellipse:
            return .ellipse(
                center: CGPoint(x: box.midX.rounded(), y: box.midY.rounded()),
                horizontal: Int((box.width / 2).rounded(.down)), vertical: Int((box.height / 2).rounded(.down)))
        case .triangle:
            return .polygon([top, CGPoint(x: box.maxX, y: box.maxY), CGPoint(x: box.minX, y: box.maxY)])
        case .diamond:
            return .polygon([top, right, bottom, left])
        case .roundedRectangle:
            return .polygon(rounded(box))
        case .rectangle, .line, .arrow:
            return .polygon([
                CGPoint(x: box.minX, y: box.minY), CGPoint(x: box.maxX, y: box.minY),
                CGPoint(x: box.maxX, y: box.maxY), CGPoint(x: box.minX, y: box.maxY),
            ])
        }
    }

    /// The box between two corners on the page, each side at least `minimumSide`, square with
    /// Shift on the longer side; it grows away from `start`, and back onto the page.
    static func box(from start: CGPoint, to end: CGPoint, square: Bool, page: CGSize) -> CGRect {
        var width = max(abs(end.x - start.x), minimumSide)
        var height = max(abs(end.y - start.y), minimumSide)
        if square {
            width = max(width, height)
            height = width
        }
        let x = end.x < start.x ? start.x - width : start.x
        let y = end.y < start.y ? start.y - height : start.y
        width = min(width, page.width)
        height = min(height, page.height)
        return CGRect(
            x: min(max(x, 0), page.width - width), y: min(max(y, 0), page.height - height), width: width,
            height: height)
    }

    /// The arrow's outline, as Smart Pen's `arrowPoints` without its fill: the shaft from the tail
    /// to the tip, then the head's two barbs and the tip again, so the sent polygon closes the head.
    /// A barb past the page's edge is moved onto it.
    static func arrow(from tail: CGPoint, to tip: CGPoint, page: CGSize) -> [CGPoint] {
        let length = max(1, hypot(tail.x - tip.x, tail.y - tip.y))
        // Never longer than half the shaft, so a short arrow keeps a shaft.
        let head = min(headLength, length / 2)
        let back = CGPoint(x: (tail.x - tip.x) / length, y: (tail.y - tip.y) / length)
        let angle = barbDegrees * .pi / 180
        let barb = { (side: CGFloat) in
            CGPoint(
                x: tip.x + head * (back.x * cos(side * angle) - back.y * sin(side * angle)),
                y: tip.y + head * (back.x * sin(side * angle) + back.y * cos(side * angle)))
        }
        return [tail, tip, clamp(barb(1), page: page), clamp(barb(-1), page: page), tip]
    }

    /// A rectangle's outline with each corner an arc of `cornerArcPoints` points.
    static func rounded(_ box: CGRect) -> [CGPoint] {
        let radius = min(box.width, box.height) / cornerParts
        let centres = [
            (CGPoint(x: box.maxX - radius, y: box.minY + radius), -CGFloat.pi / 2),
            (CGPoint(x: box.maxX - radius, y: box.maxY - radius), 0),
            (CGPoint(x: box.minX + radius, y: box.maxY - radius), CGFloat.pi / 2),
            (CGPoint(x: box.minX + radius, y: box.minY + radius), CGFloat.pi),
        ]
        return centres.flatMap { centre, start in
            (0..<cornerArcPoints).map { step in
                let turn = start + CGFloat(step) / CGFloat(cornerArcPoints - 1) * .pi / 2
                return CGPoint(
                    x: (centre.x + radius * cos(turn)).rounded(), y: (centre.y + radius * sin(turn)).rounded())
            }
        }
    }

    /// The shape's outline as a path in page pixels: a line, a closed polygon or an ellipse.
    public static func path(_ shape: GeometryShape) -> CGPath {
        let path = CGMutablePath()
        switch shape {
        case .line(let from, let to):
            path.addLines(between: [from, to])
        case .polygon(let corners):
            path.addLines(between: corners)
            path.closeSubpath()
        case .ellipse(let center, let horizontal, let vertical):
            path.addEllipse(
                in: CGRect(
                    x: center.x - CGFloat(horizontal), y: center.y - CGFloat(vertical), width: CGFloat(2 * horizontal),
                    height: CGFloat(2 * vertical)))
        }
        return path
    }

    /// The shape drawn in black on a clear ground, as the Mac shows it until the tablet's copy
    /// returns, and the page box it covers: the shape's box grown by its line. Nil when no bitmap
    /// can be made.
    public static func preview(_ shape: GeometryShape) -> (rect: EditRect, image: CGImage)? {
        let grow = Int(lineWidth.rounded(.up))
        let box = shape.box
        let rect = EditRect(
            left: box.left - grow, top: box.top - grow, right: box.right + grow, bottom: box.bottom + grow)
        guard
            let context = CGContext(
                data: nil, width: rect.right - rect.left, height: rect.bottom - rect.top, bitsPerComponent: 8,
                bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        // Page pixels run down; the bitmap's rows run up.
        context.translateBy(x: 0, y: CGFloat(rect.bottom - rect.top))
        context.scaleBy(x: 1, y: -1)
        context.translateBy(x: CGFloat(-rect.left), y: CGFloat(-rect.top))
        context.addPath(path(shape))
        context.setStrokeColor(CGColor(gray: 0, alpha: 1))
        context.setLineWidth(lineWidth)
        context.setLineJoin(.round)
        context.setLineCap(.round)
        context.strokePath()
        return context.makeImage().map { (rect, $0) }
    }

    /// `point` moved onto a page of `page` pixels.
    static func clamp(_ point: CGPoint, page: CGSize) -> CGPoint {
        CGPoint(x: min(max(point.x, 0), page.width), y: min(max(point.y, 0), page.height))
    }

    /// `end` turned about `start` to the nearest multiple of 45°, its length kept.
    static func snapped(_ end: CGPoint, from start: CGPoint) -> CGPoint {
        let length = hypot(end.x - start.x, end.y - start.y)
        let step = CGFloat.pi / 4
        let angle = (atan2(end.y - start.y, end.x - start.x) / step).rounded() * step
        return CGPoint(x: start.x + length * cos(angle), y: start.y + length * sin(angle))
    }
}
