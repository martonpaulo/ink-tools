import Foundation
import NoteEditorKit
import NoteFormat
import Observation
import SwiftUI
import os

/// A note opened from the tablet, kept live over the cable (#315): every `NoteWatch.interval` it
/// reads the note's size and time, pulls it into the same local copy when either changed, and
/// hands the new note to the window. Read path only. It runs while its window's task runs, so a
/// closed window stops it.
@Observable
final class LiveNote {
    let tabletPath: String
    let local: URL
    @ObservationIgnored let inkctl: Inkctl
    private(set) var watch: NoteWatch
    @ObservationIgnored var now: () -> Date = Date.init
    /// Whether the window starts the watch; false for a render of a state, which must not reach
    /// the tablet.
    @ObservationIgnored var watches = true
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.noteeditor", category: "live")

    init(tabletPath: String, local: URL, inkctl: Inkctl, watch: NoteWatch = NoteWatch()) {
        self.tabletPath = tabletPath
        self.local = local
        self.inkctl = inkctl
        self.watch = watch
    }

    /// The live note of a window whose file is a copy from the tablet, else nil.
    static func of(_ file: URL?, copies: TabletCopyLocation = TabletBrowser.defaultCopies(), inkctl: Inkctl = .system())
        -> LiveNote?
    {
        guard let file, let path = copies.tabletPath(for: file) else { return nil }
        return LiveNote(tabletPath: path, local: file, inkctl: inkctl)
    }

    /// One look at the tablet: the new note when it changed and its pull ended well, else nil.
    func look() async -> NoteFile? {
        let stamp: NoteStamp
        do {
            stamp = try await inkctl.stamp(of: tabletPath)
        } catch {
            watch.failed(error)
            return nil
        }
        guard watch.needsPull(stamp, at: now()) else { return nil }
        do {
            try await inkctl.pull(tabletPath, to: local)
        } catch {
            watch.failed(error)
            return nil
        }
        do {
            let note = try NoteFile(data: try Data(contentsOf: local))
            watch.pulled(stamp, at: now())
            return note
        } catch {
            logger.error(
                "\(self.tabletPath, privacy: .private): pulled but unreadable: \(String(describing: error), privacy: .public)"
            )
            watch.failed(.failed(Copy.copyUnreadable))
            return nil
        }
    }

    /// Looks at the tablet until the task is cancelled, handing each new note to `changed`.
    func run(_ changed: (NoteFile) -> Void) async {
        while !Task.isCancelled {
            if let note = await look() { changed(note) }
            try? await Task.sleep(for: NoteWatch.interval)
        }
    }
}

/// The line at the bottom of a live note's window: how fresh the copy is, or why it is not, with
/// the next step (#315).
struct SyncStatusLine: View {
    /// The space inside the line, in points.
    static let inset = EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12)

    let live: LiveNote
    /// The edits still on their way to the tablet (#314).
    var sending = 0
    @Environment(\.syncNow) private var fixedNow

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let (synced, symbol, problem) = Self.words(live.watch, now: fixedNow ?? context.date)
            let text = sending > 0 && !problem ? Copy.sendingEdits(sending) : synced
            Label(text, systemImage: sending > 0 && !problem ? "arrow.up.circle" : symbol)
                .symbolRenderingMode(problem ? .multicolor : .hierarchical)
                .font(.callout)
                .monospacedDigit()
                .foregroundStyle(problem ? .primary : .secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Self.inset)
                .background(.bar)
                .overlay(alignment: .top) { Divider() }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
        }
        // A sync that breaks is said aloud, as the line is not in the keyboard's path.
        .onChange(of: live.watch.state) { _, state in
            let (text, _, problem) = Self.words(live.watch, now: .now)
            if problem, state != .syncing { AccessibilityNotification.Announcement(text).post() }
        }
    }

    /// The line's words, its symbol, and whether it names a problem. A problem says which copy the
    /// window still shows.
    static func words(_ watch: NoteWatch, now: Date) -> (String, String, Bool) {
        let shown = watch.syncedAt.map { Copy.showingCopy(from: $0) } ?? ""
        switch watch.state {
        case .syncing:
            return (Copy.syncing, "arrow.triangle.2.circlepath", false)
        case .synced(let time):
            return (Copy.syncedAgo(NoteWatch.secondsAgo(time, now: now)), "checkmark.circle", false)
        case .notConnected:
            return (Copy.tabletNotConnected + shown, "cable.connector.slash", true)
        case .failed(let reason):
            return (Copy.syncFailed(reason) + shown, "exclamationmark.triangle.fill", true)
        }
    }
}
