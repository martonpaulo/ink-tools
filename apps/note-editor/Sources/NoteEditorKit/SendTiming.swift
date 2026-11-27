// The time of each send, step by step (#530): how long the edit waited in the queue, each tablet
// call, and the rest on the Mac, so a slow send names its slow step in the app's log.
import Foundation

/// One send's time.
public struct SendTiming: Sendable, Equatable {
    /// One tablet call of the send and how long it took.
    public struct Step: Sendable, Equatable {
        public let name: String
        public let duration: Duration

        public init(name: String, duration: Duration) {
            self.name = name
            self.duration = duration
        }
    }

    /// From the moment the edit joined the queue to the start of its send.
    public let waited: Duration
    /// The tablet calls, in order.
    public let steps: [Step]
    /// From the start of the send to the tablet's answer, all steps included.
    public let total: Duration

    public init(waited: Duration, steps: [Step], total: Duration) {
        self.waited = waited
        self.steps = steps
        self.total = total
    }

    /// The send's time outside the tablet calls: the backup, the hashes, the Mac's write and the
    /// page check.
    public var onMac: Duration {
        total - steps.reduce(Duration.zero) { $0 + $1.duration }
    }

    /// One log line, every time in seconds with one decimal.
    public var line: String {
        let parts =
            ["waited \(Self.seconds(waited))"] + steps.map { "\($0.name) \(Self.seconds($0.duration))" }
            + ["on the Mac \(Self.seconds(onMac))", "total \(Self.seconds(total))"]
        return parts.joined(separator: ", ")
    }

    static func seconds(_ duration: Duration) -> String {
        let (whole, fraction) = duration.components
        let value = Double(whole) + Double(fraction) / 1e18
        return String(format: "%.1f s", value)
    }
}

/// Writes one send's timing to the app's log, read with
/// `log show --predicate 'eventMessage BEGINSWITH "Note Editor send:"'` (#530); `NSLog`, as this
/// module imports only Foundation and CoreGraphics.
public func logSendTiming(_ timing: SendTiming) {
    NSLog("Note Editor send: %@", timing.line)
}

/// The tablet calls of a write path, each timed (#530): the sender takes the steps of one send.
public final class TimedTablet: TabletWriting, @unchecked Sendable {
    let tablet: any TabletWriting
    let now: @Sendable () -> ContinuousClock.Instant
    private let lock = NSLock()
    private var steps: [SendTiming.Step] = []

    public init(
        _ tablet: any TabletWriting, now: @escaping @Sendable () -> ContinuousClock.Instant = { .now }
    ) {
        self.tablet = tablet
        self.now = now
    }

    /// The steps timed since the last take.
    public func take() -> [SendTiming.Step] {
        lock.withLock {
            defer { steps = [] }
            return steps
        }
    }

    func record(_ name: String, since started: ContinuousClock.Instant) {
        let step = SendTiming.Step(name: name, duration: now() - started)
        lock.withLock { steps.append(step) }
    }

    public func edit(note: String, operations: URL) async throws(InkctlFailure) -> EditAnswer {
        let started = now()
        do {
            let answer = try await tablet.edit(note: note, operations: operations)
            record("edit", since: started)
            return answer
        } catch {
            record("edit (failed)", since: started)
            throw error
        }
    }

    public func push(_ local: URL, to note: String) async throws(InkctlFailure) {
        let started = now()
        do {
            try await tablet.push(local, to: note)
            record("push", since: started)
        } catch {
            record("push (failed)", since: started)
            throw error
        }
    }

    public func pull(_ note: String, to destination: URL) async throws(InkctlFailure) {
        let started = now()
        do {
            try await tablet.pull(note, to: destination)
            record("pull", since: started)
        } catch {
            record("pull (failed)", since: started)
            throw error
        }
    }

    public func templates() async throws(InkctlFailure) -> [PageTemplateChoice] {
        try await tablet.templates()
    }
}
