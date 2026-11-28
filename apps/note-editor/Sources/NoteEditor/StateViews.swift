import SwiftUI

/// A state that stands where a page or the tablet's list would be: what happened, in plain words,
/// and the next step (#262). One view draws every state, so they all look alike.
struct StateMessage: Equatable {
    enum Kind {
        case loading, problem, empty
    }

    let kind: Kind
    let title: String
    let detail: String?
    let systemImage: String

    static func loading(_ title: String) -> StateMessage {
        StateMessage(kind: .loading, title: title, detail: nil, systemImage: "hourglass")
    }

    static func unreadable(_ reason: String) -> StateMessage {
        StateMessage(
            kind: .problem, title: Copy.unreadableTitle, detail: "\(reason)\n\n\(Copy.unreadableNext)",
            systemImage: "exclamationmark.triangle")
    }

    /// The reader is turned off in this version (#293): no other file opens either, so the one
    /// next step is the sentence's own, and no Open Another button stands beside it.
    static func turnedOff(_ sentence: String) -> StateMessage {
        StateMessage(kind: .problem, title: Copy.turnedOffTitle, detail: sentence, systemImage: "nosign")
    }

    static let noPages = StateMessage(
        kind: .empty, title: Copy.noPagesTitle, detail: Copy.noPagesNext, systemImage: "doc")

    static let noHeadings = StateMessage(
        kind: .empty, title: Copy.noHeadingsTitle, detail: Copy.noHeadingsNext, systemImage: "list.bullet.indent")

    static func headingsFailed(_ reason: String) -> StateMessage {
        StateMessage(
            kind: .problem, title: Copy.headingsFailedTitle, detail: "\(reason)\n\n\(Copy.headingsFailedNext)",
            systemImage: "exclamationmark.triangle")
    }

    static func pageFailed(_ reason: String) -> StateMessage {
        StateMessage(
            kind: .problem, title: Copy.pageFailedTitle, detail: "\(reason)\n\n\(Copy.pageFailedNext)",
            systemImage: "exclamationmark.triangle")
    }
}

struct StateView<Actions: View>: View {
    let message: StateMessage
    @ViewBuilder var actions: () -> Actions

    init(_ message: StateMessage, @ViewBuilder actions: @escaping () -> Actions) {
        self.message = message
        self.actions = actions
    }

    var body: some View {
        if message.kind == .loading {
            DelayedProgress(title: message.title)
        } else {
            ContentUnavailableView {
                Label {
                    Text(message.title)
                } icon: {
                    // A problem takes the red role, an empty state stays neutral (interface standard rule 15).
                    Image(systemName: message.systemImage)
                        .foregroundStyle(message.kind == .problem ? AnyShapeStyle(.red) : AnyShapeStyle(.secondary))
                }
            } description: {
                if let detail = message.detail {
                    Text(detail)
                }
            } actions: {
                actions()
            }
        }
    }
}

extension StateView where Actions == EmptyView {
    init(_ message: StateMessage) {
        self.init(message) { EmptyView() }
    }
}

/// A wait shows nothing for its first moments and a spinner only after `delay`, so a page that draws
/// at once never flashes one (interface standard rule 6).
struct DelayedProgress: View {
    let title: String
    @Environment(\.progressDelay) private var delay
    @State private var waited = false

    var body: some View {
        ProgressView {
            Text(title)
        }
        .opacity(waited || delay == .zero ? 1 : 0)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            try? await Task.sleep(for: delay)
            waited = true
        }
    }
}

extension EnvironmentValues {
    /// How long a wait stays blank before its spinner shows; the renders set zero to draw it.
    @Entry var progressDelay = Duration.milliseconds(300)
    /// The time the sync line counts from, instead of the clock; the renders fix it so «3 s ago» never reads «4 s» (#472).
    @Entry var syncNow: Date?
}
