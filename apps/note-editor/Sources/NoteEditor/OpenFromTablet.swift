import NoteEditorKit
import SwiftUI
import os

/// File › Open from Tablet (#262): lists the tablet's notes through `inkctl files ls`, copies the
/// chosen one with `inkctl files pull` and opens the copy. The tablet's file is never changed:
/// every call passes --read-only.
@Observable
final class TabletBrowser {
    enum Phase: Equatable {
        case loading
        case listed(TabletListing)
        case copying(String)
        /// Listing the folder failed.
        case failed(InkctlFailure)
        /// Copying the chosen note failed.
        case copyFailed(InkctlFailure)
        /// The copy arrived but did not open, with the reason.
        case openFailed(String)
    }

    private(set) var folder: [String] = [TabletListing.notesFolder]
    var phase: Phase = .loading
    var selection: TabletEntry.ID?
    /// Whether the window reads the tablet each time it opens; the renders turn it off to keep a state.
    var loadsOnAppear = true

    private let inkctl: Inkctl
    private let copies: TabletCopyLocation
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.noteeditor", category: "tablet")

    init(inkctl: Inkctl, copies: TabletCopyLocation) {
        self.inkctl = inkctl
        self.copies = copies
    }

    /// The local copies live in the app's own Application Support folder.
    static func defaultCopies() -> TabletCopyLocation {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return TabletCopyLocation(root: AppFolders.fromTablet(in: support))
    }

    var path: String { folder.joined(separator: "/") }
    var canGoUp: Bool { folder.count > 1 }

    var selectedEntry: TabletEntry? {
        guard case .listed(let listing) = phase else { return nil }
        return listing.entries.first { $0.id == selection }
    }

    func load() async {
        phase = .loading
        selection = nil
        do {
            phase = .listed(try await inkctl.list(folder: path))
        } catch {
            logger.error("listing failed: \(String(describing: error), privacy: .public)")
            phase = .failed(error)
        }
    }

    func goUp() async {
        guard canGoUp else { return }
        folder.removeLast()
        await load()
    }

    /// Opens a folder in place, or copies a note and returns its local file for the caller to open.
    func choose(_ entry: TabletEntry) async -> URL? {
        if entry.isFolder {
            folder.append(entry.name)
            await load()
            return nil
        }
        let tabletPath = "\(path)/\(entry.name)"
        guard let local = copies.localURL(for: tabletPath) else {
            phase = .copyFailed(.failed(Copy.cannotCopy(tabletPath)))
            return nil
        }
        let listed = phase
        phase = .copying(entry.name)
        do {
            try await inkctl.pull(tabletPath, to: local)
            phase = listed
            return local
        } catch .cancelled {
            phase = listed
            return nil
        } catch {
            logger.error("pull failed: \(String(describing: error), privacy: .public)")
            phase = .copyFailed(error)
            return nil
        }
    }

    /// The copy arrived but the document did not open.
    func openFailed(_ local: URL, _ error: any Error) {
        logger.error("open failed: \(error.localizedDescription, privacy: .public)")
        phase = .openFailed(Copy.cannotOpen(local.path(percentEncoded: false), error.localizedDescription))
    }
}

struct OpenFromTabletView: View {
    @Bindable var browser: TabletBrowser
    @Environment(\.openDocument) private var openDocument
    @Environment(\.dismissWindow) private var dismissWindow
    /// The copy in progress, so Cancel and closing the window stop it.
    @State private var copy: Task<Void, Never>?

    static let windowID = "open-from-tablet"

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            footer
        }
        .frame(minWidth: 480, idealWidth: 560, minHeight: 360, idealHeight: 440)
        .task {
            if browser.loadsOnAppear { await browser.load() }
        }
        .onDisappear { copy?.cancel() }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button {
                Task { await browser.goUp() }
            } label: {
                Label(Copy.enclosingFolder, systemImage: "chevron.backward")
                    .labelStyle(.iconOnly)
            }
            .help(Copy.enclosingFolder)
            .accessibilityLabel(Copy.enclosingFolder)
            .disabled(!browser.canGoUp)
            .keyboardShortcut(.upArrow, modifiers: .command)
            Text(browser.path)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.head)
                .help(browser.path)
                .accessibilityLabel(browser.path)
            Spacer()
            Button {
                Task { await browser.load() }
            } label: {
                Label(Copy.refresh, systemImage: "arrow.clockwise")
                    .labelStyle(.iconOnly)
            }
            .help(Copy.refresh)
            .accessibilityLabel(Copy.refresh)
            .keyboardShortcut("r", modifiers: .command)
        }
        .padding(12)
    }

    @ViewBuilder private var content: some View {
        switch browser.phase {
        case .loading:
            StateView(.loading(Copy.loadingTablet))
        case .copying(let name):
            StateView(.loading(Copy.copying(name)))
        case .failed(.notFound(let reason)) where browser.canGoUp:
            StateView(TabletMessages.message(for: .notFound(reason))) {
                Button(Copy.enclosingFolder) { Task { await browser.goUp() } }
                    .keyboardShortcut(.defaultAction)
            }
        case .failed(let failure):
            StateView(TabletMessages.message(for: failure)) { tryAgain }
        case .copyFailed(let failure):
            StateView(TabletMessages.message(forCopy: failure)) { tryAgain }
        case .openFailed(let reason):
            StateView(TabletMessages.openFailed(reason)) { tryAgain }
        case .listed(let listing) where listing.entries.isEmpty:
            StateView(TabletMessages.noNotes) {
                Button(Copy.refresh) { Task { await browser.load() } }
            }
        case .listed(let listing):
            List(listing.entries, selection: $browser.selection) { entry in
                TabletRow(entry: entry)
            }
            .contextMenu(forSelectionType: TabletEntry.ID.self) { _ in
            } primaryAction: { ids in
                if let id = ids.first, let entry = listing.entries.first(where: { $0.id == id }) {
                    open(entry)
                }
            }
            .accessibilityLabel(browser.path)
        }
    }

    private var tryAgain: some View {
        Button(Copy.tryAgain) { Task { await browser.load() } }
            .keyboardShortcut(.defaultAction)
    }

    private var footer: some View {
        HStack {
            Text(Copy.tabletHint)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            Button(Copy.cancel) {
                copy?.cancel()
                dismissWindow(id: Self.windowID)
            }
            .keyboardShortcut(.cancelAction)
            Button(Copy.open) {
                if let entry = browser.selectedEntry { open(entry) }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(browser.selectedEntry == nil)
        }
        .padding(12)
    }

    private func open(_ entry: TabletEntry) {
        copy?.cancel()
        copy = Task {
            guard let local = await browser.choose(entry), !Task.isCancelled else { return }
            do {
                try await openDocument(at: local)
                dismissWindow(id: Self.windowID)
            } catch {
                browser.openFailed(local, error)
            }
        }
    }
}

/// The states of the tablet list, each with its next step.
enum TabletMessages {
    static let noNotes = StateMessage(
        kind: .empty, title: Copy.noNotesTitle, detail: Copy.noNotesNext, systemImage: "tray")

    static func message(for failure: InkctlFailure) -> StateMessage {
        switch failure {
        case .missing:
            StateMessage(kind: .problem, title: Copy.missingTitle, detail: Copy.missingNext, systemImage: "terminal")
        case .notConnected(let reason):
            StateMessage(
                kind: .problem, title: Copy.notConnectedTitle, detail: "\(reason)\n\n\(Copy.notConnectedNext)",
                systemImage: "cable.connector.slash")
        case .notFound(let reason):
            StateMessage(
                kind: .problem, title: Copy.notFoundTitle, detail: "\(reason)\n\n\(Copy.notFoundNext)",
                systemImage: "questionmark.folder")
        case .failed(let reason):
            problem(Copy.failedTitle, reason)
        case .cancelled:
            problem(Copy.failedTitle, Copy.cancelled)
        }
    }

    /// A failed copy keeps the named states, and names the copy for any other failure.
    static func message(forCopy failure: InkctlFailure) -> StateMessage {
        guard case .failed(let reason) = failure else { return message(for: failure) }
        return problem(Copy.copyFailedTitle, reason)
    }

    static func openFailed(_ reason: String) -> StateMessage {
        problem(Copy.openFailedTitle, reason)
    }

    private static func problem(_ title: String, _ reason: String) -> StateMessage {
        StateMessage(
            kind: .problem, title: title, detail: "\(reason)\n\n\(Copy.failedNext)",
            systemImage: "exclamationmark.triangle")
    }
}

private struct TabletRow: View {
    let entry: TabletEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: entry.isFolder ? "folder" : "doc.text")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(entry.name)
                .lineLimit(1)
                .help(entry.name)
            Spacer()
            Text(entry.isFolder ? Copy.folderKind : entry.bytes.formatted(.byteCount(style: .file)))
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}
