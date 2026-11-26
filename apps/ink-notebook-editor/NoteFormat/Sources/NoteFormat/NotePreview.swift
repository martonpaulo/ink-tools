// What the editor draws while an add or a delete of a page is on its way to the tablet (#329).
// Each call returns an in-memory copy for drawing only: it is never written to a file or sent,
// as the tablet applies those edits itself.
import Foundation

public enum NotePreview {
    /// The page blocks an added page starts without: its strokes, elements, text and text boxes.
    static let emptyBlocks = NoteDiff.pageBlocks

    /// The note with a page of no ink at `index` (from 0, up to the page count), on the template of
    /// page `source`: its template layer and its orientation, and none of its ink or elements.
    /// Titles, keywords and links of the pages from `index` on keep their pages.
    public static func insertingPage(_ file: NoteFile, at index: Int, like source: Int) throws -> NoteFile {
        guard (0...file.pages.count).contains(index) else { throw NoteFormatError.badPage(index) }
        guard file.pages.indices.contains(source) else { throw NoteFormatError.badPage(source) }
        let page = file.pages[source]
        let background = page.layers.first { $0.name == NoteFile.backgroundLayer }?.key
        let pairs = page.metadata.pairs.map { pair -> Metadata.Pair in
            let ink = NoteFile.layerKeys.contains(pair.key) && pair.key != background
            if ink || emptyBlocks.contains(pair.key) { return Metadata.Pair(key: pair.key, value: "0") }
            if pair.key == "PAGEID" { return Metadata.Pair(key: pair.key, value: "\(pair.value)-added-\(index)") }
            return pair
        }
        var out = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        let address = out.count
        out += NoteWriter.lengthPrefixed(NoteWriter.text(pairs))
        var addresses = try NoteWriter.pageAddresses(file)
        addresses.insert(address, at: index)
        let bytes = try footer(file, prefix: out, addresses: addresses) { number in
            number > index ? number + 1 : number
        }
        return try NoteFile(bytes: bytes)
    }

    /// The note without page `index` (from 0); its titles, keywords and links go with it, and the
    /// later pages' keep their pages. The last page is never removed.
    public static func removingPage(_ file: NoteFile, at index: Int) throws -> NoteFile {
        guard file.pages.indices.contains(index), file.pages.count > 1 else { throw NoteFormatError.badPage(index) }
        var addresses = try NoteWriter.pageAddresses(file)
        addresses.remove(at: index)
        let prefix = Array(file.bytes[..<NoteWriter.footerAddress(file)])
        let bytes = try footer(file, prefix: prefix, addresses: addresses) { number in
            number == index + 1 ? nil : number > index + 1 ? number - 1 : number
        }
        return try NoteFile(bytes: bytes)
    }

    /// `prefix` with a footer listing `addresses` as the pages, in order, where the first page pair
    /// stood; each page key's number (from 1) becomes `renumber`'s, or leaves on nil.
    static func footer(
        _ file: NoteFile, prefix: [UInt8], addresses: [Int], renumber: (Int) -> Int?
    ) throws -> [UInt8] {
        var pairs: [Metadata.Pair] = []
        var pagesWritten = false
        for pair in file.footer.pairs {
            if NoteWriter.pageNumber(of: pair.key) != nil {
                guard !pagesWritten else { continue }
                pagesWritten = true
                pairs += addresses.enumerated().map {
                    Metadata.Pair(key: "PAGE\($0.offset + 1)", value: String($0.element))
                }
            } else if let (prefix, number) = NoteWriter.pageKeyNumber(pair.key) {
                guard let moved = renumber(number) else { continue }
                let rest = pair.key.dropFirst(prefix.count + NoteWriter.pageNumberDigits)
                pairs.append(Metadata.Pair(key: prefix + String(format: "%04d", moved) + rest, value: pair.value))
            } else {
                pairs.append(pair)
            }
        }
        return try NoteWriter.withFooter(file, prefix: prefix, pairs: pairs)
    }
}
