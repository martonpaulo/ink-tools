// Find in Note (#322) and the reading order Copy as Text uses (#323), over the note's word index.
import CoreGraphics
import Foundation

/// The words of a page in reading order: lines from top to bottom, each from left to right.
public enum ReadingOrder {
    /// The share of a word's height that must overlap a line's band for the word to join it.
    static let sameLine = 0.5

    /// `words` of one page grouped into lines, each line's words left to right.
    public static func lines(_ words: [IndexedWord]) -> [[IndexedWord]] {
        var lines: [(band: ClosedRange<CGFloat>, words: [IndexedWord])] = []
        for word in words.sorted(by: { $0.box.midY < $1.box.midY }) {
            let band = word.box.minY...word.box.maxY
            if let index = lines.firstIndex(where: { overlap(band, $0.band) >= sameLine * word.box.height }) {
                lines[index].words.append(word)
                let line = lines[index].band
                lines[index].band = min(line.lowerBound, band.lowerBound)...max(line.upperBound, band.upperBound)
            } else {
                lines.append((band, [word]))
            }
        }
        return lines.sorted { $0.band.lowerBound < $1.band.lowerBound }
            .map { $0.words.sorted { $0.box.minX < $1.box.minX } }
    }

    /// Every word of `words`, page by page, each page in reading order.
    public static func sorted(_ words: [IndexedWord]) -> [IndexedWord] {
        Dictionary(grouping: words, by: \.page).sorted { $0.key < $1.key }.flatMap { lines($0.value).joined() }
    }

    /// The text of `words`: a page's lines one per line, words split by a space, pages by a blank line.
    public static func text(_ words: [IndexedWord]) -> String {
        Dictionary(grouping: words, by: \.page).sorted { $0.key < $1.key }
            .map { page in lines(page.value).map { $0.map(\.text).joined(separator: " ") }.joined(separator: "\n") }
            .joined(separator: "\n\n")
    }

    static func overlap(_ a: ClosedRange<CGFloat>, _ b: ClosedRange<CGFloat>) -> CGFloat {
        max(0, min(a.upperBound, b.upperBound) - max(a.lowerBound, b.lowerBound))
    }
}

/// One place a query was found: its page and the box around the matching words.
public struct FindMatch: Sendable, Equatable {
    public let page: Int
    public let box: CGRect

    public init(page: Int, box: CGRect) {
        self.page = page
        self.box = box
    }
}

/// The matches of a query in the open note, and which one is current.
public struct NoteSearch: Sendable, Equatable {
    public private(set) var query = ""
    public private(set) var matches: [FindMatch] = []
    /// The current match, from 0; nil with no match.
    public private(set) var current: Int?

    public init() {}

    /// Finds `query` in `words`, with case and diacritics folded, in page and reading order. A
    /// query of several words matches those words in a row on one line. The first match becomes
    /// current.
    public mutating func find(_ query: String, in words: [IndexedWord]) {
        self.query = query
        matches = Self.matches(query, in: words)
        current = matches.isEmpty ? nil : 0
    }

    public mutating func next() {
        guard let current, !matches.isEmpty else { return }
        self.current = (current + 1) % matches.count
    }

    public mutating func previous() {
        guard let current, !matches.isEmpty else { return }
        self.current = (current - 1 + matches.count) % matches.count
    }

    public var currentMatch: FindMatch? { current.map { matches[$0] } }

    static func matches(_ query: String, in words: [IndexedWord]) -> [FindMatch] {
        let wanted = IndexedWord.fold(query).split(whereSeparator: \.isWhitespace).map(String.init)
        guard !wanted.isEmpty else { return [] }
        var found: [FindMatch] = []
        for page in Dictionary(grouping: words, by: \.page).sorted(by: { $0.key < $1.key }) {
            for line in ReadingOrder.lines(page.value) {
                let folded = line.map(\.folded)
                guard folded.count >= wanted.count else { continue }
                for start in 0...(folded.count - wanted.count) where Self.matches(wanted, folded[start...]) {
                    let run = line[start..<(start + wanted.count)]
                    let box = run.dropFirst().reduce(line[start].box) { $0.union($1.box) }
                    found.append(FindMatch(page: page.key, box: box))
                }
            }
        }
        return found
    }

    /// One query word matches inside a word; several match a run: the first ends the word it is
    /// in, the middle ones are whole words, the last starts its word.
    static func matches(_ wanted: [String], _ words: ArraySlice<String>) -> Bool {
        let words = Array(words)
        guard wanted.count > 1 else { return words[0].contains(wanted[0]) }
        for (index, part) in wanted.enumerated() {
            let word = words[index]
            let ok =
                index == 0
                ? word.hasSuffix(part) : index == wanted.count - 1 ? word.hasPrefix(part) : word == part
            if !ok { return false }
        }
        return true
    }
}
