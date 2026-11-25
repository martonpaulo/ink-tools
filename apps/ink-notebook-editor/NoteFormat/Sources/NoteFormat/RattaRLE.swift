// Ported from supernote-tool (supernotelib/decoder.py and color.py, commit c1019f1),
// Copyright (c) 2020 jya, Apache License 2.0; see ../../../NOTICE.md (#261).

/// The run-length encoding of a layer bitmap (`LAYERPROTOCOL` `RATTA_RLE`), decoded to one
/// grey byte per pixel, with `Grey.transparent` where the layer shows what is under it.
public enum RattaRLE {
    /// The grey values a decoded layer holds (supernotelib's default grey palette).
    public enum Grey {
        public static let black: UInt8 = 0x00
        public static let darkGray: UInt8 = 0x9d
        public static let gray: UInt8 = 0xc9
        public static let white: UInt8 = 0xfe
        public static let transparent: UInt8 = 0xff
        static let darkGrayCompat: UInt8 = 0x30
        static let grayCompat: UInt8 = 0x50
    }

    /// The colour codes of files before `firstGreyscaleVersion`.
    static let codes: [UInt8: UInt8] = [
        0x61: Grey.black, 0x62: Grey.transparent, 0x63: Grey.darkGray, 0x64: Grey.gray,
        0x65: Grey.white, 0x66: Grey.black, 0x67: Grey.darkGray, 0x68: Grey.gray,
    ]

    /// The colour codes of greyscale files: four codes moved, the old two mean compat greys, and
    /// any other code is an anti-aliased grey whose value is the code itself.
    static let greyscaleCodes: [UInt8: UInt8] = [
        0x61: Grey.black, 0x62: Grey.transparent, 0x9d: Grey.darkGray, 0xc9: Grey.gray,
        0x65: Grey.white, 0x66: Grey.black, 0x9e: Grey.darkGray, 0xca: Grey.gray,
        0x63: Grey.darkGrayCompat, 0x64: Grey.grayCompat,
    ]

    static let longRunMarker: UInt8 = 0xff
    static let longRun = 0x4000
    static let longRunOfBlankPage = 0x400
    static let continuation: UInt8 = 0x80
    static let lowBits = 0x7f
    static let continuationShift = 7
    static let tailShifts = 8

    /// Decodes `data` into `width * height` grey bytes.
    ///
    /// - Parameters:
    ///   - blankPage: the background of a `style_white` page stored as the short blank block,
    ///     whose long runs are `longRunOfBlankPage` pixels.
    ///   - greyscale: the file stores the X2 colour codes (`NoteFile.storesGreyscale`).
    public static func decode(
        _ data: ArraySlice<UInt8>, width: Int, height: Int, blankPage: Bool = false,
        greyscale: Bool
    ) throws -> [UInt8] {
        let expected = width * height
        let table = greyscale ? greyscaleCodes : codes
        var pixels: [UInt8] = []
        pixels.reserveCapacity(expected)

        func emit(_ code: UInt8, _ length: Int) throws {
            guard pixels.count + length <= expected else {
                throw NoteFormatError.badBitmapLength(expected: expected, got: pixels.count + length)
            }
            pixels.append(contentsOf: repeatElement(table[code] ?? code, count: length))
        }

        var held: (code: UInt8, length: UInt8)?
        var index = data.startIndex
        while index + 1 < data.endIndex {
            let code = data[index]
            let length = data[index + 1]
            index += 2
            if let previous = held {
                held = nil
                let previousRun = (Int(previous.length) & lowBits) + 1
                if code == previous.code {
                    try emit(code, 1 + Int(length) + (previousRun << continuationShift))
                    continue
                }
                try emit(previous.code, previousRun << continuationShift)
            }
            if length == longRunMarker {
                try emit(code, blankPage ? longRunOfBlankPage : longRun)
            } else if length & continuation != 0 {
                held = (code, length)
            } else {
                try emit(code, Int(length) + 1)
            }
        }
        if let tail = held {
            // supernotelib `_adjust_tail_length`: the largest run that still fits the page.
            let gap = expected - pixels.count
            for shift in stride(from: tailShifts - 1, through: 0, by: -1) {
                let run = ((Int(tail.length) & lowBits) + 1) << shift
                if run <= gap {
                    try emit(tail.code, run)
                    break
                }
            }
        }
        guard pixels.count == expected else {
            throw NoteFormatError.badBitmapLength(expected: expected, got: pixels.count)
        }
        return pixels
    }
    /// The codes `encode` writes for the greys `decode` returns; any other grey is its own code.
    static let encodeCodes = (0...255).map { code(for: UInt8($0), greyscale: false) }
    static let greyscaleEncodeCodes = (0...255).map { code(for: UInt8($0), greyscale: true) }

    static func code(for grey: UInt8, greyscale: Bool) -> UInt8 {
        let table = greyscale ? greyscaleCodes : codes
        // The first code of each grey, in the order the tables list black, transparent and white.
        let preferred: [UInt8] = greyscale
            ? [0x61, 0x62, 0x9d, 0xc9, 0x65, 0x63, 0x64] : [0x61, 0x62, 0x63, 0x64, 0x65]
        if let found = preferred.first(where: { table[$0] == grey }) { return found }
        // A grey that is itself a table code would decode as another grey: the nearest that is not.
        var value = grey
        while table[value] != nil { value = value < 0x80 ? value + 1 : value - 1 }
        return value
    }

    /// Encodes `width * height` grey bytes, as `decode` reads them back (#263). Runs longer than
    /// 128 pixels are a held pair plus a pair of the same code; runs of `longRun` use its marker.
    /// A grey that only an older file stores, or that collides with a colour code, comes back as
    /// the nearest grey `decode` returns.
    public static func encode(_ pixels: [UInt8], greyscale: Bool) -> [UInt8] {
        var out: [UInt8] = []
        func emitRun(_ code: UInt8, _ count: Int) {
            var left = count
            while left > longRun {
                out += [code, longRunMarker]
                left -= longRun
            }
            if left <= lowBits + 1 {
                out += [code, UInt8(left - 1)]
            } else {
                // decode: 1 + length + (held + 1) << 7, with held at most 126 so it is never 0xff.
                let high = (left - 1) >> continuationShift
                let low = (left - 1) & lowBits
                out += [code, continuation | UInt8(high - 1), code, UInt8(low)]
            }
        }
        let codes = greyscale ? greyscaleEncodeCodes : encodeCodes
        var index = 0
        while index < pixels.count {
            let code = codes[Int(pixels[index])]
            var end = index + 1
            while end < pixels.count, codes[Int(pixels[end])] == code { end += 1 }
            emitRun(code, end - index)
            index = end
        }
        return out
    }
}
