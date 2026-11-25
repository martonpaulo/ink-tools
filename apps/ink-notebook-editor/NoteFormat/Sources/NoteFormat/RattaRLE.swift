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
}
