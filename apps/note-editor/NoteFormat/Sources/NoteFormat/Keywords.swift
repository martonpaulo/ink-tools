// The note's keywords, made with the tablet's lasso «K» or typed in its keyword dialog (#346).
import Foundation

/// One keyword: its page, its text, and the box of the ink it was made from, if any.
public struct Keyword: Sendable, Equatable {
    public let page: Int
    public let text: String
    /// nil for a keyword whose text was typed in the dialog: the tablet stores `0,0,0,0`.
    public let box: PageRect?

    public init(page: Int, text: String, box: PageRect?) {
        self.page = page
        self.text = text
        self.box = box
    }
}

extension NoteFile {
    /// The footer names each keyword `KEYWORD_` with its page number of four digits, counted from 1,
    /// and the top of its box; the value is the address of its block. Two keywords can share one key
    /// (measured on the Manta, 2026-11-27), so the footer is read as a list, never a dictionary.
    static let keywordKeyPrefix = "KEYWORD_"

    /// Every keyword, by page, then in the footer's order. A keyword block that cannot be read
    /// throws `badKeyword`, never a missing keyword.
    public func keywords() throws -> [Keyword] {
        let found = try footer.pairs.compactMap { pair -> Keyword? in
            guard pair.key.hasPrefix(Self.keywordKeyPrefix) else { return nil }
            let digits = pair.key.dropFirst(Self.keywordKeyPrefix.count).prefix(NoteWriter.pageNumberDigits)
            guard let number = Int(digits), number >= 1, let address = Int(pair.value) else {
                throw NoteFormatError.badKeyword("its footer key \(pair.key) names no page")
            }
            let block = try Self.metadata(bytes, at: address)
            let rect = block["KEYWORDRECT"]?.split(separator: ",").compactMap { Int($0) }
            guard let rect, rect.count == 4, let site = block.address("KEYWORDSITE") else {
                throw NoteFormatError.badKeyword("the block at byte \(address) lacks its box or its text")
            }
            guard let text = String(bytes: try self.block(at: site), encoding: .utf8), !text.isEmpty else {
                throw NoteFormatError.badKeyword("the text at byte \(site) is not UTF-8")
            }
            guard pages.indices.contains(number - 1) else { throw NoteFormatError.badPage(number - 1) }
            let box =
                rect[2] > 0 && rect[3] > 0
                ? PageRect(x: rect[0], y: rect[1], width: rect[2], height: rect[3]) : nil
            return Keyword(page: number - 1, text: text, box: box)
        }
        // A stable sort keeps the footer's order within a page.
        return found.enumerated().sorted { ($0.element.page, $0.offset) < ($1.element.page, $1.offset) }.map(\.element)
    }
}
