// Cut, Copy and Paste of a selection's elements across pages and notes (#327): one pasteboard
// type of our own that holds what the tablet helper needs to insert each element again, read from
// the Mac's copy of the note. Our own model: the helper inserts the pasted elements as new
// elements, through the write path; a stroke stays a stroke, never a picture of its ink.
import CoreGraphics
import Foundation

/// One element on the clipboard, in page pixels of the page it was copied from.
public enum ClipElement: Sendable, Equatable, Codable {
    case stroke(points: [CGPoint], penColor: PenTone, thickness: Int)
    case textBox(text: String, frame: EditRect, fontSize: Int)
    /// A picture's PNG file, already in Manta greys, since it was read from a note.
    case picture(png: Data, frame: EditRect)

    /// The box the element covers.
    public var box: EditRect {
        switch self {
        case .stroke(let points, _, _): EditRect(around: points)
        case .textBox(_, let frame, _), .picture(_, let frame): frame
        }
    }

    func moved(_ dx: Int, _ dy: Int) -> ClipElement {
        switch self {
        case .stroke(let points, let penColor, let thickness):
            .stroke(
                points: points.map { CGPoint(x: $0.x + CGFloat(dx), y: $0.y + CGFloat(dy)) }, penColor: penColor,
                thickness: thickness)
        case .textBox(let text, let frame, let fontSize):
            .textBox(text: text, frame: ElementMove.offset(frame, dx, dy), fontSize: fontSize)
        case .picture(let png, let frame):
            .picture(png: png, frame: ElementMove.offset(frame, dx, dy))
        }
    }
}

/// What one Cut or Copy put on the pasteboard, or several copies gathered before a paste, as the
/// tablet's Collection gathers lassoed pieces (#249): every element keeps its place relative to
/// the others, so they land together.
public struct ElementClipping: Sendable, Equatable, Codable {
    /// The pasteboard type of our own: only this app reads it; other apps get the PNG and the
    /// recognised text the app puts beside it.
    public static let pasteboardType = "com.martonpaulo.inktools.notebookeditor.elements"

    /// Where a copy came from: the note on the tablet, by its full path, and its page from 0.
    public struct Source: Sendable, Equatable, Codable {
        public let note: String
        public let page: Int

        public init(note: String, page: Int) {
            self.note = note
            self.page = page
        }
    }

    public let elements: [ClipElement]
    /// Each copy gathered, in order.
    public let sources: [Source]

    /// One copy; nil for no element, since an empty clipping pastes nothing.
    public init?(_ elements: [ClipElement], from source: Source) {
        guard !elements.isEmpty else { return nil }
        self.elements = elements
        self.sources = [source]
    }

    private init(elements: [ClipElement], sources: [Source]) {
        self.elements = elements
        self.sources = sources
    }

    /// This clipping with `other` gathered after it: every element keeps its place on its own
    /// page, and a paste places them all as one selection.
    public func gathering(_ other: ElementClipping) -> ElementClipping {
        ElementClipping(elements: elements + other.elements, sources: sources + other.sources)
    }

    /// The box of every element.
    public var frame: EditRect {
        // A clipping always holds an element: `init` refuses none, and `init(data:)` throws.
        elements.dropFirst().reduce(elements[0].box) { $0.union($1.box) }
    }

    /// The pasteboard data of this clipping.
    public func data() throws -> Data {
        try JSONEncoder().encode(self)
    }

    /// The clipping a pasteboard holds; throws on data that is not one, or holds no element.
    public init(data: Data) throws {
        let decoded = try JSONDecoder().decode(ElementClipping.self, from: data)
        guard !decoded.elements.isEmpty else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "a clipping with no element"))
        }
        self = decoded
    }

    /// The elements placed on a page of `width` by `height` pixels: with their frame's centre at
    /// `pointer`, or at the same place when there is none, then moved onto the page at each edge.
    /// Nil when the frame is wider or taller than the page, so no element would fit.
    public func placed(at pointer: CGPoint?, width: Int, height: Int) -> [ClipElement]? {
        let box = frame
        let boxWidth = box.right - box.left
        let boxHeight = box.bottom - box.top
        guard boxWidth <= width, boxHeight <= height else { return nil }
        var left = box.left
        var top = box.top
        if let pointer {
            left = Int(pointer.x.rounded()) - boxWidth / 2
            top = Int(pointer.y.rounded()) - boxHeight / 2
        }
        left = min(max(left, 0), width - boxWidth)
        top = min(max(top, 0), height - boxHeight)
        let dx = left - box.left
        let dy = top - box.top
        return elements.map { $0.moved(dx, dy) }
    }

    /// The change that inserts `elements`, each picture written as a PNG file in `folder` for
    /// inkctl to copy to the tablet.
    public static func change(inserting elements: [ClipElement], picturesIn folder: URL) throws
        -> TabletOperation.Change
    {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return .insertElements(
            try elements.map { element in
                switch element {
                case .stroke(let points, let penColor, let thickness):
                    return .stroke(points: points, penColor: penColor, thickness: thickness)
                case .textBox(let text, let frame, let fontSize):
                    return .text(text, rect: frame, fontSize: fontSize)
                case .picture(let png, let frame):
                    let file = folder.appending(path: "paste-\(UUID().uuidString).png")
                    try png.write(to: file)
                    return .picture(file.path(percentEncoded: false), rect: frame)
                }
            })
    }
}
