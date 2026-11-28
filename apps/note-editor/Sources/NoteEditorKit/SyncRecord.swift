// The editor's one sync record (#448): what was sent to the tablet and received from it, newest
// first, and the one status the window shows. The live pull (#315) and the write path (#313,
// #314) report into it; the view derives its status and its list from it and stores nothing.
import Foundation

/// Which way a sync went.
public enum SyncDirection: Sendable, Equatable {
    /// An edit sent from the Mac to the tablet.
    case sent
    /// The tablet's note pulled to the Mac.
    case received
}

/// The one thing a failed sync offers.
public enum SyncAction: Sendable, Equatable {
    case retry
    case connectTablet
}

/// Why a sync failed, in words the person reads, and the action it offers, if any.
public struct SyncProblem: Sendable, Equatable {
    public let message: String
    public let action: SyncAction?

    public init(message: String, action: SyncAction?) {
        self.message = message
        self.action = action
    }
}

/// How a sync ended, or that it has not.
public enum SyncResult: Sendable, Equatable {
    case inProgress
    case done
    case failed(SyncProblem)
}

/// One sync: its direction, what it carried and when, and its result.
public struct SyncEvent: Sendable, Equatable, Identifiable {
    public let id: Int
    public let direction: SyncDirection
    /// The note's name as the window shows it.
    public let note: String
    /// The page, from 0; nil for the whole note, as a pull or a page move.
    public let page: Int?
    /// When it started, then when it ended.
    public fileprivate(set) var time: Date
    public fileprivate(set) var result: SyncResult
}

/// What the window's one status line says.
public enum SyncStatus: Sendable, Equatable {
    /// Both ways ended well, the newest at this time.
    case upToDate(Date)
    case sending
    case receiving
    /// The newest sync of this direction failed.
    case problem(SyncDirection, SyncProblem)
}

/// The record of one live note's syncs, both ways.
public struct SyncRecord: Sendable, Equatable {
    /// How many events the record keeps and the list shows.
    public static let shown = 10

    /// Newest first, at most `shown`.
    public private(set) var events: [SyncEvent] = []
    /// When a look last found the Mac's copy equal to the tablet's note.
    public private(set) var confirmed: Date?
    private var nextID = 0

    public init() {}

    /// A sync started; its id ends it.
    @discardableResult
    public mutating func began(_ direction: SyncDirection, note: String, page: Int?, at time: Date) -> Int {
        let id = nextID
        nextID += 1
        insert(SyncEvent(id: id, direction: direction, note: note, page: page, time: time, result: .inProgress))
        return id
    }

    /// The sync `id` ended well. An id the record no longer holds changes nothing.
    public mutating func ended(_ id: Int, at time: Date) {
        finish(id, .done, at: time)
    }

    /// The sync `id` failed.
    public mutating func failed(_ id: Int, _ problem: SyncProblem, at time: Date) {
        finish(id, .failed(problem), at: time)
    }

    /// A sync failed before it started, as a look at the tablet that got no answer.
    public mutating func failed(
        _ direction: SyncDirection, note: String, page: Int?, _ problem: SyncProblem, at time: Date
    ) {
        failed(began(direction, note: note, page: page, at: time), problem, at: time)
    }

    /// A look found the Mac's copy equal to the tablet's note: a received failure before it is over.
    public mutating func confirmed(at time: Date) {
        confirmed = time
    }

    /// The status, or nil while nothing is known: never «up to date» before anything synced.
    public var status: SyncStatus? {
        if events.contains(where: { $0.direction == .sent && $0.result == .inProgress }) { return .sending }
        if events.contains(where: { $0.direction == .received && $0.result == .inProgress }) { return .receiving }
        if let sent = problem(.sent) { return .problem(.sent, sent.problem) }
        if let received = problem(.received), confirmed.map({ $0 < received.time }) ?? true {
            return .problem(.received, received.problem)
        }
        let done = events.first { $0.result == .done }?.time
        guard let newest = [done, confirmed].compactMap({ $0 }).max() else { return nil }
        return .upToDate(newest)
    }

    /// The problem of the newest finished sync of `direction` and when it failed, if it failed.
    private func problem(_ direction: SyncDirection) -> (problem: SyncProblem, time: Date)? {
        guard let event = finished(direction), case .failed(let problem) = event.result else { return nil }
        return (problem, event.time)
    }

    private func finished(_ direction: SyncDirection) -> SyncEvent? {
        events.first { $0.direction == direction && $0.result != .inProgress }
    }

    private mutating func finish(_ id: Int, _ result: SyncResult, at time: Date) {
        guard let index = events.firstIndex(where: { $0.id == id }) else { return }
        var event = events.remove(at: index)
        event.time = time
        event.result = result
        // A failure that repeats the newest finished one of its direction replaces it, so a
        // tablet left unplugged fills one row.
        if case .failed = result, let previous = finished(event.direction), previous.result == result,
            previous.note == event.note, previous.page == event.page
        {
            events.removeAll { $0.id == previous.id }
        }
        insert(event)
    }

    /// Puts `event` in time order, newest first, and drops the oldest finished events past `shown`.
    private mutating func insert(_ event: SyncEvent) {
        let index = events.firstIndex { $0.time <= event.time } ?? events.endIndex
        events.insert(event, at: index)
        while events.count > Self.shown, let oldest = events.lastIndex(where: { $0.result != .inProgress }) {
            events.remove(at: oldest)
        }
    }
}

extension InkctlFailure {
    /// The action a sync that failed this way offers: none when there is nothing to try again.
    public var syncAction: SyncAction? {
        switch self {
        case .notConnected: .connectTablet
        case .notFound, .failed: .retry
        case .missing, .cancelled: nil
        }
    }
}

extension WriteFailure {
    /// The action a refused send offers: none when the tablet changed the note, other pages or the
    /// edit's own place (a conflict note, #317), as the person checks the note there first.
    public var syncAction: SyncAction? {
        switch self {
        case .tablet(let failure): failure.syncAction
        case .untouchedPagesChanged, .conflict, .restoreConflict, .conflictNotApplied: nil
        case .staleBase, .openOnTablet, .backup, .macWrite: .retry
        }
    }
}
