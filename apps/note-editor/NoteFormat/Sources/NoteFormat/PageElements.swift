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

    /// What an element holds besides its place, read from the Mac's copy, so the element can be
    /// inserted again elsewhere (#327).
    public enum Content: Sendable, Equatable {
        /// A stroke's pen colour as its record stores it (0 is black) and its thickness, in the
        /// units the tablet helper's stroke insert takes (400 for the pen `inkctl ink write` uses).
        /// shortcut: only black (0) is measured on a fixture; the other pen tones wait for the
        /// device round of #327, and the edit model checks the value against the pen tones.
        case stroke(penColor: Int, thickness: Int)
        /// A picture's image, the PNG file its record holds, at the picture's own pixel size.
        case picture(png: Data)
        /// A text box's text and its font size in page pixels.
        case textBox(text: String, fontSize: Double)
    }

    public var kind: Kind {
        switch content {
        case .stroke: .stroke
        case .picture: .picture
        case .textBox: .textBox
        }
    }

    public let content: Content
    /// The layer the element is on: 0 for the main layer.
    public let layer: Int
    /// A stroke's box holds its ink; a picture's or a text box's is its frame.
    public let bounds: CGRect
    /// The path a stroke follows; the corners of a picture's or a text box's frame.
    public let points: [CGPoint]
    /// The outline the tablet fills for a stroke, in page pixels: closed rings, usually one, a
    /// letter with a hole two (#365). Nil for a picture or a text box, and for a stroke whose
    /// record does not hold its outline where the reader looks; such a stroke still has its points.
    public let outline: [[CGPoint]]?
    /// The tablet's element number less one, as the record stores it (#471): what names the
    /// element to the tablet's helper. It is not the record's place in the page's block: an edit
    /// on the tablet moves the record it changes to the end and keeps its number, and a delete
    /// leaves a gap.
    public let record: Int
}

/// A record of a page the reader steps over: its kind is none it knows (#459).
public struct SkippedElement: Sendable, Equatable {
    /// The tablet's element number less one, as `PageElement.record`.
    public let record: Int
    /// The kind name the record carries.
    public let kind: String
}

/// What a page's element block reads to: its elements, and the records of a kind the reader does
/// not know, stepped over so the rest of the page still selects (#459).
public struct PageElements: Sendable, Equatable {
    public let elements: [PageElement]
    public let skipped: [SkippedElement]
}

extension NoteFile {
    /// Every element of page `index`, in the order the page stores them, the last on top. A page
    /// with no element records has none. An eraser record is left out: it hides ink, it is not
    /// an element. A Heading's record is left out too: `headings()` reads it from the footer.
    public func elements(page index: Int) throws -> [PageElement] {
        try readElements(page: index).elements
    }

    /// The elements of page `index`, and each record of an unknown kind, stepped over. A record
    /// whose bytes do not hold together still fails the whole page (#459).
    public func readElements(page index: Int) throws -> PageElements {
        guard pages.indices.contains(index) else { throw NoteFormatError.badPage(index) }
        let page = pages[index]
        guard let address = page.metadata.address(ElementRecord.key), address != 0 else {
            return PageElements(elements: [], skipped: [])
        }
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
    static let thickness = 12
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
    /// The arrays after the points, each a count then its items: pressures, angles, draw flags,
    /// smoothed points and their greys, by the size of one item. The record's trail status follows.
    static let arraysAfterPoints = [2, 4, 1, 8, 4]
    /// The tablet's element number, from the trail status's start (#471).
    static let numberAfterTrail = 8
    /// A stroke's outline follows its trail status: this many bytes, a count of 4-byte items,
    /// `outlineGap` bytes, then a ring count and each ring as a point count and float32 x, y pairs
    /// in page pixels. Offsets from the public format notes of `philips/supernote-typescript`
    /// (`src/strokes.ts`), measured on every stroke of the fixtures (#365).
    static let outlineAfterTrail = 52
    static let outlineGap = 10
    /// A ring of fewer points encloses nothing.
    static let ringMinimum = 3
    /// A record ends with its data, a length-prefixed text of comma-separated Base64 fields
    /// (`none` for a stroke), then one more length-prefixed text and this many bytes. Read from
    /// the end, since the arrays between the trail status and the data vary by kind; measured on
    /// every record of every fixture (#327).
    static let afterData = 17
    /// The data's fields of a picture or a text box, from 0: a text box's font size
    /// (`40.000000`), and a text box's text or a picture's PNG file (#327). Field 4 holds the
    /// frame (`x,y,width,height`), which the points already give.
    static let field = (fontSize: 10, payload: 12)

    static func elements(_ bytes: [UInt8], pageHeight: Int, page: Int) throws -> PageElements {
        let reader = Reader(bytes: bytes, page: page)
        let count = try reader.word(at: 0)
        var offset = word
        var elements: [PageElement] = []
        var skipped: [SkippedElement] = []
        for number in 0..<count {
            let length = try reader.word(at: offset)
            guard length <= bytes.count - offset - word else {
                throw reader.failure("element \(number + 1) runs past the block")
            }
            let record = Reader(bytes: Array(bytes[offset..<(offset + word + length)]), page: page)
            switch try record.element(pageHeight: pageHeight, number: number) {
            case .element(let element): elements.append(element)
            case .unknown(let kind, let stored): skipped.append(SkippedElement(record: stored, kind: kind))
            case .none: break
            }
            offset += word + length
        }
        return PageElements(elements: elements, skipped: skipped)
    }

    /// What one record reads to.
    enum Read {
        case element(PageElement)
        /// A record of a kind the reader does not know, by its kind name and its stored number
        /// less one.
        case unknown(String, record: Int)
    }

    struct Reader {
        let bytes: [UInt8]
        let page: Int

        func failure(_ reason: String) -> NoteFormatError {
            .badElement(page: page, reason: reason)
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

        /// The signed trail status that follows the arrays after the points, which start at
        /// `offset`, and the tablet's element number, the third word from the trail status: 1 to 3
        /// on a page the tablet wrote in order, 3, 1, 2 after it moved number 3 (measured on every
        /// record of every fixture and on notes edited through the tablet's helper, #471).
        func trail(after offset: Int) throws -> (status: Int32, number: Int, at: Int) {
            var at = offset
            for itemLength in arraysAfterPoints {
                let items = try word(at: at)
                guard items <= (bytes.count - at - ElementRecord.word) / itemLength else {
                    throw failure("an array after the points runs past its record")
                }
                at += ElementRecord.word + items * itemLength
            }
            let status = Int32(bitPattern: UInt32(truncatingIfNeeded: try word(at: at)))
            return (status, try word(at: at + numberAfterTrail), at)
        }

        /// The outline rings after the trail status at `trail`; nil when they do not fit the record.
        func outline(afterTrail trail: Int) -> [[CGPoint]]? {
            var at = trail + outlineAfterTrail
            guard let items = try? word(at: at), items <= (bytes.count - at) / ElementRecord.word else { return nil }
            at += ElementRecord.word * (1 + items) + outlineGap
            guard let count = try? word(at: at), count <= (bytes.count - at) / ElementRecord.word else { return nil }
            at += ElementRecord.word
            var rings: [[CGPoint]] = []
            for _ in 0..<count {
                guard let points = try? word(at: at), points <= (bytes.count - at - ElementRecord.word) / pointLength
                else { return nil }
                at += ElementRecord.word
                let ring = (0..<points).map { index in
                    let point = at + index * pointLength
                    return CGPoint(x: CGFloat(float(at: point)), y: CGFloat(float(at: point + ElementRecord.word)))
                }
                at += points * pointLength
                if ring.count >= ringMinimum { rings.append(ring) }
            }
            return rings.isEmpty ? nil : rings
        }

        /// The little-endian float32 at `offset`, which the caller has checked lies in the record.
        func float(at offset: Int) -> Float {
            Float(bitPattern: UInt32(truncatingIfNeeded: NoteFile.word(bytes, at: offset)))
        }

        func element(pageHeight: Int, number: Int) throws -> Read? {
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
            // A negative trail status means the tablet no longer draws the record: erased,
            // deleted by the lasso, moved (the moved copy is a later record) or replaced by
            // Real-Time Text. It is no element (community documentation, measured on
            // `realtime-text-tablet.note`, #362).
            let ending = try trail(after: pointsAt + ElementRecord.word + count * pointLength)
            guard ending.status >= 0 else { return nil }
            guard ending.number >= 1 else { throw failure("element \(number + 1) has no element number") }
            let stored = ending.number - 1
            let content: PageElement.Content
            // The kind names come first: a text box that Real-Time Text inserts carries the
            // stroke document name too (#324, device round 8).
            let named = try name(at: kindName)
            if named == values.pictureKind {
                content = .picture(png: try payload(number: number))
            } else if named == values.textBoxKind {
                content = try textBox(number: number)
            } else if named == values.headingKind {
                // A Heading's band is read from the footer (`headings()`), not as an element.
                return nil
            } else if try name(at: documentKind) == values.strokeDocument || values.shapeKinds.contains(named) {
                // A shape (the line tool, Smart Shapes, a geometry or five-star element of the
                // plugin API) is stored as a stroke is, with its own kind name and no document
                // name: its box and points are its ink (#459).
                content = .stroke(penColor: try word(at: colour), thickness: try word(at: thickness))
            } else {
                // One record of a kind the reader does not know is stepped over, never the page.
                return .unknown(named, record: stored)
            }
            let bounds: CGRect
            var outline: [[CGPoint]]?
            if case .stroke = content {
                outline = self.outline(afterTrail: ending.at)
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
            return .element(
                PageElement(
                    content: content, layer: try word(at: layer), bounds: bounds, points: points, outline: outline,
                    record: stored))
        }

        /// The start of the length-prefixed text that ends at `end`: the last place whose word
        /// equals the bytes between it and `end`.
        func text(endingAt end: Int) -> Int? {
            stride(from: end - ElementRecord.word, through: 0, by: -1).first {
                NoteFile.word(bytes, at: $0) == end - $0 - ElementRecord.word
            }
        }

        /// The decoded fields of the record's data, read from its end.
        func dataFields(number: Int) throws -> [Data] {
            let end = bytes.count - afterData
            guard end >= ElementRecord.word, let last = text(endingAt: end), let data = text(endingAt: last) else {
                throw failure("element \(number + 1) has no data")
            }
            let fields = bytes[(data + ElementRecord.word)..<last]
                .split(separator: UInt8(ascii: ","), omittingEmptySubsequences: false)
            return try fields.map { field in
                guard let decoded = Data(base64Encoded: Data(field)) else {
                    throw failure("element \(number + 1) has a data field that is not Base64")
                }
                return decoded
            }
        }

        func payload(number: Int) throws -> Data {
            let fields = try dataFields(number: number)
            guard fields.indices.contains(field.payload), !fields[field.payload].isEmpty else {
                throw failure("element \(number + 1) has no content in its data")
            }
            return fields[field.payload]
        }

        func textBox(number: Int) throws -> PageElement.Content {
            let fields = try dataFields(number: number)
            guard fields.indices.contains(field.payload),
                let text = String(data: fields[field.payload], encoding: .utf8),
                let size = Double(String(decoding: fields[field.fontSize], as: UTF8.self)), size > 0
            else {
                throw failure("element \(number + 1) has no text or font size in its data")
            }
            return .textBox(text: text, fontSize: size)
        }
    }
}
