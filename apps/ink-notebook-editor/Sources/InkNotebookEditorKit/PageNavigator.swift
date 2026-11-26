// Which page a notebook window shows, and how the page keys move it (#262).

/// A move the page keys and the Go menu ask for.
public enum PageMove: Sendable, CaseIterable {
    case previous, next, first, last
}

/// The current page of a notebook with `pageCount` pages. A move past either end does nothing and
/// never wraps; a notebook with no pages has no current page.
public struct PageNavigator: Sendable, Equatable {
    public let pageCount: Int
    public private(set) var index: Int? {
        // A page turned outside the list's selection leaves it.
        didSet { if let index, !picked.contains(index) { picked = [] } }
    }

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

    /// The pages the page list selects with Command-click or Shift-click (#329).
    public private(set) var picked: Set<Int> = []

    /// The pages a page command acts on: the list's selection when it holds the current page, else
    /// the current page alone. Lowest first.
    public var selectedPages: [Int] {
        guard let index else { return [] }
        return picked.contains(index) ? picked.sorted() : [index]
    }

    /// Takes the page list's selection: the current page becomes the page the click reached, the
    /// far end of the pages it added (a Shift-click down the list ends at its highest), else the
    /// selection's lowest page when the current one left it. Pages outside the notebook are ignored.
    public mutating func pick(_ pages: Set<Int>) {
        let kept = pages.filter((0..<pageCount).contains)
        let added = kept.subtracting(selectedPages)
        let below = added.allSatisfy { $0 > (index ?? 0) }
        picked = kept
        if let page = below ? added.max() : added.min() {
            index = page
        } else if let index, !kept.contains(index), let page = kept.min() {
            self.index = page
        }
    }
}
