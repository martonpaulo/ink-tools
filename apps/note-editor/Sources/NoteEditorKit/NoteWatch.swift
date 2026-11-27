// A note opened from the tablet stays live (#315): the Mac reads the note's size and time over
// the cable and pulls it again when either changed. Read path only: nothing is written to the
// tablet.
import Foundation

/// The note on the tablet as a listing shows it: its size and its time.
public struct NoteStamp: Sendable, Equatable {
    public let bytes: Int
    public let modified: String

    public init(bytes: Int, modified: String) {
        self.bytes = bytes
        self.modified = modified
    }
}

/// How fresh the Mac's copy of a live note is.
public enum SyncState: Sendable, Equatable {
    /// A pull runs, or the first one has not ended.
    case syncing
    /// The copy matches the tablet's note as of this time.
    case synced(Date)
    /// No tablet answers, with inkctl's words.
    case notConnected(String)
    /// The note is gone or inkctl failed, with its words.
    case failed(String)
}

/// The watch of one live note: which stamp the copy holds, and whether a new stamp needs a pull.
public struct NoteWatch: Sendable, Equatable {
    /// How long the watch waits between two looks at the tablet.
    public static let interval: Duration = .seconds(2)

    /// The stamp of the last good pull; `nil` before the first.
    public private(set) var copied: NoteStamp?
    /// When the copy last matched the tablet.
    public private(set) var syncedAt: Date?
    public private(set) var state: SyncState = .syncing

    public init() {}

    /// Whether the note on the tablet, as `stamp` shows it, needs a pull: it differs from the
    /// copy. A note whose last pull failed needs one again, which is the retry; an unchanged
    /// note is synced as of now.
    public mutating func needsPull(_ stamp: NoteStamp, at time: Date) -> Bool {
        guard stamp != copied else {
            syncedAt = time
            state = .synced(time)
            return false
        }
        state = .syncing
        return true
    }

    /// The pull of `stamp` ended well at `time`.
    public mutating func pulled(_ stamp: NoteStamp, at time: Date) {
        copied = stamp
        syncedAt = time
        state = .synced(time)
    }

    /// A look or a pull failed: the copy keeps its last good stamp, so the next look tries again.
    public mutating func failed(_ failure: InkctlFailure) {
        switch failure {
        case .notConnected(let message): state = .notConnected(message)
        case .notFound(let message), .failed(let message): state = .failed(message)
        case .missing: state = .failed(String(localized: "inkctl is not installed."))
        case .cancelled: break
        }
    }

    /// The whole seconds from `time` to `now`, never below zero.
    public static func secondsAgo(_ time: Date, now: Date) -> Int {
        max(Int(now.timeIntervalSince(time).rounded(.down)), 0)
    }
}
