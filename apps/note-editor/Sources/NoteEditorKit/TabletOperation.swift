// The one write path's operation (#313): what the Mac sends for one edit, in our own words. The
// tablet helper inside Device Link applies it (#312, route T); a page move alone is written by the
// Mac (route B), the recorded exception of AGENTS.md. A stroke's colour is a `PenTone`, and no
// other field carries one, so no colour can enter a note through an operation (only Manta tones,
// owner 2026-11-26).
import CoreGraphics
import Foundation

/// The Manta's four pen tones (`docs/supernote.md` › Greys and colours), by the value the tablet
/// helper's stroke insert takes; no other colour can be written (#327).
public enum PenTone: Int, Sendable, Equatable, Codable, CaseIterable {
    case black = 0x00
    case darkGrey = 0x9D
    case grey = 0xC9
    case white = 0xFE
}

/// A rectangle on a page, in page pixels.
public struct EditRect: Sendable, Equatable, Codable {
    public let left: Int
    public let top: Int
    public let right: Int
    public let bottom: Int

    public init(left: Int, top: Int, right: Int, bottom: Int) {
        self.left = left
        self.top = top
        self.right = right
        self.bottom = bottom
    }

    /// The smallest rect that holds this one and `other`.
    public func union(_ other: EditRect) -> EditRect {
        EditRect(
            left: min(left, other.left), top: min(top, other.top), right: max(right, other.right),
            bottom: max(bottom, other.bottom))
    }

    /// The smallest rect of whole pixels that holds every point; empty at the origin for none.
    public init(around points: [CGPoint]) {
        let xs = points.map(\.x)
        let ys = points.map(\.y)
        self.init(
            left: Int((xs.min() ?? 0).rounded(.down)), top: Int((ys.min() ?? 0).rounded(.down)),
            right: Int((xs.max() ?? 0).rounded(.up)), bottom: Int((ys.max() ?? 0).rounded(.up)))
    }
}

/// Who writes an operation's bytes.
public enum WriteRoute: Sendable, Equatable {
    /// The tablet helper, with the tablet's own file API.
    case tablet
    /// The Mac writes the note and copies it back: a page move only (#263).
    case mac
}

/// One edit of one note, made on the Mac's copy whose hash is `baseHash`.
public struct TabletOperation: Sendable, Equatable {
    public enum Change: Sendable, Equatable {
        /// Moves page `from` to `to`, both from 0.
        case movePage(from: Int, to: Int)
        /// A typed text box at `rect`.
        case insertText(String, rect: EditRect, fontSize: Int)
        /// A picture file on the Mac, already in Manta greys, at `rect`.
        case insertPicture(URL, rect: EditRect)
        /// Inserts strokes, text boxes and pictures together, as a paste does (#327).
        case insertElements([HelperElement])
        /// Moves or resizes each element, by its number on the page from 1, to its rect.
        case placeElements([ElementPlacement])
        /// Resizes, rotates or flips elements: each target one tablet call, in order (#326).
        case transformElements([TransformTarget])
        /// Deletes the elements, by their numbers on the page from 1.
        case deleteElements([Int])
        /// Inserts a page at `page` with a system template such as `style_white`.
        case insertPage(template: String)
        /// Removes the pages at these places, each from 0; `page` is the lowest.
        case removePages([Int])
        /// Puts the note back as the backup kept before an edit: Revert to Backup's route, for
        /// the undo of a removal (#329).
        case restoreBackup(URL)
    }

    /// The note on the tablet, by its full path.
    public let note: String
    /// The hash of the Mac's copy the edit was made on.
    public let baseHash: String
    /// The page the change targets, from 0.
    public let page: Int
    public let change: Change

    public init(note: String, baseHash: String, page: Int, change: Change) {
        self.note = note
        self.baseHash = baseHash
        self.page = page
        self.change = change
    }

    /// The operation of an edit from the history (#328); nil for the restore of a page without
    /// the backup kept before its removal, the only copy of that page's content.
    public init?(_ edit: NoteEdit, note: String, baseHash: String, backup: URL? = nil) {
        switch edit {
        case .movePage(let from, let to):
            self.init(note: note, baseHash: baseHash, page: from, change: .movePage(from: from, to: to))
        case .insertPage(let at, let template):
            self.init(note: note, baseHash: baseHash, page: at, change: .insertPage(template: template))
        case .removePages(let at):
            guard let lowest = at.min() else { return nil }
            self.init(note: note, baseHash: baseHash, page: lowest, change: .removePages(at.sorted()))
        case .moveElements(let move):
            self.init(note: note, baseHash: baseHash, page: move.page, change: .placeElements(move.placements))
        case .insertPicture(let page, let file, let rect):
            self.init(note: note, baseHash: baseHash, page: page, change: .insertPicture(file, rect: rect))
        case .insertText(let page, let text, let rect, let fontSize):
            self.init(
                note: note, baseHash: baseHash, page: page, change: .insertText(text, rect: rect, fontSize: fontSize))
        case .transformElements(let transform):
            guard transform.refusal == nil else { return nil }
            self.init(
                note: note, baseHash: baseHash, page: transform.page, change: .transformElements(transform.targets))
        case .deleteElements(let page, let elements):
            self.init(
                note: note, baseHash: baseHash, page: page,
                change: .deleteElements(elements.map { $0.record + 1 }.sorted()))
        case .restorePages(let pages):
            guard let backup, let lowest = pages.min() else { return nil }
            self.init(note: note, baseHash: baseHash, page: lowest, change: .restoreBackup(backup))
        case .revertInsert(let page), .restoreElements(let page):
            guard let backup else { return nil }
            self.init(note: note, baseHash: baseHash, page: page, change: .restoreBackup(backup))
        }
    }

    public var route: WriteRoute {
        switch change {
        case .movePage, .restoreBackup: .mac
        default: .tablet
        }
    }

    /// The pages of the note before the edit that the edit may change, from 0; every other page
    /// must keep its bytes. A page move changes none: each page keeps its bytes at a new place.
    public var editedPages: Set<Int> {
        switch change {
        case .movePage, .insertPage, .restoreBackup: []
        case .removePages(let pages): Set(pages)
        default: [page]
        }
    }

    /// The bounds the edit writes into, when it writes into one place of a page.
    public var bounds: EditRect? {
        switch change {
        case .insertText(_, let rect, _), .insertPicture(_, let rect): rect
        case .placeElements(let placements) where placements.count == 1: placements[0].rect
        case .insertElements(let elements):
            elements.first.map { first in elements.dropFirst().reduce(first.box) { $0.union($1.box) } }
        default: nil
        }
    }

    /// The refusal of this operation on a copy whose hash is `hash`: nil on its own base.
    public func refusal(onBase hash: String) -> WriteFailure? {
        hash == baseHash ? nil : .staleBase
    }

    /// The helper's operations, as `plugins/device-link/src/editor/operations.ts` reads them; empty
    /// for an operation the Mac writes. A picture names its local file; inkctl copies it.
    public var helperOperations: [HelperOperation] {
        switch change {
        case .movePage, .restoreBackup: []
        case .insertText(let text, let rect, let fontSize):
            [.insertElements(page: page, elements: [.text(text, rect: rect, fontSize: fontSize)])]
        case .insertPicture(let file, let rect):
            [.insertElements(page: page, elements: [.picture(file.path(percentEncoded: false), rect: rect)])]
        case .placeElements(let placements):
            placements.map { .modifyElements(page: page, num: $0.number, rect: $0.rect) }
        case .transformElements(let targets):
            targets.map { target in
                switch target {
                case .strokes(let numbers, let matrix):
                    .transformElements(page: page, nums: numbers, matrix: matrix.values)
                case .textBox(let number, let rect): .modifyElements(page: page, num: number, rect: rect)
                case .picture(let number, let rect, let file):
                    .modifyElements(page: page, num: number, rect: rect, file: file.path(percentEncoded: false))
                }
            }
        case .deleteElements(let numbers): [.deleteElements(page: page, nums: numbers)]
        case .insertElements(let elements): [.insertElements(page: page, elements: elements)]
        case .insertPage(let template): [.insertPage(page: page, template: template)]
        // Highest first, so each number still names the page the owner picked.
        case .removePages(let pages): pages.sorted(by: >).map { .removePage(page: $0) }
        }
    }
}

/// One element's new place.
public struct ElementPlacement: Sendable, Equatable {
    public let number: Int
    public let rect: EditRect

    public init(number: Int, rect: EditRect) {
        self.number = number
        self.rect = rect
    }
}

/// An operation of the tablet helper, in its JSON shape.
public enum HelperOperation: Sendable, Equatable, Encodable {
    case insertElements(page: Int, elements: [HelperElement])
    /// A picture names its new file: the helper inserts it at `rect` and deletes the old one.
    case modifyElements(page: Int, num: Int, rect: EditRect, file: String? = nil)
    case transformElements(page: Int, nums: [Int], matrix: [Double])
    case deleteElements(page: Int, nums: [Int])
    case insertPage(page: Int, template: String)
    case removePage(page: Int)
    case openNote

    private enum Key: String, CodingKey { case op, page, elements, num, rect, file, nums, matrix, template }

    /// The helper's name of the operation.
    private var name: String {
        switch self {
        case .insertElements: "insertElements"
        case .modifyElements: "modifyElements"
        case .transformElements: "transformElements"
        case .deleteElements: "deleteElements"
        case .insertPage: "insertPage"
        case .removePage: "removePage"
        case .openNote: "openNote"
        }
    }

    /// The page the operation targets, from 0; none for `openNote`.
    private var page: Int? {
        switch self {
        case .insertElements(let page, _), .modifyElements(let page, _, _, _), .transformElements(let page, _, _),
            .deleteElements(let page, _), .insertPage(let page, _), .removePage(let page):
            page
        case .openNote: nil
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        try container.encode(name, forKey: .op)
        try container.encodeIfPresent(page, forKey: .page)
        switch self {
        case .insertElements(_, let elements):
            try container.encode(elements, forKey: .elements)
        case .modifyElements(_, let num, let rect, let file):
            try container.encode(num, forKey: .num)
            try container.encode(rect, forKey: .rect)
            try container.encodeIfPresent(file, forKey: .file)
        case .transformElements(_, let nums, let matrix):
            try container.encode(nums, forKey: .nums)
            try container.encode(matrix, forKey: .matrix)
        case .deleteElements(_, let nums):
            try container.encode(nums, forKey: .nums)
        case .insertPage(_, let template):
            try container.encode(template, forKey: .template)
        case .removePage, .openNote:
            break
        }
    }
}

/// A shape the tablet keeps as its own geometry element, type 700, in page pixels (#463): the
/// Device Link helper's `geometry` element takes exactly these.
public enum GeometryShape: Sendable, Equatable {
    /// The tablet's line tool, `straightLine`.
    case line(from: CGPoint, to: CGPoint)
    /// `GEO_polygon`: the corners in order; the closing point is added when sent.
    case polygon([CGPoint])
    /// `GEO_circle` when the two radii are equal, else `GEO_ellipse`; never turned, as the helper
    /// takes angle 0 only until the device round settles the angle's unit.
    case ellipse(center: CGPoint, horizontal: Int, vertical: Int)

    /// The most points the helper takes for a polygon, the closing one included.
    public static let maxPolygonPoints = 64

    /// The box the shape covers.
    public var box: EditRect {
        switch self {
        case .line(let from, let to): EditRect(around: [from, to])
        case .polygon(let corners): EditRect(around: corners)
        case .ellipse(let center, let horizontal, let vertical):
            EditRect(
                around: [
                    CGPoint(x: center.x - CGFloat(horizontal), y: center.y - CGFloat(vertical)),
                    CGPoint(x: center.x + CGFloat(horizontal), y: center.y + CGFloat(vertical)),
                ])
        }
    }

    /// Whether the helper takes the shape on a page of `size` pixels: a line of two distinct ends,
    /// a polygon of 3 corners up to one under the limit, radii from 1, all of it on the page.
    public func fits(on size: CGSize) -> Bool {
        let box = box
        let onPage =
            box.left >= 0 && box.top >= 0 && CGFloat(box.right) <= size.width
            && CGFloat(box.bottom) <= size.height
        switch self {
        case .line(let from, let to):
            return onPage && from != to
        case .polygon(let corners):
            return onPage && (3..<Self.maxPolygonPoints).contains(corners.count)
        case .ellipse(_, let horizontal, let vertical):
            return onPage && horizontal >= 1 && vertical >= 1
        }
    }
}

/// An element the helper inserts, in its JSON shape.
public enum HelperElement: Sendable, Equatable, Encodable {
    case text(String, rect: EditRect, fontSize: Int)
    case picture(String, rect: EditRect)
    /// A pen stroke through `points`, in page pixels, as the helper's `stroke` element reads it.
    case stroke(points: [CGPoint], penColor: PenTone, thickness: Int)
    /// A shape as the tablet's geometry element, its line `penWidth` from 100 to 5000 as the helper checks (#463).
    case geometry(GeometryShape, penColor: PenTone, penWidth: Int)

    private enum Key: String, CodingKey {
        case kind, text, rect, fontSize, file, points, penColor, thickness, shape, center, major, minor, angle, penWidth
    }

    /// The box the element covers: a stroke's points, a shape's box, a text box's or a picture's rect.
    public var box: EditRect {
        switch self {
        case .text(_, let rect, _), .picture(_, let rect): rect
        case .stroke(let points, _, _): EditRect(around: points)
        case .geometry(let shape, _, _): shape.box
        }
    }

    /// `[x, y]` in whole page pixels, as the helper's `parsePoint` reads it.
    private static func pixels(_ points: [CGPoint]) -> [[Int]] {
        points.map { [Int($0.x.rounded()), Int($0.y.rounded())] }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        switch self {
        case .stroke(let points, let penColor, let thickness):
            try container.encode("stroke", forKey: .kind)
            // Each point is `[x, y]` in whole page pixels, as the helper's `parseElement` reads it.
            try container.encode(points.map { [Int($0.x.rounded()), Int($0.y.rounded())] }, forKey: .points)
            for (value, key) in [(penColor.rawValue, Key.penColor), (thickness, Key.thickness)] {
                try container.encode(value, forKey: key)
            }
        case .text(let text, let rect, let fontSize):
            try container.encode("text", forKey: .kind)
            try container.encode(text, forKey: .text)
            try container.encode(rect, forKey: .rect)
            try container.encode(fontSize, forKey: .fontSize)
        case .picture(let file, let rect):
            try container.encode("picture", forKey: .kind)
            try container.encode(file, forKey: .file)
            try container.encode(rect, forKey: .rect)
        case .geometry(let shape, let penColor, let penWidth):
            try container.encode("geometry", forKey: .kind)
            switch shape {
            case .line(let from, let to):
                try container.encode("straightLine", forKey: .shape)
                try container.encode(Self.pixels([from, to]), forKey: .points)
            case .polygon(let corners):
                try container.encode("GEO_polygon", forKey: .shape)
                try container.encode(Self.pixels(corners + corners.prefix(1)), forKey: .points)
            case .ellipse(let center, let horizontal, let vertical):
                try container.encode(horizontal == vertical ? "GEO_circle" : "GEO_ellipse", forKey: .shape)
                try container.encode(Self.pixels([center])[0], forKey: .center)
                try container.encode(horizontal, forKey: .major)
                try container.encode(vertical, forKey: .minor)
                try container.encode(0, forKey: .angle)
            }
            try container.encode(penColor.rawValue, forKey: .penColor)
            try container.encode(penWidth, forKey: .penWidth)
        }
    }
}
