// A selection resized, rotated or flipped on its page (#326). Our own model: each stroke takes the
// helper's `transformElements` with one matrix, which maps its points, outline and box on the
// tablet; a picture is a new picture file at its new box, and a text box its new rect, through
// `modifyElements`. The Mac computes every place from its own copy and sends only the selection.
import CoreGraphics
import Foundation

/// An affine map of page pixels, as CoreGraphics orders it: x' = a x + c y + tx, y' = b x + d y + ty.
/// Page pixels count down from the top, so a positive angle turns clockwise on the page.
public struct PageMatrix: Sendable, Equatable {
    public let a: Double
    public let b: Double
    public let c: Double
    public let d: Double
    public let tx: Double
    public let ty: Double

    public init(a: Double, b: Double, c: Double, d: Double, tx: Double, ty: Double) {
        self.a = a
        self.b = b
        self.c = c
        self.d = d
        self.tx = tx
        self.ty = ty
    }

    public init(_ affine: CGAffineTransform) {
        self.init(
            a: Double(affine.a), b: Double(affine.b), c: Double(affine.c), d: Double(affine.d),
            tx: Double(affine.tx), ty: Double(affine.ty))
    }

    public static let identity = PageMatrix(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)

    public var affine: CGAffineTransform {
        CGAffineTransform(
            a: CGFloat(a), b: CGFloat(b), c: CGFloat(c), d: CGFloat(d), tx: CGFloat(tx), ty: CGFloat(ty))
    }

    public func apply(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: a * Double(point.x) + c * Double(point.y) + tx, y: b * Double(point.x) + d * Double(point.y) + ty)
    }

    /// This map, then `next`.
    public func then(_ next: PageMatrix) -> PageMatrix {
        PageMatrix(
            a: a * next.a + b * next.c, b: a * next.b + b * next.d, c: c * next.a + d * next.c,
            d: c * next.b + d * next.d, tx: tx * next.a + ty * next.c + next.tx, ty: tx * next.b + ty * next.d + next.ty
        )
    }

    /// The map moved by `dx`, `dy` page pixels after it.
    func moved(_ dx: Double, _ dy: Double) -> PageMatrix {
        PageMatrix(a: a, b: b, c: c, d: d, tx: tx + dx, ty: ty + dy)
    }

    /// Below this, two values are the same: page pixels are whole, the map's parts far from it.
    static let tolerance = 1e-9

    public var isIdentity: Bool {
        [a - 1, b, c, d - 1, tx, ty].allSatisfy { abs($0) < Self.tolerance }
    }

    /// Only a scale and a move: a rect still names an element mapped by it.
    public var keepsAxes: Bool {
        abs(b) < Self.tolerance && abs(c) < Self.tolerance && a > 0 && d > 0
    }

    /// The helper's order: a, b, c, d, tx, ty.
    public var values: [Double] { [a, b, c, d, tx, ty] }
}

/// A handle on the selection frame that resizes it.
public enum ResizeHandle: Sendable, CaseIterable {
    case topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left

    var movesLeft: Bool { [.topLeft, .left, .bottomLeft].contains(self) }
    var movesRight: Bool { [.topRight, .right, .bottomRight].contains(self) }
    var movesTop: Bool { [.topLeft, .top, .topRight].contains(self) }
    var movesBottom: Bool { [.bottomLeft, .bottom, .bottomRight].contains(self) }
    var isCorner: Bool { [.topLeft, .topRight, .bottomRight, .bottomLeft].contains(self) }
}

/// What a transform does, for its name in the menu.
public enum TransformKind: Sendable, Equatable {
    case resize, rotate, flip
}

/// Why a transform is not sent.
public enum TransformRefusal: Sendable, Equatable {
    /// A text box is rotated or flipped: the tablet's text box holds only a rect.
    case textBoxTurned
    /// A picture has no new file yet: the Mac makes it before the send.
    case pictureWithoutFile
    /// The selection would not fit on the page.
    case largerThanPage
}

/// What one tablet call of a transform names.
public enum TransformTarget: Sendable, Equatable {
    /// Strokes by their numbers on the page, from 1, mapped by one matrix.
    case strokes([Int], PageMatrix)
    /// A text box by its number, at its new rect.
    case textBox(number: Int, rect: EditRect)
    /// A picture by its number, replaced by `file` at its new rect.
    case picture(number: Int, rect: EditRect, file: URL)
}

/// The elements of one page mapped together by one matrix in page pixels.
public struct ElementTransform: Sendable, Equatable {
    public let page: Int
    public let elements: [MovedElement]
    public let matrix: PageMatrix
    /// Each picture's new file, by its record, already in Manta greys: the Mac makes it.
    public let pictureFiles: [Int: URL]

    public init(page: Int, elements: [MovedElement], matrix: PageMatrix, pictureFiles: [Int: URL] = [:]) {
        self.page = page
        self.elements = elements
        self.matrix = matrix
        self.pictureFiles = pictureFiles
    }

    /// The same transform with the pictures' new files.
    public func with(pictureFiles: [Int: URL]) -> ElementTransform {
        ElementTransform(page: page, elements: elements, matrix: matrix, pictureFiles: pictureFiles)
    }

    /// The selection's box before the change.
    public var frame: CGRect { Self.frame(of: elements) }

    /// The selection's box after the change: the bounds of its mapped corners.
    public var transformedFrame: CGRect { Self.mapped(frame, by: matrix) }

    /// Each element where the change puts it: its path mapped, its box the bounds of its mapped corners.
    public var transformed: [MovedElement] {
        elements.map { element in
            MovedElement(
                record: element.record, box: EditRect(Self.mapped(element.box.rect, by: matrix)),
                points: element.points.map(matrix.apply), isArea: element.isArea, isPicture: element.isPicture)
        }
    }

    public var isEmpty: Bool { matrix.isIdentity || elements.isEmpty }

    /// A scale alone is a resize; a map that mirrors is a flip; any other a rotation.
    public var kind: TransformKind {
        if matrix.keepsAxes { return .resize }
        return matrix.a * matrix.d - matrix.b * matrix.c < 0 ? .flip : .rotate
    }

    /// Why the transform is not sent, nil when it can be.
    public var refusal: TransformRefusal? {
        if !matrix.keepsAxes && elements.contains(where: { $0.isArea && !$0.isPicture }) { return .textBoxTurned }
        if elements.contains(where: { $0.isPicture && pictureFiles[$0.record] == nil }) { return .pictureWithoutFile }
        return nil
    }

    /// The transform kept on a page of `width` by `height` pixels: moved back inside at each edge,
    /// nil when the selection would not fit on the page.
    public func clamped(width: Int, height: Int) -> ElementTransform? {
        let box = transformedFrame.integral
        guard box.width <= CGFloat(width), box.height <= CGFloat(height) else { return nil }
        let dx = min(max(0, -box.minX), CGFloat(width) - box.maxX)
        let dy = min(max(0, -box.minY), CGFloat(height) - box.maxY)
        return ElementTransform(
            page: page, elements: elements, matrix: matrix.moved(Double(dx), Double(dy)), pictureFiles: pictureFiles)
    }

    /// The most element numbers one helper operation holds (`LIMITS.elements` in the helper).
    static let numbersPerCall = 64

    /// The tablet calls, in the order they must run: strokes and text boxes keep their numbers;
    /// each picture is replaced by a new one added last and its old one deleted, highest number
    /// first, so no deletion renumbers an element still to come.
    public var targets: [TransformTarget] {
        let strokes = elements.filter { !$0.isArea }.map { $0.record + 1 }.sorted()
        let strokeCalls = stride(from: 0, to: strokes.count, by: Self.numbersPerCall).map { start in
            TransformTarget.strokes(Array(strokes[start..<min(start + Self.numbersPerCall, strokes.count)]), matrix)
        }
        let areas = transformed.filter(\.isArea).sorted { $0.record > $1.record }
        let textBoxes = areas.filter { !$0.isPicture }.map {
            TransformTarget.textBox(number: $0.record + 1, rect: $0.box)
        }
        let pictures = areas.compactMap { element -> TransformTarget? in
            guard element.isPicture, let file = pictureFiles[element.record] else { return nil }
            return .picture(number: element.record + 1, rect: element.box, file: file)
        }
        return strokeCalls + textBoxes + pictures
    }

    // MARK: - The changes, each about the selection frame

    /// A quarter turn about the frame's centre, exact, so four make the identity.
    public static func quarterTurn(page: Int, elements: [MovedElement], clockwise: Bool) -> ElementTransform {
        let centre = frame(of: elements).centre
        let sign: Double = clockwise ? 1 : -1
        let turn = PageMatrix(a: 0, b: sign, c: -sign, d: 0, tx: 0, ty: 0)
        return ElementTransform(page: page, elements: elements, matrix: about(centre, turn))
    }

    /// A free rotation by `radians` about the frame's centre, clockwise on the page when positive.
    public static func rotation(page: Int, elements: [MovedElement], radians: Double) -> ElementTransform {
        let turn = PageMatrix(a: cos(radians), b: sin(radians), c: -sin(radians), d: cos(radians), tx: 0, ty: 0)
        return ElementTransform(page: page, elements: elements, matrix: about(frame(of: elements).centre, turn))
    }

    /// A mirror about the frame's vertical axis (`horizontal`) or its horizontal one.
    public static func flip(page: Int, elements: [MovedElement], horizontal: Bool) -> ElementTransform {
        let mirror = PageMatrix(a: horizontal ? -1 : 1, b: 0, c: 0, d: horizontal ? 1 : -1, tx: 0, ty: 0)
        return ElementTransform(page: page, elements: elements, matrix: about(frame(of: elements).centre, mirror))
    }

    /// The frame mapped onto `rect`; a side the frame does not have (a straight line) keeps its size.
    public static func resize(page: Int, elements: [MovedElement], to rect: CGRect) -> ElementTransform {
        let from = frame(of: elements)
        let sx = from.width > 0 ? Double(rect.width / from.width) : 1
        let sy = from.height > 0 ? Double(rect.height / from.height) : 1
        let matrix = PageMatrix(
            a: sx, b: 0, c: 0, d: sy, tx: Double(rect.minX) - Double(from.minX) * sx,
            ty: Double(rect.minY) - Double(from.minY) * sy)
        return ElementTransform(page: page, elements: elements, matrix: matrix)
    }

    /// The smallest side a handle leaves, in page pixels, so a frame never folds over itself.
    public static let smallestSide: CGFloat = 8

    /// The frame a handle dragged to `point` gives: the opposite side stays; with `keepRatio`
    /// (Shift) both sides grow by one ratio, a side handle keeping the other axis centred.
    public static func resized(_ frame: CGRect, handle: ResizeHandle, to point: CGPoint, keepRatio: Bool) -> CGRect {
        var left = frame.minX
        var right = frame.maxX
        var top = frame.minY
        var bottom = frame.maxY
        if handle.movesLeft { left = min(point.x, right - smallestSide) }
        if handle.movesRight { right = max(point.x, left + smallestSide) }
        if handle.movesTop { top = min(point.y, bottom - smallestSide) }
        if handle.movesBottom { bottom = max(point.y, top + smallestSide) }
        guard keepRatio else { return CGRect(x: left, y: top, width: right - left, height: bottom - top) }
        let ratios = [
            frame.width > 0 && (handle.movesLeft || handle.movesRight) ? (right - left) / frame.width : nil,
            frame.height > 0 && (handle.movesTop || handle.movesBottom) ? (bottom - top) / frame.height : nil,
        ].compactMap { $0 }
        let ratio = ratios.max() ?? 1
        let width = frame.width * ratio
        let height = frame.height * ratio
        let x: CGFloat =
            handle.movesLeft ? frame.maxX - width : handle.movesRight ? frame.minX : frame.midX - width / 2
        let y: CGFloat =
            handle.movesTop ? frame.maxY - height : handle.movesBottom ? frame.minY : frame.midY - height / 2
        return CGRect(x: x, y: y, width: width, height: height)
    }

    // MARK: - Helpers

    static func frame(of elements: [MovedElement]) -> CGRect {
        elements.map(\.box.rect).reduce(CGRect.null) { $0.union($1) }
    }

    static func about(_ centre: CGPoint, _ change: PageMatrix) -> PageMatrix {
        PageMatrix(a: 1, b: 0, c: 0, d: 1, tx: -Double(centre.x), ty: -Double(centre.y))
            .then(change).moved(Double(centre.x), Double(centre.y))
    }

    static func mapped(_ rect: CGRect, by matrix: PageMatrix) -> CGRect {
        let corners = [
            CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY),
        ].map(matrix.apply)
        let xs = corners.map(\.x)
        let ys = corners.map(\.y)
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return .null }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
}

extension EditRect {
    /// The box as a rectangle in page pixels.
    public var rect: CGRect { CGRect(x: left, y: top, width: right - left, height: bottom - top) }
}

extension CGRect {
    var centre: CGPoint { CGPoint(x: midX, y: midY) }
}
