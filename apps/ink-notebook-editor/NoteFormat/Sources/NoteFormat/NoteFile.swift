// Ported from supernote-tool (supernotelib/parser.py and fileformat.py, commit c1019f1),
// Copyright (c) 2020 jya, Apache License 2.0; see ../../../NOTICE.md (#261).
import Foundation

/// The `<KEY:VALUE>` pairs of one metadata block, in file order. A key can repeat.
public struct Metadata: Sendable, Equatable {
    public let pairs: [Pair]

    public struct Pair: Sendable, Equatable {
        public let key: String
        public let value: String
    }

    public init(pairs: [Pair]) {
        self.pairs = pairs
    }

    /// Parses `<KEY1:VALUE1><KEY2:VALUE2>...`, as supernotelib's `_extract_parameters` does.
    public init(text: String) {
        let pattern = /<([^:<>]+):(.*?)>/
        pairs = text.matches(of: pattern).map { Pair(key: String($0.1), value: String($0.2)) }
    }

    /// The first value of `key`, or nil.
    public subscript(key: String) -> String? {
        pairs.first { $0.key == key }?.value
    }

    /// The first value of `key` read as a byte address; nil when absent or not a number.
    public func address(_ key: String) -> Int? {
        self[key].flatMap { Int($0) }
    }
}

/// One layer of a page: its name, its encoding and where its bitmap is.
public struct Layer: Sendable, Equatable {
    public let key: String
    public let name: String
    public let encoding: String?
    public let bitmapAddress: Int
    public let type: String?
}

/// One page: its metadata and its layers, in the order of `NoteFile.layerKeys`.
public struct Page: Sendable, Equatable {
    public let metadata: Metadata
    public let layers: [Layer]

    /// The page template, such as `style_white`, or `user_...` for a custom picture.
    public var style: String? { metadata["PAGESTYLE"] }

    /// A landscape page: its stored bitmap is the page's width and height swapped.
    public var isHorizontal: Bool {
        let orientation = metadata["ORIENTATION"]
        return orientation == "1090" || orientation == "1270"
    }

    /// The layer names from top to bottom (`LAYERSEQ`); the default stack when absent.
    public var layerOrder: [String] {
        guard let sequence = metadata["LAYERSEQ"], !sequence.isEmpty else {
            return NoteFile.layerKeys
        }
        return sequence.split(separator: ",").map(String.init)
    }

    /// Which layers are shown, from `LAYERINFO`. A layer it does not name is shown.
    public var visibility: [String: Bool] {
        guard var info = metadata["LAYERINFO"], info != "none" else { return [:] }
        info = info.replacingOccurrences(of: "#", with: ":")
        let json = Data(info.utf8)
        let decoded = (try? JSONSerialization.jsonObject(with: json))
            ?? Data(base64Encoded: info).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        guard let entries = decoded as? [[String: Any]] else { return [:] }
        var shown: [String: Bool] = [:]
        for entry in entries {
            let visible = entry["isVisible"] as? Bool ?? true
            let id = entry["layerId"] as? Int ?? 0
            if entry["isBackgroundLayer"] as? Bool == true {
                shown["BGLAYER"] = visible
            } else if id == 0 {
                shown["MAINLAYER"] = visible
            } else {
                shown["LAYER\(id)"] = visible
            }
        }
        return shown
    }
}

/// A parsed `.note` file: signature, footer, header and pages. Bitmaps stay in `bytes` and are
/// decoded only when a page is drawn.
public struct NoteFile: Sendable {
    /// The layer keys of a page block, top layer first.
    public static let layerKeys = ["MAINLAYER", "LAYER1", "LAYER2", "LAYER3", "BGLAYER"]

    /// The format versions this reader was ported for, with the firmware that wrote each
    /// (supernotelib `SupernoteXParser.SN_SIGNATURES`).
    public static let knownVersions: Set<Int> = [
        20200001, 20200005, 20200006, 20200007, 20200008, 20210009, 20210010,
        20220011, 20220013, 20230014, 20230015, 20260016,
    ]

    /// The first version that stores anti-aliased greys (supernotelib `supports_highres_grayscale`).
    static let firstGreyscaleVersion = 20230015

    static let fileTypeLength = 4
    static let signaturePrefix = "SN_FILE_VER_"
    static let versionDigits = 8
    static let wordSize = 4

    public let bytes: [UInt8]
    /// The file type in the first 4 bytes: `note` or `mark`.
    public let fileType: String
    public let version: Int
    public let header: Metadata
    public let footer: Metadata
    public let pages: [Page]

    public init(data: Data) throws {
        try self.init(bytes: [UInt8](data))
    }

    public init(bytes: [UInt8]) throws {
        self.bytes = bytes
        let signatureEnd = Self.fileTypeLength + Self.signaturePrefix.count + Self.versionDigits
        guard bytes.count > signatureEnd + Self.wordSize,
              let signature = String(bytes: bytes[Self.fileTypeLength..<signatureEnd], encoding: .ascii),
              signature.hasPrefix(Self.signaturePrefix),
              let version = Int(signature.dropFirst(Self.signaturePrefix.count)),
              Self.knownVersions.contains(version)
        else {
            let start = String(decoding: bytes.prefix(signatureEnd), as: UTF8.self)
            throw NoteFormatError.unsupportedVersion(start.isEmpty ? "an empty file" : start)
        }
        fileType = String(decoding: bytes.prefix(Self.fileTypeLength), as: UTF8.self)
        self.version = version

        let footerAddress = Self.word(bytes, at: bytes.count - Self.wordSize)
        guard footerAddress > signatureEnd, footerAddress < bytes.count - Self.wordSize else {
            throw NoteFormatError.badFooter("its address \(footerAddress) is outside the file")
        }
        footer = try Self.metadata(bytes, at: footerAddress)
        guard let headerAddress = footer.address("FILE_FEATURE") else {
            throw NoteFormatError.badFooter("it names no header")
        }
        header = try Self.metadata(bytes, at: headerAddress)

        let pageAddresses = footer.pairs
            .compactMap { pair -> (Int, Int)? in
                guard pair.key.hasPrefix("PAGE"), let number = Int(pair.key.dropFirst(4)),
                      let address = Int(pair.value) else { return nil }
                return (number, address)
            }
            .sorted { $0.0 < $1.0 }
            .map(\.1)
        guard !pageAddresses.isEmpty else {
            throw NoteFormatError.badFooter("it lists no page")
        }
        pages = try pageAddresses.map { try Self.page(bytes, at: $0) }
    }

    /// The page size in pixels, portrait: Manta (`N5`) 1920 x 2560, else 1404 x 1872.
    public var pageSize: (width: Int, height: Int) {
        header["APPLY_EQUIPMENT"] == "N5" ? (1920, 2560) : (1404, 1872)
    }

    /// Whether greys are stored with the X2 colour codes.
    public var storesGreyscale: Bool { version >= Self.firstGreyscaleVersion }

    /// The content of the length-prefixed block at `address`.
    public func block(at address: Int) throws -> ArraySlice<UInt8> {
        try Self.block(bytes, at: address)
    }

    static func word(_ bytes: [UInt8], at offset: Int) -> Int {
        (0..<wordSize).reduce(0) { $0 | Int(bytes[offset + $1]) << (8 * $1) }
    }

    static func block(_ bytes: [UInt8], at address: Int) throws -> ArraySlice<UInt8> {
        guard address >= 0, address + wordSize <= bytes.count else {
            throw NoteFormatError.blockOutOfRange(address: address)
        }
        let length = word(bytes, at: address)
        let start = address + wordSize
        guard length <= bytes.count - start else {
            throw NoteFormatError.blockOutOfRange(address: address)
        }
        return bytes[start..<(start + length)]
    }

    static func metadata(_ bytes: [UInt8], at address: Int) throws -> Metadata {
        guard address != 0 else { return Metadata(pairs: []) }
        return Metadata(text: String(decoding: try block(bytes, at: address), as: UTF8.self))
    }

    static func page(_ bytes: [UInt8], at address: Int) throws -> Page {
        let info = try metadata(bytes, at: address)
        var layers: [Layer] = []
        var sawMainLayer = false
        for key in layerKeys {
            guard let layerAddress = info.address(key), layerAddress != 0 else { continue }
            let layer = try metadata(bytes, at: layerAddress)
            var name = layer["LAYERNAME"] ?? key
            // supernotelib WorkaroundPageWrapper: a second MAINLAYER is the background.
            if name == "MAINLAYER" {
                if sawMainLayer { name = "BGLAYER" }
                sawMainLayer = true
            }
            layers.append(Layer(
                key: key, name: name, encoding: layer["LAYERPROTOCOL"],
                bitmapAddress: layer.address("LAYERBITMAP") ?? 0, type: layer["LAYERTYPE"]))
        }
        return Page(metadata: info, layers: layers)
    }
}
