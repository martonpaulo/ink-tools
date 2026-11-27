// Re-targeting an edit when the tablet's note moved on (#317): an operation names pages by place
// and elements by their numbers on the page, both of which shift when the owner writes on the
// tablet after the Mac's copy was read. Pure: the outlines come from the app layer, which reads
// the notes.
import Foundation

/// A note's pages as a re-target reads them: each page's `PAGEID` and the box of each element by
/// its number on the page, from 1 (the tablet's numbering: the record's place plus one, #325).
public struct NoteOutline: Sendable, Equatable {
    public struct Page: Sendable, Equatable {
        /// nil for a page with no `PAGEID`, which is never found in another note.
        public let id: String?
        public let boxes: [Int: EditRect]

        public init(id: String?, boxes: [Int: EditRect]) {
            self.id = id
            self.boxes = boxes
        }
    }

    public let pages: [Page]

    public init(pages: [Page]) {
        self.pages = pages
    }

    /// The place of the page with `id`, from 0; nil when the note has none.
    func place(of id: String?) -> Int? {
        guard let id else { return nil }
        return pages.firstIndex { $0.id == id }
    }
}

extension TabletOperation {
    /// This operation, made on `base`, aimed at the same pages and elements of `current`, the note
    /// as the tablet holds it now; nil when a target cannot be found exactly once, so the caller
    /// keeps both copies instead of guessing. A page is found by its id; an element by its box,
    /// which must be on the same page of `current` once and only once.
    public func retargeted(base: NoteOutline, current: NoteOutline) -> TabletOperation? {
        // A place at the end of the note has no page id to follow: it stays at the end.
        func place(_ old: Int) -> Int? {
            if old == base.pages.count { return current.pages.count }
            return base.pages.indices.contains(old) ? current.place(of: base.pages[old].id) : nil
        }
        func number(_ newPage: Int, _ old: Int) -> Int? {
            guard base.pages.indices.contains(page), current.pages.indices.contains(newPage),
                let box = base.pages[page].boxes[old]
            else { return nil }
            let found = current.pages[newPage].boxes.filter { $0.value == box }
            return found.count == 1 ? found.first?.key : nil
        }
        guard let newPage = place(page) else { return nil }
        let change: Change
        switch self.change {
        case .restoreBackup:
            // Never pushed over a newer note: the caller keeps it as the conflict note.
            return nil
        case .movePage(let from, let to):
            guard let newFrom = place(from), let newTo = place(to) else { return nil }
            change = .movePage(from: newFrom, to: newTo)
        case .insertText, .insertPicture, .insertElements, .insertPage:
            change = self.change
        case .removePages(let pages):
            let places = pages.compactMap(place)
            guard places.count == pages.count else { return nil }
            change = .removePages(places.sorted())
        case .deleteElements(let numbers):
            let found = numbers.compactMap { number(newPage, $0) }
            guard found.count == numbers.count else { return nil }
            change = .deleteElements(found.sorted())
        case .placeElements(let placements):
            let found = placements.compactMap { placement in
                number(newPage, placement.number).map { ElementPlacement(number: $0, rect: placement.rect) }
            }
            guard found.count == placements.count else { return nil }
            change = .placeElements(found)
        case .transformElements(let targets):
            let found = targets.compactMap { target -> TransformTarget? in
                switch target {
                case .strokes(let numbers, let matrix):
                    let mapped = numbers.compactMap { number(newPage, $0) }
                    return mapped.count == numbers.count ? .strokes(mapped, matrix) : nil
                case .textBox(let old, let rect):
                    return number(newPage, old).map { .textBox(number: $0, rect: rect) }
                case .picture(let old, let rect, let file):
                    return number(newPage, old).map { .picture(number: $0, rect: rect, file: file) }
                }
            }
            guard found.count == targets.count else { return nil }
            change = .transformElements(found)
        }
        return TabletOperation(note: note, baseHash: baseHash, page: newPage, change: change)
    }
}

/// The name of the copy kept beside a note when an edit cannot be re-targeted (#317).
public enum ConflictName {
    /// `<folder>/<name> conflict <yyyy-MM-dd HH.mm.ss>.note`, in the Mac's time zone.
    public static func path(for note: String, at date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd HH.mm.ss"
        let stem = note.hasSuffix(".note") ? String(note.dropLast(".note".count)) : note
        return "\(stem) conflict \(formatter.string(from: date)).note"
    }
}
