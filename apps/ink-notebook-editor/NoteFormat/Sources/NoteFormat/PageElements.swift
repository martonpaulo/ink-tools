// The element records of a page, read-only (#324): every stroke, picture and text box of the
// page's `TOTALPATH` block, with its layer, its bounds and its points in page pixels. The field
// layout follows the public description in walnut356's post «Inspecting the Supernote .note
// format» and was measured on the fixtures `content.note` and `landscape-tablet.note`
// (docs/supernote.md › Note file format); no code is copied.
import CoreGraphics
import Foundation

/// One element of a page, in the page's own pixels, upright, as the page is drawn.
public struct PageElement: Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        case stroke, picture, textBox
    }

    public let kind: Kind
    /// The layer the element is on: 0 for the main layer.
    public let layer: Int
    /// A stroke's box holds its ink; a picture's or a text box's is its frame.
    public let bounds: CGRect
    /// The path a stroke follows; the corners of a picture's or a text box's frame.
    public let points: [CGPoint]
    /// The element's place in the page's element block, from 0, erasers and Headings counted:
    /// the tablet's element number less one (#325).
    /// shortcut: the tablet's numbering is read as the block's order, not yet measured on the
    /// tablet; the device round of #325 checks it.
    public let record: Int
}

extension NoteFile {
    /// Every element of page `index`, in the order the page stores them, the last on top. A page
    /// with no element records has none. An eraser record is left out: it hides ink, it is not
    /// an element. A Heading's record is left out too: `headings()` reads it from the footer.
    public func elements(page index: Int) throws -> [PageElement] {
        guard pages.indices.contains(index) else { throw NoteFormatError.badPage(index) }
        let page = pages[index]
        guard let address = page.metadata.address(ElementRecord.key), address != 0 else { return [] }
        let size = pageSize
        let height = page.isHorizontal ? size.width : size.height
        return try ElementRecord.elements(Array(try block(at: address)), pageHeight: height, page: index)
    }
}

/// The byte layout of one element record, from the record's start, where its length is.
enum ElementRecord {
    static let key = "TOTALPATH"
    static let word = 4
    static let colour = 8
    static let layer = 48
    static let kindName = 52
    static let nameLength = 52
    static let box = 104
    static let physicalHeight = 132
    static let physicalWidth = 136
    static let documentKind = 140
    static let disabledAreas = 212
    /// A disabled area is three points of two words.
    static let disabledAreaLength = 24
    static let pointLength = 8

    static func elements(_ bytes: [UInt8], pageHeight: Int, page: Int) throws -> [PageElement] {
        let reader = Reader(bytes: bytes, page: page)
        let count = try reader.word(at: 0)
        var offset = word
        var elements: [PageElement] = []
        for number in 0..<count {
            let length = try reader.word(at: offset)
            guard length <= bytes.count - offset - word else {
                throw reader.failure("element \(number + 1) runs past the block")
            }
            let record = Reader(bytes: Array(bytes[offset..<(offset + word + length)]), page: page)
            if let element = try record.element(pageHeight: pageHeight, number: number) {
                elements.append(element)
            }
            offset += word + length
        }
        return elements
    }

    struct Reader {
        let bytes: [UInt8]
        let page: Int

        func failure(_ reason: String) -> NoteFormatError {
            .badElement("page \(page + 1): \(reason)")
        }

        func word(at offset: Int) throws -> Int {
            guard offset >= 0, offset + ElementRecord.word <= bytes.count else {
                throw failure("a record ends before byte \(offset + ElementRecord.word)")
            }
            return NoteFile.word(bytes, at: offset)
        }

        func name(at offset: Int) throws -> String {
            guard offset + nameLength <= bytes.count else { throw failure("a record ends inside its names") }
            let field = bytes[offset..<(offset + nameLength)]
            return String(decoding: field.prefix { $0 != 0 }, as: UTF8.self)
        }

        func element(pageHeight: Int, number: Int) throws -> PageElement? {
            let values = Registry.NotefileFormatVersions.self
            guard try word(at: colour) != values.eraserColour else { return nil }
            let height = try word(at: physicalHeight)
            let width = try word(at: physicalWidth)
            guard height > 0 else { throw failure("element \(number + 1) has no page height") }
            let scale = CGFloat(pageHeight) / CGFloat(height)
            let areas = try word(at: disabledAreas)
            let pointsAt = disabledAreas + ElementRecord.word + areas * disabledAreaLength
            let count = try word(at: pointsAt)
            guard count <= (bytes.count - pointsAt - ElementRecord.word) / pointLength else {
                throw failure("element \(number + 1) has more points than bytes")
            }
            // A point is stored down from the top and in from the right edge, in screen units.
            let points = try (0..<count).map { index in
                let at = pointsAt + ElementRecord.word + index * pointLength
                let down = try word(at: at)
                let inFromRight = try word(at: at + ElementRecord.word)
                return CGPoint(x: CGFloat(width - inFromRight) * scale, y: CGFloat(down) * scale)
            }
            let kind: PageElement.Kind
            // The kind names come first: a text box that Real-Time Text inserts carries the
            // stroke document name too (#324, device round 8).
            let named = try name(at: kindName)
            if named == values.pictureKind {
                kind = .picture
            } else if named == values.textBoxKind {
                kind = .textBox
            } else if named == values.headingKind {
                // A Heading's band is read from the footer (`headings()`), not as an element.
                return nil
            } else if try name(at: documentKind) == values.strokeDocument {
                kind = .stroke
            } else {
                throw failure("element \(number + 1) is of an unknown kind «\(named)»")
            }
            let bounds: CGRect
            if kind == .stroke {
                // A stroke's box is in page pixels and holds its width of ink.
                let left = try word(at: box)
                let top = try word(at: box + ElementRecord.word)
                let right = try word(at: box + 4 * ElementRecord.word)
                let bottom = try word(at: box + 5 * ElementRecord.word)
                bounds = CGRect(x: left, y: top, width: right - left, height: bottom - top)
            } else {
                // A picture's or a text box's box does not match its frame; its points do.
                let xs = points.map(\.x)
                let ys = points.map(\.y)
                guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else {
                    throw failure("element \(number + 1) has no frame")
                }
                bounds = CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
            }
            return PageElement(
                kind: kind, layer: try word(at: layer), bounds: bounds, points: points, record: number)
        }
    }
}
