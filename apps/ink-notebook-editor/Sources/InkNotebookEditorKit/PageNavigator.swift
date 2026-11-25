// Which page a notebook window shows, and how the page keys move it (#262).

/// A move the page keys and the Go menu ask for.
public enum PageMove: Sendable, CaseIterable {
    case previous, next, first, last
}

/// The current page of a notebook with `pageCount` pages. A move past either end does nothing and
/// never wraps; a notebook with no pages has no current page.
public struct PageNavigator: Sendable, Equatable {
    public let pageCount: Int
    public private(set) var index: Int?

    public init(pageCount: Int, index: Int = 0) {
        self.pageCount = max(pageCount, 0)
        self.index = pageCount > 0 ? min(max(index, 0), pageCount - 1) : nil
    }

    /// Whether `move` would change the current page, for the Go menu's enabled state.
    public func allows(_ move: PageMove) -> Bool {
        guard let index else { return false }
        switch move {
        case .previous, .first: return index > 0
        case .next, .last: return index < pageCount - 1
        }
    }

    public mutating func go(_ move: PageMove) {
        guard let index, allows(move) else { return }
        switch move {
        case .previous: self.index = index - 1
        case .next: self.index = index + 1
        case .first: self.index = 0
        case .last: self.index = pageCount - 1
        }
    }

    /// Selects a page by its index, as a click in the page list does; an index outside the
    /// notebook is ignored.
    public mutating func show(_ page: Int) {
        guard (0..<pageCount).contains(page) else { return }
        index = page
    }
}
