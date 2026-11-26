// The note's Headings, made with the tablet's lasso (#331).
import Foundation

/// One Heading: its page, its level, and its box in page pixels from the top left.
public struct Heading: Sendable, Equatable {
    public let page: Int
    /// 1 is the top level.
    public let level: Int
    public let box: PageRect
    /// The address of the picture of the handwriting the Heading covers.
    let bitmapAddress: Int
    let encoding: String?

    public init(page: Int, level: Int, box: PageRect, bitmapAddress: Int, encoding: String?) {
        self.page = page
        self.level = level
        self.box = box
        self.bitmapAddress = bitmapAddress
        self.encoding = encoding
    }
}

extension NoteFile {
    /// The footer names each Heading `TITLE_` with its page number of four digits, counted from 1,
    /// and its place on the page; the value is the address of its block.
    static let headingKeyPrefix = "TITLE_"

    /// Every Heading, by page, then from the top of the page. A Heading block that cannot be read
    /// throws `badHeading`, never a missing Heading.
    /// shortcut: the block's keys were read on one Heading of a Manta note and from supernotelib's
    /// footer keys; the device round makes a note with a Heading of each level a fixture.
    public func headings() throws -> [Heading] {
        try footer.pairs.compactMap { pair -> Heading? in
            guard pair.key.hasPrefix(Self.headingKeyPrefix) else { return nil }
            let digits = pair.key.dropFirst(Self.headingKeyPrefix.count).prefix(NoteWriter.pageNumberDigits)
            guard let number = Int(digits), number >= 1, let address = Int(pair.value) else {
                throw NoteFormatError.badHeading("its footer key \(pair.key) names no page")
            }
            let block = try Self.metadata(bytes, at: address)
            let rect = (block["TITLERECTORI"] ?? block["TITLERECT"])?.split(separator: ",").compactMap { Int($0) }
            guard let level = block["TITLELEVEL"].flatMap({ Int($0) }), let rect, rect.count == 4,
                rect[2] > 0, rect[3] > 0, let bitmap = block.address("TITLEBITMAP")
            else { throw NoteFormatError.badHeading("the block at byte \(address) lacks its level, box or picture") }
            guard pages.indices.contains(number - 1) else { throw NoteFormatError.badPage(number - 1) }
            return Heading(
                page: number - 1, level: level, box: PageRect(x: rect[0], y: rect[1], width: rect[2], height: rect[3]),
                bitmapAddress: bitmap, encoding: block["TITLEPROTOCOL"])
        }
        .sorted { ($0.page, $0.box.y, $0.box.x) < ($1.page, $1.box.y, $1.box.x) }
    }

    /// The picture of the handwriting under `heading`, as large as its box; what no ink covers is
    /// `Grey.transparent`, which draws as the page's white.
    public func image(of heading: Heading) throws -> PageBitmap {
        guard heading.encoding == Self.rleEncoding else {
            throw NoteFormatError.unknownProtocol(heading.encoding ?? "none")
        }
        let pixels = try RattaRLE.decode(
            try block(at: heading.bitmapAddress), width: heading.box.width, height: heading.box.height,
            greyscale: storesGreyscale)
        return PageBitmap(width: heading.box.width, height: heading.box.height, pixels: pixels)
    }
}
