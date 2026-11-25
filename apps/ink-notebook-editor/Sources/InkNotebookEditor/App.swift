import InkNotebookEditorKit
import SwiftUI

/// The composition root: a read-only document app for `.note` notebooks (#262). File › Open, Open
/// Recent and the Dock icon come with `DocumentGroup(viewing:)` and Support/Info.plist's document
/// type; File › Open from Tablet opens its own window.
@main
struct InkNotebookEditorApp: App {
    @State private var tablet = TabletBrowser(inkctl: .system(), copies: TabletBrowser.defaultCopies())

    var body: some Scene {
        DocumentGroup(viewing: NoteDocument.self) { file in
            NotebookWindow(document: file.document)
        }
        .commands {
            CommandGroup(after: .newItem) {
                OpenFromTabletCommand()
            }
            CommandMenu(Copy.goMenu) {
                GoCommands()
            }
            CommandGroup(replacing: .help) {
                ReportIssueCommand()
            }
        }

        Window(Copy.openFromTabletTitle, id: OpenFromTabletView.windowID) {
            OpenFromTabletView(browser: tablet)
        }
        .windowResizability(.contentMinSize)
        .defaultSize(width: 560, height: 440)
    }
}

private struct OpenFromTabletCommand: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button(Copy.openFromTablet) {
            openWindow(id: OpenFromTabletView.windowID)
        }
        .keyboardShortcut("o", modifiers: [.command, .shift])
    }
}

/// The Go menu: the page keys, named and discoverable, for the notebook window in front.
private struct GoCommands: View {
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        item(Copy.previousPage, .previous, KeyboardShortcut(.upArrow, modifiers: [.option, .command]))
        item(Copy.nextPage, .next, KeyboardShortcut(.downArrow, modifiers: [.option, .command]))
        Divider()
        item(Copy.firstPage, .first, KeyboardShortcut(.home, modifiers: []))
        item(Copy.lastPage, .last, KeyboardShortcut(.end, modifiers: []))
    }

    private func item(_ title: String, _ move: PageMove, _ shortcut: KeyboardShortcut) -> some View {
        Button(title) { navigator?.wrappedValue.go(move) }
            .keyboardShortcut(shortcut)
            .disabled(navigator?.wrappedValue.allows(move) != true)
    }
}

/// Help › Report an Issue…: the repository's bug form with this build's version filled in.
private struct ReportIssueCommand: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button(Copy.reportIssue) {
            let info = Bundle.main.infoDictionary ?? [:]
            let system = ProcessInfo.processInfo.operatingSystemVersion
            let url = IssueReport.url(
                version: info["CFBundleShortVersionString"] as? String ?? "unknown",
                build: info["CFBundleVersion"] as? String ?? "unknown",
                releaseDate: info["AppReleaseDate"] as? String,
                macOS: "\(system.majorVersion).\(system.minorVersion).\(system.patchVersion)")
            if let url { openURL(url) }
        }
    }
}
