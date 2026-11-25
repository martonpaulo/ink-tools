import Foundation
import Testing
@testable import NoteFormat

/// Writes a synthetic `.note` file: the signature, length-prefixed blocks, the footer and its
/// address in the last 4 bytes, as the format lays them out.
struct NoteBuilder {
    var bytes: [UInt8]

    init(version: String = "20230015") {
        bytes = Array("noteSN_FILE_VER_\(version)".utf8)
    }

    /// Appends a block and returns its address.
    mutating func block(_ content: [UInt8], declaredLength: Int? = nil) -> Int {
        let address = bytes.count
        let length = declaredLength ?? content.count
        bytes += (0..<4).map { UInt8((length >> (8 * $0)) & 0xff) }
        bytes += content
        return address
    }

    mutating func metadata(_ pairs: [(String, String)]) -> Int {
        block(Array(pairs.map { "<\($0.0):\($0.1)>" }.joined().utf8))
    }

    /// Finishes the file with a footer naming the header and the pages.
    mutating func finish(header: Int, pages: [Int], footerAddress: Int? = nil) -> [UInt8] {
        var pairs = [("FILE_FEATURE", String(header))]
        for (index, page) in pages.enumerated() {
            pairs.append((String(format: "PAGE%d", index + 1), String(page)))
        }
        let footer = metadata(pairs)
        let address = footerAddress ?? footer
        bytes += (0..<4).map { UInt8((address >> (8 * $0)) & 0xff) }
        return bytes
    }
}

/// Encodes grey codes as runs of at most 128, the plain form of RATTA_RLE.
func encodeRuns(_ codes: [UInt8]) -> [UInt8] {
    var out: [UInt8] = []
    var index = 0
    while index < codes.count {
        var run = 1
        while run < 128, index + run < codes.count, codes[index + run] == codes[index] { run += 1 }
        out += [codes[index], UInt8(run - 1)]
        index += run
    }
    return out
}

let width = 1404
let height = 1872
let squareOrigin = 10
let squareSide = 4

/// A page whose main layer holds a black square on transparent, over a white background.
func samplePage(_ builder: inout NoteBuilder, layerInfo: String? = nil, style: String = "style_lined")
    -> Int
{
    var main = [UInt8](repeating: 0x62, count: width * height)
    for y in squareOrigin..<(squareOrigin + squareSide) {
        for x in squareOrigin..<(squareOrigin + squareSide) { main[y * width + x] = 0x61 }
    }
    let mainBitmap = builder.block(encodeRuns(main))
    let backgroundBitmap = builder.block(encodeRuns([UInt8](repeating: 0x65, count: width * height)))
    let mainLayer = builder.metadata([
        ("LAYERNAME", "MAINLAYER"), ("LAYERPROTOCOL", "RATTA_RLE"), ("LAYERBITMAP", String(mainBitmap)),
    ])
    let backgroundLayer = builder.metadata([
        ("LAYERNAME", "BGLAYER"), ("LAYERPROTOCOL", "RATTA_RLE"),
        ("LAYERBITMAP", String(backgroundBitmap)),
    ])
    var pairs = [
        ("PAGESTYLE", style), ("LAYERSEQ", "MAINLAYER,BGLAYER"),
        ("MAINLAYER", String(mainLayer)), ("LAYER1", "0"), ("BGLAYER", String(backgroundLayer)),
    ]
    if let layerInfo { pairs.append(("LAYERINFO", layerInfo)) }
    return builder.metadata(pairs)
}

func sampleNote(layerInfo: String? = nil) -> [UInt8] {
    var builder = NoteBuilder()
    let header = builder.metadata([("FILE_TYPE", "NOTE"), ("APPLY_EQUIPMENT", "N6")])
    let first = samplePage(&builder, layerInfo: layerInfo)
    let second = samplePage(&builder, style: "style_white")
    return builder.finish(header: header, pages: [first, second])
}

@Suite struct NoteFileTests {
    @Test func testParsesHeaderAndFooter() throws {
        let note = try NoteFile(bytes: sampleNote())
        #expect(note.fileType == "note")
        #expect(note.version == 20230015)
        #expect(note.storesGreyscale)
        #expect(note.header["FILE_TYPE"] == "NOTE")
        #expect(note.pageSize == (width, height))
        #expect(note.pages.count == 2)
        #expect(note.pages[0].style == "style_lined")
        #expect(note.pages[1].style == "style_white")
        #expect(note.pages[0].layers.map(\.name) == ["MAINLAYER", "BGLAYER"])
    }

    @Test func testMetadataKeepsRepeatedKeys() {
        let metadata = Metadata(text: "<A:1><B:x:y><A:2>")
        #expect(metadata.pairs.map(\.key) == ["A", "B", "A"])
        #expect(metadata["A"] == "1")
        #expect(metadata["B"] == "x:y")
    }

    @Test func testUnknownVersionFails() {
        var builder = NoteBuilder(version: "20990099")
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let bytes = builder.finish(header: header, pages: [header])
        #expect(throws: NoteFormatError.unsupportedVersion("noteSN_FILE_VER_20990099")) {
            try NoteFile(bytes: bytes)
        }
    }

    @Test func testEmptyFileFails() {
        #expect(throws: NoteFormatError.unsupportedVersion("an empty file")) {
            try NoteFile(bytes: [])
        }
    }

    @Test func testFooterPastEndFails() {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let bytes = builder.finish(header: header, pages: [header], footerAddress: 1 << 30)
        #expect(throws: NoteFormatError.badFooter("its address \(1 << 30) is outside the file")) {
            try NoteFile(bytes: bytes)
        }
    }

    @Test func testFooterWithoutPagesFails() {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let bytes = builder.finish(header: header, pages: [])
        #expect(throws: NoteFormatError.badFooter("it lists no page")) { try NoteFile(bytes: bytes) }
    }

    @Test func testTruncatedLayerFails() throws {
        var builder = NoteBuilder()
        let header = builder.metadata([("FILE_TYPE", "NOTE")])
        let bitmap = builder.block([0x61, 0x00], declaredLength: 1 << 20)
        let layer = builder.metadata([
            ("LAYERNAME", "MAINLAYER"), ("LAYERPROTOCOL", "RATTA_RLE"), ("LAYERBITMAP", String(bitmap)),
        ])
        let page = builder.metadata([("MAINLAYER", String(layer)), ("LAYERSEQ", "MAINLAYER")])
        let note = try NoteFile(bytes: builder.finish(header: header, pages: [page]))
        #expect(throws: NoteFormatError.blockOutOfRange(address: bitmap)) { try note.render(page: 0) }
    }

    @Test func testRendersLayersOnWhite() throws {
        let image = try NoteFile(bytes: sampleNote()).render(page: 0)
        #expect(image.width == width && image.height == height)
        #expect(image.pixels[squareOrigin * width + squareOrigin] == RattaRLE.Grey.black)
        #expect(image.pixels[0] == RattaRLE.Grey.white)
        #expect(image.pixels.filter { $0 == RattaRLE.Grey.black }.count == squareSide * squareSide)
    }

    @Test func testHiddenLayerSkipped() throws {
        let info = ##"[{"layerId"#0,"isBackgroundLayer"#false,"isVisible"#false},{"layerId"#0,"isBackgroundLayer"#true,"isVisible"#true}]"##
        let image = try NoteFile(bytes: sampleNote(layerInfo: info)).render(page: 0)
        #expect(!image.pixels.contains(RattaRLE.Grey.black))
        #expect(image.pixels[0] == RattaRLE.Grey.white)
    }

    @Test func testMissingPageFails() throws {
        let note = try NoteFile(bytes: sampleNote())
        #expect(throws: NoteFormatError.badPage(2)) { try note.render(page: 2) }
    }

    @Test func testPNGRoundTrip() throws {
        let image = try NoteFile(bytes: sampleNote()).render(page: 0)
        let png = try #require(image.pngData())
        let read = try PageBitmap(imageData: png)
        #expect(read == image)
        #expect(read.differingShare(from: image, threshold: 16) == 0)
    }

    @Test func testDifferingShare() {
        let white = PageBitmap(width: 2, height: 2, pixels: [255, 255, 255, 255])
        let marked = PageBitmap(width: 2, height: 2, pixels: [0, 250, 255, 255])
        #expect(white.differingShare(from: marked, threshold: 16) == 0.25)
        #expect(white.differingShare(from: PageBitmap(width: 1, height: 4, pixels: [255, 255, 255, 255]), threshold: 16) == nil)
    }
}

@Suite struct RattaRLETests {
    @Test func testRunLengths() throws {
        // A held long run joined with the next pair of the same code: 1 + 5 + (2 << 7) = 262.
        let joined = try RattaRLE.decode([0x61, 0x81, 0x61, 0x05, 0x65, 0x25], width: 300, height: 1, greyscale: false)
        #expect(joined.prefix(262).allSatisfy { $0 == RattaRLE.Grey.black })
        #expect(joined.suffix(38).allSatisfy { $0 == RattaRLE.Grey.white })
        // A held run followed by another code stands alone: (0 + 1) << 7 = 128.
        let alone = try RattaRLE.decode([0x61, 0x80, 0x65, 0x00], width: 129, height: 1, greyscale: false)
        #expect(alone.filter { $0 == RattaRLE.Grey.black }.count == 128)
        // The long-run marker.
        let long = try RattaRLE.decode([0x62, 0xff], width: 0x4000, height: 1, greyscale: false)
        #expect(long.allSatisfy { $0 == RattaRLE.Grey.transparent })
    }

    @Test func testTailFitsThePage() throws {
        // A held run at the end shrinks to the largest run that fits: (1 + 1) << 5 = 64.
        let tail = try RattaRLE.decode([0x65, 0x81], width: 64, height: 1, greyscale: false)
        #expect(tail.count == 64)
    }

    @Test func testGreyscaleCodes() throws {
        let codes: [UInt8] = [0x9d, 0x00, 0x63, 0x00, 0x42, 0x00]
        #expect(try RattaRLE.decode(codes[...], width: 3, height: 1, greyscale: true) == [0x9d, 0x30, 0x42])
        #expect(try RattaRLE.decode([0x63, 0x00, 0x64, 0x00], width: 2, height: 1, greyscale: false) == [0x9d, 0xc9])
    }

    @Test func testShortBitmapFails() {
        #expect(throws: NoteFormatError.badBitmapLength(expected: 10, got: 2)) {
            try RattaRLE.decode([0x61, 0x01], width: 10, height: 1, greyscale: false)
        }
    }

    @Test func testLongBitmapFails() {
        #expect(throws: NoteFormatError.badBitmapLength(expected: 10, got: 0x4000)) {
            try RattaRLE.decode([0x61, 0xff], width: 10, height: 1, greyscale: false)
        }
    }

    @Test func testBlankWhitePage() throws {
        let blank = try RattaRLE.decode([0x62, 0xff], width: 0x400, height: 1, blankPage: true, greyscale: false)
        #expect(blank.count == 0x400)
    }
}
